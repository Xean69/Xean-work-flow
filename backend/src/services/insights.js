import Anthropic from "@anthropic-ai/sdk";
import pool from "../db.js";

const anthropic = new Anthropic();

// pg returns DATE columns as JS Date objects (midnight UTC), not strings —
// normalized to plain "YYYY-MM-DD" everywhere below so string comparisons
// ("<" against today) and month-bucketing work, and so what's sent to
// Claude reads as a date, not a misleading full ISO timestamp.
function toISODate(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

// Same day-math approach as tenants.js/strLicenses.js: derive status from a
// date at read time rather than trust a stored value that could go stale.
function licenseStatus(expiryDate) {
  if (!expiryDate) return "unlicensed";
  return toISODate(expiryDate) < toISODate(new Date()) ? "expired" : "active";
}

function monthBucket(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
}

// Pulls together everything the model needs to reason about the portfolio
// with real numbers instead of guessing: current rent, full lease history
// per unit (turnover), whether a unit has ever run as a short-term stay,
// each property's city/province and STR license status, and a pre-computed
// list of months where multiple leases end close together (renewal
// clustering) — computed here in JS rather than left for the model to spot
// in a raw date list, since exact date-bucketing is exactly the kind of
// thing code should do reliably and an LLM shouldn't be trusted to eyeball.
export async function gatherPortfolioData(businessId) {
  const [{ rows: properties }, { rows: units }, { rows: tenants }, { rows: stays }, { rows: licenses }] =
    await Promise.all([
      pool.query(
        "SELECT id, name, city, province FROM properties WHERE business_id = $1 ORDER BY name",
        [businessId]
      ),
      pool.query(
        `SELECT u.id AS unit_id, u.unit_number, u.rent_amount AS current_rent, u.status, u.property_id
         FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.business_id = $1
         ORDER BY p.name, u.unit_number`,
        [businessId]
      ),
      pool.query(
        `SELECT t.id, t.unit_id, t.lease_start, t.lease_end, t.rent_amount,
           COALESCE((
             SELECT SUM(ta.quantity * pa.monthly_price)
             FROM tenant_addons ta JOIN property_addons pa ON pa.id = ta.addon_id
             WHERE ta.tenant_id = t.id
           ), 0) AS monthly_addon_revenue
         FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.business_id = $1
         ORDER BY t.unit_id, t.lease_start`,
        [businessId]
      ),
      pool.query(
        `SELECT s.unit_id, s.platform, s.checkout_date, s.next_checkin_date
         FROM stays s JOIN units u ON u.id = s.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.business_id = $1
         ORDER BY s.unit_id, s.checkout_date DESC`,
        [businessId]
      ),
      pool.query(
        `SELECT DISTINCT ON (property_id) property_id, license_number, issued_date, expiry_date
         FROM str_licenses
         WHERE business_id = $1
         ORDER BY property_id, issued_date DESC, created_at DESC`,
        [businessId]
      ),
    ]);

  const tenantsByUnit = new Map();
  for (const t of tenants) {
    t.lease_start = toISODate(t.lease_start);
    t.lease_end = toISODate(t.lease_end);
    if (!tenantsByUnit.has(t.unit_id)) tenantsByUnit.set(t.unit_id, []);
    tenantsByUnit.get(t.unit_id).push(t);
  }
  const staysByUnit = new Map();
  for (const s of stays) {
    s.checkout_date = toISODate(s.checkout_date);
    s.next_checkin_date = toISODate(s.next_checkin_date);
    if (!staysByUnit.has(s.unit_id)) staysByUnit.set(s.unit_id, []);
    staysByUnit.get(s.unit_id).push(s);
  }
  const licenseByProperty = new Map(licenses.map((l) => [l.property_id, l]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  const unitPayload = units.map((u) => {
    const property = propertyById.get(u.property_id);
    const leaseHistory = (tenantsByUnit.get(u.unit_id) || []).map((t) => ({
      lease_start: t.lease_start,
      lease_end: t.lease_end,
      rent_amount: Number(t.rent_amount),
      monthly_addon_revenue: Number(t.monthly_addon_revenue),
    }));
    const unitStays = staysByUnit.get(u.unit_id) || [];
    return {
      unit_id: u.unit_id,
      label: `${property?.name ?? "Unknown property"} Unit ${u.unit_number}`,
      city: property?.city ?? null,
      province: property?.province ?? null,
      current_rent: Number(u.current_rent),
      occupancy_status: u.status,
      turnover_count: leaseHistory.length,
      lease_history: leaseHistory,
      short_term_stay_usage: {
        ever_used: unitStays.length > 0,
        stay_count: unitStays.length,
        platforms: [...new Set(unitStays.map((s) => s.platform))],
        most_recent_checkout: unitStays[0]?.checkout_date ?? null,
      },
    };
  });

  // Renewal clustering: months (today or later) where 2+ leases across the
  // portfolio end, i.e. a real risk of several units turning over at once.
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEndsByMonth = new Map();
  for (const t of tenants) {
    if (t.lease_end < today) continue;
    const month = monthBucket(t.lease_end);
    if (!upcomingEndsByMonth.has(month)) upcomingEndsByMonth.set(month, []);
    upcomingEndsByMonth.get(month).push({
      unit_id: t.unit_id,
      lease_end: t.lease_end,
    });
  }
  const renewalClustering = [...upcomingEndsByMonth.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([month, list]) => ({
      month,
      lease_count: list.length,
      units: list.map((l) => unitPayload.find((u) => u.unit_id === l.unit_id)?.label).filter(Boolean),
    }));

  return {
    property_count: properties.length,
    unit_count: units.length,
    properties: properties.map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      province: p.province,
      str_license_status: licenseStatus(licenseByProperty.get(p.id)?.expiry_date),
    })),
    units: unitPayload,
    renewal_clustering: renewalClustering,
  };
}

const TOOL = {
  name: "record_portfolio_insights",
  description: "Record the AI-generated insights for a property management portfolio, or an honest note if the data is too thin to say anything specific.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      insufficient_data: {
        type: "boolean",
        description:
          "true if the portfolio doesn't have enough real data (e.g. only one property, no lease history, no stay history, nothing to compare) to produce specific, well-supported insights. When true, insights must be an empty array — do not invent generic property-management advice to fill the gap.",
      },
      note: {
        type: ["string", "null"],
        description:
          "Required (non-null) when insufficient_data is true: one or two honest sentences on what's missing and roughly what would unlock useful insights (e.g. more lease history, more properties). Null when insufficient_data is false.",
      },
      insights: {
        type: "array",
        description:
          "At most 5 insights, fewer is fine, empty is fine. Every insight must be specific to this portfolio's actual data — a real unit, a real date, a real number — never generic advice like 'consider raising rents' with nothing behind it. Prefer zero insights over a weak one.",
        items: {
          type: "object",
          properties: {
            icon: { type: "string", description: "A single emoji that fits the insight." },
            title: { type: "string", description: "Short, specific headline naming the actual unit/property/pattern." },
            description: {
              type: "string",
              description: "1-3 sentences explaining the insight and what it means for the owner/manager.",
            },
            reasoning: {
              type: "string",
              description:
                "The specific data this is based on — cite real numbers, unit labels, and dates from the input. If part of the insight relies on your own general market knowledge rather than data given to you (e.g. estimating short-term rental rates, since none were provided), say so explicitly here rather than presenting it as a hard fact.",
            },
            figures: {
              type: "array",
              description: "0-4 short supporting figures to display alongside the insight. Empty array if none apply.",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                },
                required: ["label", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["icon", "title", "description", "reasoning", "figures"],
          additionalProperties: false,
        },
      },
    },
    required: ["insufficient_data", "note", "insights"],
    additionalProperties: false,
  },
};

// Runs one generation pass against the given portfolio data and returns a
// plain outcome object — it never throws, so a flaky API call degrades to
// status: "failed" instead of breaking the regenerate request that called
// it.
export async function generatePortfolioInsights(portfolioData) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "high" },
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `You're analyzing a residential property management portfolio to surface genuinely useful, specific insights for the owner/manager — not generic property-management advice.

Here is the portfolio's real data, gathered from the app's own records:

${JSON.stringify(portfolioData, null, 2)}

Guidance:
- Only report what this specific data actually supports. Cite real unit labels, dates, and numbers in your reasoning.
- Where you don't have a hard number (e.g. this portfolio has no recorded short-term rental income, only whether a unit has ever been used for one), you may use your own general knowledge of typical rental markets to give a rough estimate — but say clearly in the reasoning that it's an estimate from general market knowledge, not data from this account.
- renewal_clustering in the data is already computed for you: months where 2+ leases end close together. Only surface it as an insight if it looks like a genuine vacancy-crunch risk worth the manager's attention.
- If the portfolio is too small or too thin (few properties/units, little or no lease history, no comparison points) to say anything specific and well-supported, set insufficient_data to true and explain briefly what's missing — do not pad the response with generic advice to compensate.
- Use the ${TOOL.name} tool to record your response.`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) return { status: "failed" };

    return { status: "success", ...toolUse.input };
  } catch (err) {
    console.error("Portfolio insight generation failed:", err);
    return { status: "failed" };
  }
}
