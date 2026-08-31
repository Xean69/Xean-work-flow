import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// ============================================================================
// Generate mode — AI drafts the lease from scratch.
//
// The section spine is fixed by us, not chosen by the model — the model
// only ever fills in the body text of a section that already has a name
// and a place in the document, never invents document structure. Each key
// below becomes one required string property in the forced tool schema.
//
// JURISDICTION_SENSITIVE marks the sections whose specifics (deposit
// handling limits, notice periods, eviction process, etc.) vary by
// province/state and change over time — the system prompt instructs the
// model to never state a specific number/period/limit for these as
// settled fact, instead writing a bracketed placeholder for a human to
// confirm locally. This mirrors the existing maintenanceChat.js pattern of
// a hard-coded safe/unsafe split enforced in the prompt rather than left to
// the model's judgment call at runtime.
// ============================================================================
const SECTION_LABELS = {
  parties: "Parties",
  premises: "Premises",
  term: "Term",
  rent: "Rent",
  security_deposit: "Security Deposit",
  occupants: "Occupants",
  utilities_and_services: "Utilities and Services",
  use_of_premises_and_rules: "Use of Premises and Rules",
  maintenance_and_repairs: "Maintenance and Repairs",
  right_of_entry: "Right of Entry",
  insurance: "Insurance",
  default_and_remedies: "Default and Remedies",
  termination_and_notice: "Termination and Notice to Vacate",
  governing_law: "Governing Law",
  entire_agreement: "Entire Agreement",
};

const JURISDICTION_SENSITIVE = new Set([
  "security_deposit",
  "utilities_and_services",
  "use_of_premises_and_rules",
  "maintenance_and_repairs",
  "right_of_entry",
  "insurance",
  "default_and_remedies",
  "termination_and_notice",
  "governing_law",
]);

const GENERATE_TOOL = {
  name: "draft_lease_sections",
  description: "Submit the drafted body text for every section of a residential lease.",
  // Not strict:true — 15 required string properties plus an enum-item
  // array exceeds Claude's strict-schema complexity limit (confirmed via a
  // "Schema is too complex" 400). checkRequiredKeys() below is the safety
  // net that catches a dropped/renamed key without that guarantee, same
  // workaround translate-locales.mjs already uses for its own
  // nested/expanded schemas.
  input_schema: {
    type: "object",
    properties: {
      ...Object.fromEntries(
        Object.keys(SECTION_LABELS).map((key) => [
          key,
          { type: "string", description: `Body text for the "${SECTION_LABELS[key]}" section.` },
        ])
      ),
    },
    required: Object.keys(SECTION_LABELS),
    additionalProperties: false,
  },
};

// Detected directly from the body text rather than trusted as a separate
// self-reported field — an earlier version asked the model to also list
// which section keys it used a placeholder in, but that list came back
// empty even on responses whose body text clearly contained
// "[CONFIRM LOCAL NOTICE PERIOD]"-style brackets: two independent outputs
// the model has to keep in sync are exactly the kind of thing that drifts.
// Scanning the text it actually wrote can't desync from itself.
const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9 /'-]{3,80}\]/;

function containsPlaceholder(body) {
  return PLACEHOLDER_RE.test(body);
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function buildFactsBlock({
  tenantName,
  occupants,
  propertyAddress,
  unitNumber,
  rentAmount,
  depositAmount,
  leaseStart,
  leaseEnd,
  province,
  customTerms,
}) {
  const lines = [
    `Tenant name: ${tenantName}`,
    `Additional occupants: ${occupants.length ? occupants.map((o) => `${o.full_name}${o.relationship ? ` (${o.relationship})` : ""}`).join(", ") : "None"}`,
    `Premises: ${propertyAddress}, Unit ${unitNumber}`,
    `Monthly rent: ${formatMoney(rentAmount)}`,
    `Security deposit: ${formatMoney(depositAmount)}`,
    `Lease start: ${leaseStart}`,
    `Lease end: ${leaseEnd}`,
    `Jurisdiction (province/state): ${province || "not specified"}`,
  ];
  if (customTerms) lines.push(`Additional terms the manager wants reflected: ${customTerms}`);
  return lines.join("\n");
}

// Throws on any failure (missing tool call, an incomplete section) rather
// than degrading to a partial/sentinel result the way extraction.js does —
// unlike a failed extraction (which can fall back to "unsupported" and
// leave the rest of the document upload intact), a lease draft with
// missing sections has no safe partial state to hand back. The route
// catches this and turns it into a clear 502, same as a Cloudinary upload
// failure elsewhere in this codebase.
export async function generateLeaseContent(facts) {
  const factsBlock = buildFactsBlock(facts);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    // 15 full section paragraphs plus tool-call JSON overhead comfortably
    // exceeds the default budget — this was measured hitting the cap
    // mid-section during testing, dropping the last few required fields
    // and failing the parity check below instead of returning malformed
    // content.
    max_tokens: 8192,
    output_config: { effort: "high" },
    tools: [GENERATE_TOOL],
    tool_choice: { type: "tool", name: GENERATE_TOOL.name },
    system: `You are drafting a residential lease agreement for a property management app. This document may be signed by a real tenant and relied on as a binding contract — treat it accordingly.

Facts to use (never invent facts not given here):
${factsBlock}

Rules, by section type:
- Factual sections (parties, premises, term, rent, occupants, entire_agreement) — restate the facts above in standard, conservative lease phrasing. Low risk: you're not making a legal judgment call, just formatting known facts.
- Jurisdiction-sensitive sections (${[...JURISDICTION_SENSITIVE].map((k) => SECTION_LABELS[k]).join(", ")}) — these vary by province/state and change over time. Write generally-worded, conservative, widely-used boilerplate for the clause itself, but NEVER state a specific number, dollar limit, or time period (notice days, deposit interest rules, eviction timelines, etc.) as settled fact unless it was explicitly given to you in the facts above. Instead write a clearly bracketed ALL-CAPS placeholder in the body text itself, e.g. "written notice of at least [CONFIRM LOCAL NOTICE PERIOD] days". Do not guess a plausible-sounding number — an incorrect specific is worse than an honest placeholder.
- Keep each section's body to a few sentences to a short paragraph — this is a lease clause, not an essay.
- Plain text only, no markdown headers or bullet lists inside a section's body.`,
    messages: [
      {
        role: "user",
        content:
          "Draft the body text for every section listed in the draft_lease_sections tool, following the rules above exactly.",
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("No draft returned");

  const bodies = toolUse.input;
  const missing = Object.keys(SECTION_LABELS).filter((key) => typeof bodies[key] !== "string" || !bodies[key].trim());
  if (missing.length) throw new Error(`Lease draft is missing section(s): ${missing.join(", ")}`);

  const sections = Object.entries(SECTION_LABELS).map(([key, heading]) => ({
    heading,
    body: bodies[key],
    contains_placeholder: containsPlaceholder(bodies[key]),
  }));

  return { sections, rawOutput: toolUse.input };
}

// ============================================================================
// Template mode — AI transcribes the manager's own uploaded document,
// filling in only the blanks/placeholders it finds with the given facts.
// Explicitly instructed to reproduce the surrounding legal language
// verbatim rather than rephrase it — there's no PDF text-editing library in
// this backend to enforce that as a byte-level guarantee (and a scanned/
// image-based template has no text layer to edit even if there were), so
// this is an instructional safeguard, not a mechanical one. The review UI
// surfaces this distinction with its own, milder disclaimer than Generate
// mode's (see Leases.jsx) — the manager is asked to compare the result
// against their original file before sending, specifically because this is
// a transcription.
// ============================================================================
const TEMPLATE_TOOL = {
  name: "fill_lease_template",
  description: "Submit the template's text, transcribed verbatim except for filled-in blanks, broken into sections.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        description: "The document broken into its own sections/clauses, in original order.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "This section's heading or clause title, as it appears in the source document (or a short descriptive label if the source has none)." },
            body: { type: "string", description: "This section's body text, transcribed verbatim from the source except with blanks/placeholders filled in from the given facts." },
          },
          required: ["heading", "body"],
          additionalProperties: false,
        },
      },
      confidence: {
        type: "string",
        enum: ["high", "low"],
        description: "high only if every blank/placeholder in the document was clearly identifiable and filled. low if any blank was ambiguous, illegible, or had no matching fact provided.",
      },
      confidence_notes: {
        type: ["string", "null"],
        description: 'Brief note on what was ambiguous or left unfilled. Null when confidence is "high".',
      },
    },
    required: ["sections", "confidence", "confidence_notes"],
    additionalProperties: false,
  },
};

export async function fillLeaseTemplate({ fileBuffer, mediaType, facts }) {
  const factsBlock = buildFactsBlock(facts);
  const base64Data = fileBuffer.toString("base64");
  const sourceBlock =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64Data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    output_config: { effort: "high" },
    tools: [TEMPLATE_TOOL],
    tool_choice: { type: "tool", name: TEMPLATE_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          {
            type: "text",
            text: `This is a lease template document. Transcribe its full text into the fill_lease_template tool, broken into sections matching the document's own structure.

Reproduce every word of the document's existing legal language EXACTLY as written — do not rephrase, summarize, reorder, or add anything. The only text you may change is an actual blank, underscore run (e.g. "_________"), or bracketed placeholder (e.g. "[TENANT NAME]") — replace ONLY that with the matching value below, nothing else.

Facts to fill blanks with (never invent a value not given here — if a blank has no matching fact, leave a bracketed note like "[VALUE NOT PROVIDED]" instead of guessing):
${factsBlock}`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("No transcription returned");

  const sections = toolUse.input.sections.map((s) => ({ ...s, contains_placeholder: false }));
  return {
    sections,
    confidence: toolUse.input.confidence,
    confidenceNotes: toolUse.input.confidence_notes,
    rawOutput: toolUse.input,
  };
}
