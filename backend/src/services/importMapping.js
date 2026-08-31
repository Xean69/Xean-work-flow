import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// The full set of fields the migration importer can populate — a superset
// of importValidate.js's PROPERTY_CSV_HEADERS ("name" here) and
// TENANT_CSV_HEADERS (tenant_* here), since one migration row commonly
// carries both a unit and its current tenant together (a typical roster
// export). unit_number and rent_amount are shared between the two halves
// of a row; property_name on the tenant side is just this row's "name".
export const TARGET_FIELDS = [
  "name",
  "address",
  "city",
  "province",
  "postal_code",
  "unit_number",
  "bedrooms",
  "bathrooms",
  "rent_amount",
  "tenant_full_name",
  "tenant_email",
  "tenant_phone",
  "lease_start",
  "lease_end",
  "deposit_amount",
];

const FIELD_DESCRIPTIONS = {
  name: "Property name (e.g. building or complex name).",
  address: "Street address of the property.",
  city: "City.",
  province: "Province/state.",
  postal_code: "Postal/ZIP code.",
  unit_number: "Unit/suite number within the property.",
  bedrooms: "Number of bedrooms in the unit.",
  bathrooms: "Number of bathrooms in the unit.",
  rent_amount: "Monthly rent for the unit.",
  tenant_full_name: "The current tenant's full name.",
  tenant_email: "The current tenant's email address.",
  tenant_phone: "The current tenant's phone number.",
  lease_start: "Lease start date.",
  lease_end: "Lease end date (or renewal/expiry date).",
  deposit_amount: "Security deposit amount.",
};

const MAPPING_TOOL = {
  name: "map_spreadsheet_columns",
  description: "Map every column of an uploaded property-management spreadsheet to Xean's fields, or mark it unmapped.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      mappings: {
        type: "array",
        description: "Exactly one entry per source column header given, in the same order.",
        items: {
          type: "object",
          properties: {
            source_header: { type: "string", description: "The exact column header as given." },
            target_field: {
              type: "string",
              enum: [...TARGET_FIELDS, "unmapped"],
              description: "Which Xean field this column maps to, or \"unmapped\" if it doesn't correspond to anything Xean tracks (e.g. an internal ID, a note field, a status column).",
            },
            confidence: {
              type: "string",
              enum: ["high", "low"],
              description: "high only if the header and sample values clearly indicate this mapping. low if the header is ambiguous (e.g. a generic \"Amount\" column) or the mapping is a guess.",
            },
            notes: { type: ["string", "null"], description: "Brief reason for a low-confidence mapping. Null when confidence is \"high\"." },
          },
          required: ["source_header", "target_field", "confidence", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["mappings"],
    additionalProperties: false,
  },
};

function buildFieldGuide() {
  return TARGET_FIELDS.map((f) => `- ${f}: ${FIELD_DESCRIPTIONS[f]}`).join("\n");
}

// sampleRows: a handful of raw { header: value } rows (not the whole
// file — mapping which column means what doesn't need every row, just
// enough real values to disambiguate an ambiguous header like "Amount").
// Never throws — degrades to an all-"unmapped" result so a flaky API call
// still lets the manager map everything by hand in the review step rather
// than blocking the import entirely.
export async function suggestColumnMapping(headers, sampleRows) {
  const sampleBlock = sampleRows
    .map((row, i) => `Row ${i + 1}: ` + headers.map((h) => `${h}=${JSON.stringify(row[h] ?? "")}`).join(", "))
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "medium" },
      tools: [MAPPING_TOOL],
      tool_choice: { type: "tool", name: MAPPING_TOOL.name },
      system: `You are mapping columns from a property-management spreadsheet (exported from a system like Yardi, AppFolio, Buildium, or a generic in-house spreadsheet) onto Xean's own fields, so the data can be imported without the manager re-entering it by hand.

Xean's fields:
${buildFieldGuide()}

Rules:
- Map a column only when you're genuinely confident it corresponds to one of the fields above — a column that doesn't correspond to anything (an internal ID, a free-text note, a status flag, etc.) should be "unmapped", not forced into the closest-sounding field.
- Never map two different real-world meanings onto the same field just because both columns are numeric — check the sample values, not just the header name (e.g. a "Deposit" column and a "Rent" column are both dollar amounts but mean different things).
- Column headers from real exports are often abbreviated or platform-specific (e.g. "Prop", "Unit #", "Move-In", "Lease To") — use your judgment, not just exact string matching.`,
      messages: [
        {
          role: "user",
          content: `Column headers: ${JSON.stringify(headers)}\n\nSample rows:\n${sampleBlock}\n\nMap every column listed above using the map_spreadsheet_columns tool.`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) throw new Error("No mapping returned");

    // Defensive parity check — build a lookup by header and fall back to
    // "unmapped" for anything the model dropped, rather than letting a
    // missing entry silently disappear from the confirmation UI.
    const byHeader = new Map(toolUse.input.mappings.map((m) => [m.source_header, m]));
    return headers.map((h) => {
      const m = byHeader.get(h);
      return m
        ? { sourceHeader: h, targetField: m.target_field, confidence: m.confidence, notes: m.notes }
        : { sourceHeader: h, targetField: "unmapped", confidence: "low", notes: "Model did not return a mapping for this column." };
    });
  } catch (err) {
    console.error("Column mapping suggestion failed:", err);
    return headers.map((h) => ({ sourceHeader: h, targetField: "unmapped", confidence: "low", notes: "Automatic mapping failed — please map this column manually." }));
  }
}
