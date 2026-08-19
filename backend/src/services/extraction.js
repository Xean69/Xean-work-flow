import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";

const anthropic = new Anthropic();

const MEDIA_TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const MEDIA_TYPE_VALUES = new Set(Object.values(MEDIA_TYPES));

// Re-extraction fetches the file back from its Cloudinary URL rather than
// from req.file (only available at upload time), and Cloudinary URLs don't
// carry a mimetype — so this maps the document's stored original filename
// back to one instead.
export function mimeTypeForFilename(filename) {
  return MEDIA_TYPES[path.extname(filename || "").toLowerCase()];
}

// Shared by every tool schema below — the model reports its own confidence
// rather than us guessing at it after the fact. "high" is reserved for
// fields it actually read off the page; anything missing, illegible, or
// inferred must come back "low" with a note, instead of a silent guess.
const CONFIDENCE_FIELDS = {
  confidence: {
    type: "string",
    enum: ["high", "low"],
    description:
      'high only if every field below was clearly and unambiguously stated in the document. low if any field was missing, illegible, contradictory, or had to be inferred rather than read directly.',
  },
  confidence_notes: {
    type: ["string", "null"],
    description: 'Brief note on what was missing or ambiguous. Null when confidence is "high".',
  },
};

const TOOLS = {
  lease: {
    name: "extract_lease_data",
    description: "Record the structured fields extracted from a residential lease document.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tenant_name: { type: ["string", "null"], description: "Full name(s) of the tenant(s) named on the lease." },
        rent_amount: {
          type: ["number", "null"],
          description: "Monthly rent in dollars, as a plain number with no currency symbol.",
        },
        deposit_amount: {
          type: ["number", "null"],
          description: "Security deposit in dollars, as a plain number.",
        },
        lease_start_date: { type: ["string", "null"], description: "Lease start date as YYYY-MM-DD." },
        lease_end_date: {
          type: ["string", "null"],
          description: "Lease end date as YYYY-MM-DD, or null for a month-to-month lease.",
        },
        ...CONFIDENCE_FIELDS,
      },
      required: [
        "tenant_name",
        "rent_amount",
        "deposit_amount",
        "lease_start_date",
        "lease_end_date",
        "confidence",
        "confidence_notes",
      ],
      additionalProperties: false,
    },
  },
  invoice: {
    name: "extract_invoice_data",
    description: "Record the structured fields extracted from a vendor invoice.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vendor_name: { type: ["string", "null"], description: "Name of the vendor or company that issued the invoice." },
        amount: {
          type: ["number", "null"],
          description: "Total amount due, as a plain number with no currency symbol.",
        },
        due_date: { type: ["string", "null"], description: "Payment due date as YYYY-MM-DD." },
        ...CONFIDENCE_FIELDS,
      },
      required: ["vendor_name", "amount", "due_date", "confidence", "confidence_notes"],
      additionalProperties: false,
    },
  },
  inspection: {
    name: "extract_inspection_data",
    description: "Record the structured fields extracted from a property inspection or move-out report.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        deductions: {
          type: "array",
          description: "Each item of damage or deduction noted in the report. Empty array if none are noted.",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "What the deduction is for." },
              amount: { type: ["number", "null"], description: "Dollar amount for this item, if stated." },
            },
            required: ["description", "amount"],
            additionalProperties: false,
          },
        },
        total_amount: {
          type: ["number", "null"],
          description: "Total deduction/damage amount, if the report states one.",
        },
        ...CONFIDENCE_FIELDS,
      },
      required: ["deductions", "total_amount", "confidence", "confidence_notes"],
      additionalProperties: false,
    },
  },
};

export function isExtractableDocType(docType) {
  return Object.prototype.hasOwnProperty.call(TOOLS, docType);
}

// Runs one extraction pass and returns a plain outcome object — it never
// throws, so a flaky API call degrades to status: "failed" instead of
// breaking the upload/re-extract request that called it. fileBuffer comes
// from multer's memoryStorage at upload time, or from re-fetching the
// Cloudinary URL on a manual re-extract — either way, no local disk read.
export async function extractDocumentData(fileBuffer, mediaType, docType) {
  const tool = TOOLS[docType];
  if (!tool) return { status: "unsupported", data: null, confidence: null };

  if (!mediaType || !MEDIA_TYPE_VALUES.has(mediaType)) {
    return { status: "unsupported", data: null, confidence: null };
  }

  const base64Data = fileBuffer.toString("base64");
  const sourceBlock =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64Data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "medium" },
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            sourceBlock,
            {
              type: "text",
              text: `This is a ${docType} document. Extract the fields defined by the ${tool.name} tool. Only report a value when it is clearly and directly stated in the document — never guess or infer a value that isn't there. If a field is missing, illegible, or ambiguous, set it to null and reflect that in the confidence field.`,
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) return { status: "failed", data: null, confidence: null };

    const { confidence, ...data } = toolUse.input;
    return { status: "success", data, confidence: confidence ?? null };
  } catch (err) {
    console.error("Document extraction failed:", err);
    return { status: "failed", data: null, confidence: null };
  }
}
