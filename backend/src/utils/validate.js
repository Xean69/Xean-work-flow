import { ApiError } from "./errors.js";

// Exported (not just used internally) so the bulk-import validators in
// importValidate.js can reuse the exact same field-level rules and error
// messages as every manual form, instead of a second, drifting copy.
export function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} is required`);
  }
  return value.trim();
}

export function requireNumber(value, field, { min = -Infinity } = {}) {
  const num = Number(value);
  if (Number.isNaN(num) || num < min) {
    throw new ApiError(400, `${field} must be a number${min === -Infinity ? "" : ` >= ${min}`}`);
  }
  return num;
}

export function requirePassword(value) {
  if (typeof value !== "string" || value.length < 8) {
    throw new ApiError(400, "password must be at least 8 characters");
  }
  return value;
}

// Dashboard admin accounts hold the keys to an entire business's data, so
// they get a higher bar than tenant portal passwords — same minimum the
// create-admin CLI script has enforced from the start.
export function requireAdminPassword(value) {
  if (typeof value !== "string" || value.length < 12) {
    throw new ApiError(400, "password must be at least 12 characters");
  }
  return value;
}

export function parseForgotPasswordBody(body) {
  return { email: requireString(body.email, "email") };
}

export function parseAdminResetPasswordBody(body) {
  return {
    token: requireString(body.token, "token"),
    password: requireAdminPassword(body.password),
  };
}

export function parseTenantResetPasswordBody(body) {
  return {
    token: requireString(body.token, "token"),
    password: requirePassword(body.password),
  };
}

// Invite-only roles — 'owner' is never assignable through the team API.
// There's always exactly one owner per business, created at signup (see
// schema.sql's idx_admins_one_owner_per_business).
const INVITABLE_ROLES = ["manager", "accountant"];

export function parseInviteBody(body) {
  if (!INVITABLE_ROLES.includes(body.role)) {
    throw new ApiError(400, `role must be one of: ${INVITABLE_ROLES.join(", ")}`);
  }
  return {
    email: requireString(body.email, "email"),
    role: body.role,
  };
}

export function parseRoleChangeBody(body) {
  if (!INVITABLE_ROLES.includes(body.role)) {
    throw new ApiError(400, `role must be one of: ${INVITABLE_ROLES.join(", ")}`);
  }
  return { role: body.role };
}

// Used by the business signup flow — creates a business and its first
// admin account together.
export function parseSignupBody(body) {
  return {
    business_name: requireString(body.business_name, "business_name"),
    email: requireString(body.email, "email"),
    password: requireAdminPassword(body.password),
  };
}

export function parsePropertyBody(body) {
  return {
    name: requireString(body.name, "name"),
    address: requireString(body.address, "address"),
    city: requireString(body.city, "city"),
    province: requireString(body.province, "province"),
    postal_code: requireString(body.postal_code, "postal_code"),
  };
}

export function optionalString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function requireDate(value, field) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new ApiError(400, `${field} must be a valid date`);
  }
  return value;
}

export function parseTenantBody(body) {
  requireDate(body.lease_start, "lease_start");
  requireDate(body.lease_end, "lease_end");
  if (new Date(body.lease_end) <= new Date(body.lease_start)) {
    throw new ApiError(400, "lease_end must be after lease_start");
  }
  return {
    unit_id: requireNumber(body.unit_id, "unit_id", { min: 1 }),
    full_name: requireString(body.full_name, "full_name"),
    email: optionalString(body.email),
    phone: optionalString(body.phone),
    lease_start: body.lease_start,
    lease_end: body.lease_end,
    rent_amount: requireNumber(body.rent_amount, "rent_amount", { min: 0 }),
    deposit_amount: requireNumber(body.deposit_amount, "deposit_amount", { min: 0 }),
  };
}

const PAYMENT_METHODS = ["e_transfer", "cash", "cheque", "other"];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseRentPaymentBody(body) {
  if (!PAYMENT_METHODS.includes(body.method)) {
    throw new ApiError(400, `method must be one of: ${PAYMENT_METHODS.join(", ")}`);
  }
  if (typeof body.period_covered !== "string" || !PERIOD_RE.test(body.period_covered)) {
    throw new ApiError(400, "period_covered must be in YYYY-MM format");
  }
  requireDate(body.payment_date, "payment_date");
  return {
    tenant_id: requireNumber(body.tenant_id, "tenant_id", { min: 1 }),
    amount: requireNumber(body.amount, "amount", { min: 0.01 }),
    payment_date: body.payment_date,
    method: body.method,
    period_covered: body.period_covered,
    notes: optionalString(body.notes),
  };
}

export function optionalNumber(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new ApiError(400, `${field} must be a number`);
  }
  return num;
}

const MAINTENANCE_STATUSES = ["new", "in_progress", "resolved"];
const MAINTENANCE_PRIORITIES = ["low", "medium", "high"];

export function parseMaintenanceBody(body) {
  if (!MAINTENANCE_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${MAINTENANCE_STATUSES.join(", ")}`);
  }
  const priority = body.priority === undefined ? "medium" : body.priority;
  if (!MAINTENANCE_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority must be one of: ${MAINTENANCE_PRIORITIES.join(", ")}`);
  }
  return {
    unit_id: requireNumber(body.unit_id, "unit_id", { min: 1 }),
    tenant_id: optionalNumber(body.tenant_id, "tenant_id"),
    title: requireString(body.title, "title"),
    description: optionalString(body.description),
    status: body.status,
    priority,
  };
}

const DOC_TYPES = ["lease", "invoice", "inspection", "application", "other"];

export function parseDocumentBody(body) {
  const doc_type = body.doc_type === undefined ? "other" : body.doc_type;
  if (!DOC_TYPES.includes(doc_type)) {
    throw new ApiError(400, `doc_type must be one of: ${DOC_TYPES.join(", ")}`);
  }
  return {
    property_id: optionalNumber(body.property_id, "property_id"),
    tenant_id: optionalNumber(body.tenant_id, "tenant_id"),
    doc_type,
    notes: optionalString(body.notes),
  };
}

const DOCUMENT_STATUSES = ["needs_review", "reviewed"];

export function parseDocumentStatusBody(body) {
  if (!DOCUMENT_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${DOCUMENT_STATUSES.join(", ")}`);
  }
  return { status: body.status };
}

// Field whitelist per extractable doc_type — mirrors the tool schemas in
// services/extraction.js so manual entry (when AI extraction fails, is
// unsupported, or just needs a correction) can only set the same fields the
// AI would have.
const EXTRACTED_FIELD_SCHEMAS = {
  lease: ["tenant_name", "rent_amount", "deposit_amount", "lease_start_date", "lease_end_date"],
  invoice: ["vendor_name", "amount", "due_date"],
  inspection: ["deductions", "total_amount"],
};

const NUMERIC_EXTRACTED_FIELDS = new Set(["rent_amount", "deposit_amount", "amount", "total_amount"]);

export function parseExtractedDataBody(docType, body) {
  const fields = EXTRACTED_FIELD_SCHEMAS[docType];
  if (!fields) {
    throw new ApiError(400, "This document type doesn't support extracted data");
  }

  const data = {};
  for (const field of fields) {
    if (field === "deductions") {
      const value = body.deductions;
      if (value !== undefined && !Array.isArray(value)) {
        throw new ApiError(400, "deductions must be an array");
      }
      data.deductions = Array.isArray(value)
        ? value.map((item) => ({
            description: requireString(item.description, "deductions[].description"),
            amount: optionalNumber(item.amount, "deductions[].amount"),
          }))
        : [];
      continue;
    }

    const value = body[field];
    if (value === undefined || value === null || value === "") {
      data[field] = null;
      continue;
    }
    data[field] = NUMERIC_EXTRACTED_FIELDS.has(field) ? optionalNumber(value, field) : String(value).trim();
  }
  return data;
}

const PLATFORMS = ["airbnb", "vrbo", "booking", "direct"];
const TURNOVER_STATUSES = ["checkout_done", "inspection_done", "cleaning_done", "checkin_ready"];

export function parseStayBody(body) {
  if (!PLATFORMS.includes(body.platform)) {
    throw new ApiError(400, `platform must be one of: ${PLATFORMS.join(", ")}`);
  }
  if (!TURNOVER_STATUSES.includes(body.turnover_status)) {
    throw new ApiError(400, `turnover_status must be one of: ${TURNOVER_STATUSES.join(", ")}`);
  }
  requireDate(body.checkout_date, "checkout_date");
  requireDate(body.next_checkin_date, "next_checkin_date");
  if (new Date(body.next_checkin_date) < new Date(body.checkout_date)) {
    throw new ApiError(400, "next_checkin_date must be on or after checkout_date");
  }
  return {
    unit_id: requireNumber(body.unit_id, "unit_id", { min: 1 }),
    platform: body.platform,
    guest_name: requireString(body.guest_name, "guest_name"),
    checkout_date: body.checkout_date,
    next_checkin_date: body.next_checkin_date,
    turnover_status: body.turnover_status,
  };
}

const MESSAGE_TYPES = ["checkin_instructions", "welcome", "checkout_reminder", "review_request"];

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${field} must be true or false`);
  }
  return value;
}

export function parseScheduledMessageBody(body) {
  if (!MESSAGE_TYPES.includes(body.message_type)) {
    throw new ApiError(400, `message_type must be one of: ${MESSAGE_TYPES.join(", ")}`);
  }
  return {
    stay_id: optionalNumber(body.stay_id, "stay_id"),
    message_type: body.message_type,
    send_timing: requireString(body.send_timing, "send_timing"),
    is_active: requireBoolean(body.is_active, "is_active"),
  };
}

const EXPENSE_CATEGORIES = [
  "repairs",
  "cleaning",
  "landscaping",
  "utilities",
  "property_tax",
  "supplies",
  "other",
];

export function parseExpenseBody(body) {
  const category = body.category === undefined || body.category === "" ? null : body.category;
  if (category !== null && !EXPENSE_CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${EXPENSE_CATEGORIES.join(", ")} (or omitted)`);
  }
  requireDate(body.expense_date, "expense_date");
  return {
    property_id: optionalNumber(body.property_id, "property_id"),
    unit_id: optionalNumber(body.unit_id, "unit_id"),
    amount: requireNumber(body.amount, "amount", { min: 0 }),
    category,
    vendor_name: requireString(body.vendor_name, "vendor_name"),
    expense_date: body.expense_date,
    notes: optionalString(body.notes),
  };
}

// Used only by the tenant portal's "report an issue" form — unit_id,
// tenant_id, and status are never taken from the request; they're derived
// server-side from the logged-in tenant's session.
export function parsePortalRepairBody(body) {
  const priority = body.priority === undefined ? "medium" : body.priority;
  if (!MAINTENANCE_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority must be one of: ${MAINTENANCE_PRIORITIES.join(", ")}`);
  }
  return {
    title: requireString(body.title, "title"),
    description: optionalString(body.description),
    priority,
  };
}

export function parseMessageBody(body) {
  return { body: requireString(body.body, "body") };
}

export function parseGuideSectionBody(body) {
  return {
    section_title: requireString(body.section_title, "section_title"),
    content: requireString(body.content, "content"),
  };
}

const UNIT_STATUSES = ["vacant", "occupied", "short_term", "turnover", "rent_ready", "notices"];

export function parseUnitBody(body) {
  const status = body.status === undefined ? "vacant" : body.status;
  if (!UNIT_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${UNIT_STATUSES.join(", ")}`);
  }
  return {
    unit_number: requireString(body.unit_number, "unit_number"),
    bedrooms: requireNumber(body.bedrooms, "bedrooms", { min: 0 }),
    bathrooms: requireNumber(body.bathrooms, "bathrooms", { min: 0 }),
    rent_amount: requireNumber(body.rent_amount, "rent_amount", { min: 0 }),
    status,
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Stricter than requireDate (YYYY-MM-DD specifically, not anything
// `new Date()` can parse) — routes/strLicenses.js does its own Y/M/D
// arithmetic on issued_date to compute expiry_date, which needs that
// exact shape to stay correct.
export function parseStrLicenseBody(body) {
  if (typeof body.issued_date !== "string" || !ISO_DATE_RE.test(body.issued_date) || Number.isNaN(new Date(body.issued_date).getTime())) {
    throw new ApiError(400, "issued_date must be a valid date (YYYY-MM-DD)");
  }
  return {
    property_id: requireNumber(body.property_id, "property_id", { min: 1 }),
    license_number: requireString(body.license_number, "license_number"),
    issued_date: body.issued_date,
  };
}

const COMPLIANCE_SEVERITIES = ["high", "medium", "low"];

export function parseComplianceCheckBody(body) {
  if (!COMPLIANCE_SEVERITIES.includes(body.severity)) {
    throw new ApiError(400, `severity must be one of: ${COMPLIANCE_SEVERITIES.join(", ")}`);
  }
  return {
    property_id: requireNumber(body.property_id, "property_id", { min: 1 }),
    title: requireString(body.title, "title"),
    description: optionalString(body.description),
    clause_reference: optionalString(body.clause_reference),
    severity: body.severity,
  };
}

const COMPLIANCE_STATUSES = ["open", "resolved"];

export function parseComplianceStatusBody(body) {
  if (!COMPLIANCE_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${COMPLIANCE_STATUSES.join(", ")}`);
  }
  return { status: body.status };
}
