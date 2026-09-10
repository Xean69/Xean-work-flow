import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// See the identical constant in maintenanceChat.js: this call runs
// synchronously in the same tenant-facing request (portal.js's
// classifyAndPromote fires immediately after the pending-chat reply above,
// for any outcome other than "continue" -- including the timeout fallback
// itself). Without this, a stalled call here would add another ~10-30
// minutes on top of that one, even after the first timeout already kicked
// in.
const AI_REQUEST_OPTIONS = { timeout: 15_000, maxRetries: 1 };

const TRADES = ["plumbing", "electrical", "hvac", "appliance", "structural", "pest_control", "locksmith", "general"];

const TOOL = {
  name: "classify_maintenance_request",
  description: "Classify a tenant maintenance request by urgency and trade.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      urgency: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high: a safety/health hazard or risk of major property damage — no heat, no hot water, gas smell, active leak or flooding, electrical hazard, no working smoke/CO detector, being locked out. medium: a real functional problem that should be fixed soon but isn't dangerous — a broken appliance, a minor leak, a running toilet, AC/heat trouble in mild weather. low: cosmetic or convenience issues with no real urgency — a squeaky hinge, a burnt-out bulb, minor cosmetic wear.",
      },
      trade: {
        type: "string",
        enum: TRADES,
        description: "The type of tradesperson best suited to this repair. Use general when it doesn't clearly fit a specific trade.",
      },
      reasoning: {
        type: "string",
        description:
          "One brief sentence explaining the urgency call, naming the specific detail from the request that drove it (e.g. \"no hot water reported — health/safety concern\").",
      },
    },
    required: ["urgency", "trade", "reasoning"],
    additionalProperties: false,
  },
};

// Runs one classification pass and returns a plain outcome object — it
// never throws, so a flaky API call or a description too vague to classify
// degrades to status: "failed" instead of blocking ticket creation.
export async function classifyMaintenanceRequest(title, description) {
  try {
    const response = await anthropic.messages.create(
      {
        model: "claude-opus-5",
        max_tokens: 512,
        output_config: { effort: "low" },
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [
          {
            role: "user",
            content: `Classify this tenant maintenance request using the ${TOOL.name} tool.\n\nTitle: ${title}\nDescription: ${description || "(no description provided)"}`,
          },
        ],
      },
      AI_REQUEST_OPTIONS
    );

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) return { status: "failed", urgency: null, trade: null, reasoning: null };

    const { urgency, trade, reasoning } = toolUse.input;
    return { status: "success", urgency, trade, reasoning };
  } catch (err) {
    console.error("Maintenance triage classification failed:", err);
    return { status: "failed", urgency: null, trade: null, reasoning: null };
  }
}
