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

// The 6 languages this pass supports, mirrored by schema.sql's CHECK
// constraints and frontend/src/i18n/languages.js — adding a 7th means
// updating all three, plus a translate-locales.mjs generation pass.
export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "pt", "zh", "ar"];

export function parseLanguageBody(body) {
  if (!SUPPORTED_LANGUAGES.includes(body.language)) {
    throw new ApiError(400, `language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`);
  }
  return { language: body.language };
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
  const hasFirstPeriodOverride =
    body.first_period_rent_amount !== undefined &&
    body.first_period_rent_amount !== null &&
    body.first_period_rent_amount !== "";
  return {
    unit_id: requireNumber(body.unit_id, "unit_id", { min: 1 }),
    full_name: requireString(body.full_name, "full_name"),
    email: optionalString(body.email),
    phone: optionalString(body.phone),
    lease_start: body.lease_start,
    lease_end: body.lease_end,
    rent_amount: requireNumber(body.rent_amount, "rent_amount", { min: 0 }),
    deposit_amount: requireNumber(body.deposit_amount, "deposit_amount", { min: 0 }),
    first_period_rent_amount: hasFirstPeriodOverride
      ? requireNumber(body.first_period_rent_amount, "first_period_rent_amount", { min: 0.01 })
      : null,
    addons: parseTenantAddonsBody(body.addons),
  };
}

// The tenant-side "which addons, how many of each" selection. Price is
// never accepted here — quantity is the only adjustable input; monthly_price
// always comes from property_addons at read time, per the addon feature's
// single-source-of-truth rule.
function parseTenantAddonsBody(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "addons must be an array");
  return value.map((item) => ({
    addon_id: requireNumber(item.addon_id, "addons[].addon_id", { min: 1 }),
    quantity: requireNumber(item.quantity, "addons[].quantity", { min: 1 }),
  }));
}

export function parseAddonBody(body) {
  return {
    name: requireString(body.name, "name"),
    monthly_price: requireNumber(body.monthly_price, "monthly_price", { min: 0 }),
  };
}

export function parseOccupantBody(body) {
  return {
    full_name: requireString(body.full_name, "full_name"),
    relationship: optionalString(body.relationship),
    notes: optionalString(body.notes),
  };
}

const EVICTION_STAGES = ["notice_issued", "filed_with_court", "hearing_scheduled", "order_granted", "resolved_withdrawn"];

export function parseEvictionEventBody(body) {
  if (!EVICTION_STAGES.includes(body.stage)) {
    throw new ApiError(400, `stage must be one of: ${EVICTION_STAGES.join(", ")}`);
  }
  requireDate(body.date_issued, "date_issued");
  return {
    notice_type: requireString(body.notice_type, "notice_type"),
    stage: body.stage,
    date_issued: body.date_issued,
    notes: optionalString(body.notes),
  };
}

export function parseTenantNotesBody(body) {
  return { manager_notes: optionalString(body.manager_notes) };
}

const MANUAL_CHARGE_TYPES = ["custom", "late_fee", "credit"];

// The manager-facing "Create charge" form — rent/addon charges are always
// system-generated (see utils/ledger.js), never created through this path.
// amount is always entered (and validated) as a plain positive number here
// — a credit's amount is negated once, server-side, at the route that
// actually inserts the row, so the manager never has to think about signs.
export function parseChargeBody(body) {
  const charge_type = body.charge_type === undefined ? "custom" : body.charge_type;
  if (!MANUAL_CHARGE_TYPES.includes(charge_type)) {
    throw new ApiError(400, `charge_type must be one of: ${MANUAL_CHARGE_TYPES.join(", ")}`);
  }
  const recurring = body.recurring === true;
  if (recurring && charge_type === "credit") {
    throw new ApiError(400, "Credits can't be recurring — log a new one each time instead");
  }
  requireDate(body.due_date, "due_date");
  return {
    description: requireString(body.description, "description"),
    amount: requireNumber(body.amount, "amount", { min: 0.01 }),
    due_date: body.due_date,
    charge_type,
    recurring,
  };
}

export function parseRecurringChargeBody(body) {
  return {
    description: requireString(body.description, "description"),
    amount: requireNumber(body.amount, "amount", { min: 0.01 }),
  };
}

// Editing an existing charge instance — type and period are structural
// (set once at creation) and never change here.
export function parseChargeUpdateBody(body) {
  requireDate(body.due_date, "due_date");
  return {
    description: requireString(body.description, "description"),
    amount: requireNumber(body.amount, "amount", { min: 0.01 }),
    due_date: body.due_date,
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

// The optional "record first payment" sub-object on tenant creation —
// tenant_id and period_covered aren't part of the client payload the way
// they are for parseRentPaymentBody, since the route derives both itself
// (the tenant it just created, and the calendar month of lease_start).
export function parseFirstPaymentBody(body) {
  if (!PAYMENT_METHODS.includes(body.method)) {
    throw new ApiError(400, `method must be one of: ${PAYMENT_METHODS.join(", ")}`);
  }
  requireDate(body.payment_date, "payment_date");
  return {
    amount: requireNumber(body.amount, "amount", { min: 0.01 }),
    payment_date: body.payment_date,
    method: body.method,
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

// Used only by the manager's assign-to-staff dropdown — a narrow, single-
// purpose update, not the full parseMaintenanceBody a title/description
// edit requires. null explicitly means "unassign," distinct from the field
// being omitted (which would be a client bug, not a real request).
export function parseAssignBody(body) {
  return { assignedStaffId: optionalNumber(body.assigned_staff_id, "assigned_staff_id") };
}

// Used only by the maintenance staff portal's own status control — the
// same status enum the manager's full ticket editor uses, but this is the
// one field a staff member is allowed to change on a ticket assigned to
// them; everything else (title, description, priority, reassignment) stays
// manager-only.
// completion_note is required only when resolving — a staff member can
// freely move a ticket to in_progress (or back) with no note, but can never
// mark it resolved without describing what was done. Enforced here (not
// just in the UI) since the client-side gate is only a courtesy.
export function parseStaffStatusBody(body) {
  if (!MAINTENANCE_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${MAINTENANCE_STATUSES.join(", ")}`);
  }
  if (body.status === "resolved") {
    return { status: body.status, completionNote: requireString(body.completion_note, "completion_note") };
  }
  return { status: body.status, completionNote: null };
}

// Used by the staff portal's own "Away" toggle — manual, both to set and to
// clear, with no auto-expiry (see schema.sql's presence note).
export function parseAwayStatusBody(body) {
  if (typeof body.away !== "boolean") {
    throw new ApiError(400, "away must be a boolean");
  }
  return { away: body.away, awayNote: body.away ? optionalString(body.away_note) : null };
}

// Used by the Team page's "+ Add maintenance team member" form — first
// name, last name, email, phone, nothing else required at creation. No
// password here: like tenants, a maintenance team member's portal login is
// set separately and deliberately, never auto-generated at creation time.
export function parseStaffBody(body) {
  return {
    firstName: requireString(body.first_name, "first_name"),
    lastName: requireString(body.last_name, "last_name"),
    email: requireString(body.email, "email"),
    phone: optionalString(body.phone),
  };
}

const DOC_TYPES = ["lease", "invoice", "inspection", "application", "other", "id"];

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
//
// entry_permission is required on every report, independent of the
// separate mid-conversation "flag as emergency" action, which never goes
// through this parser at all. entry_date is only meaningful (and only
// required) when permission is granted — forced to null otherwise so the
// two can never end up disagreeing, regardless of what a client sends.
export function parsePortalRepairBody(body) {
  const priority = body.priority === undefined ? "medium" : body.priority;
  if (!MAINTENANCE_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority must be one of: ${MAINTENANCE_PRIORITIES.join(", ")}`);
  }
  if (body.entry_permission !== "yes" && body.entry_permission !== "no") {
    throw new ApiError(400, "entry_permission must be 'yes' or 'no'");
  }
  const entryPermission = body.entry_permission === "yes";
  const entryDate = entryPermission ? requireString(body.entry_date, "entry_date") : null;
  return {
    title: requireString(body.title, "title"),
    description: optionalString(body.description),
    priority,
    entryPermission,
    entryDate,
  };
}

// requireBody is false only for maintenance chat comments that carry an
// attachment — a message needs text or a file, never neither, so the route
// itself decides which case it's in before calling this.
export function parseMessageBody(body, { requireBody = true } = {}) {
  if (!requireBody) {
    return { body: typeof body.body === "string" ? body.body.trim() : "" };
  }
  return { body: requireString(body.body, "body") };
}

// Used only by the bulk-announcement composer — tenant_ids is the manager's
// final, already-fine-tuned recipient list (property filter + individual
// checkbox toggles resolved client-side); the route itself re-validates
// every id actually belongs to this business before using any of them.
export function parseAnnouncementBody(body) {
  if (!Array.isArray(body.tenant_ids) || body.tenant_ids.length === 0) {
    throw new ApiError(400, "tenant_ids must be a non-empty array");
  }
  const tenantIds = body.tenant_ids.map((id) => Number(id));
  if (tenantIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new ApiError(400, "tenant_ids must all be positive integers");
  }
  return {
    subject: requireString(body.subject, "subject"),
    body: requireString(body.body, "body"),
    tenantIds,
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

// No other form in the app needs this — every existing email field is
// either behind a login (trusted enough to just require non-empty) or
// backed by a DB unique constraint. The public contact forms are the first
// place an unvalidated format actually matters, since there's no session
// and no follow-up account to catch a typo'd address later.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmailFormat(value, field) {
  const trimmed = requireString(value, field);
  if (!EMAIL_FORMAT.test(trimmed)) {
    throw new ApiError(400, `${field} must be a valid email address`);
  }
  return trimmed;
}

const CONTACT_MESSAGE_MAX_LENGTH = 2000;

function requireBoundedString(value, field, maxLength) {
  const trimmed = requireString(value, field);
  if (trimmed.length > maxLength) {
    throw new ApiError(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

// Shared by all three public contact forms — a non-empty, non-whitespace
// string in the honeypot field means a bot filled in every input it found,
// which real visitors never do (it's hidden off-screen, see ContactSection
// in the frontend). Routes check this and silently no-op instead of
// throwing, so a bot never learns it was caught.
export function isHoneypotTripped(body) {
  return typeof body.website === "string" && body.website.trim() !== "";
}

export function parseContactInquiryBody(body) {
  return {
    name: requireBoundedString(body.name, "name", 200),
    email: requireEmailFormat(body.email, "email"),
    phone: optionalString(body.phone),
    message: requireBoundedString(body.message, "message", CONTACT_MESSAGE_MAX_LENGTH),
  };
}

export function parseContactChatBody(body) {
  return {
    name: requireBoundedString(body.name, "name", 200),
    email: requireEmailFormat(body.email, "email"),
    message: requireBoundedString(body.message, "message", CONTACT_MESSAGE_MAX_LENGTH),
  };
}

const LEASE_GENERATION_MODES = ["template", "generate"];

// Custom clauses are manager-authored, not AI-authored — free-text
// heading/body pairs appended to whatever the generation mode produces.
// Validated as a bounded array of plain strings, nothing more structured
// than that.
function parseCustomClausesBody(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "custom_clauses must be an array");
  return value.map((item, i) => ({
    heading: requireString(item.heading, `custom_clauses[${i}].heading`),
    body: requireString(item.body, `custom_clauses[${i}].body`),
  }));
}

export function parseLeaseCreateBody(body) {
  if (!LEASE_GENERATION_MODES.includes(body.generation_mode)) {
    throw new ApiError(400, `generation_mode must be one of: ${LEASE_GENERATION_MODES.join(", ")}`);
  }
  return {
    tenant_id: requireNumber(body.tenant_id, "tenant_id", { min: 1 }),
    generation_mode: body.generation_mode,
    custom_terms: optionalString(body.custom_terms),
    custom_clauses: parseCustomClausesBody(body.custom_clauses),
  };
}

// The manager's edits to the generated draft — content shape mirrors what
// leaseGeneration.js produces: { sections: [{ heading, body }] }. Only
// reachable while a lease is still a draft (enforced in the route, not
// here).
export function parseLeaseContentBody(body) {
  if (!body.content || !Array.isArray(body.content.sections)) {
    throw new ApiError(400, "content.sections must be an array");
  }
  return {
    content: {
      sections: body.content.sections.map((s, i) => ({
        heading: requireString(s.heading, `content.sections[${i}].heading`),
        body: requireString(s.body, `content.sections[${i}].body`),
      })),
    },
  };
}

// reviewed_confirmation must be the literal boolean true, sent only once a
// manager has actually checked the "I've reviewed this" box — this is the
// server-side half of the mandatory human-review gate; the route rejects
// the send entirely without it, it's not just a UI nicety.
export function parseLeaseSendBody(body) {
  if (body.reviewed_confirmation !== true) {
    throw new ApiError(400, "You must confirm you've reviewed this lease before sending it");
  }
  return {
    document_id: requireNumber(body.document_id, "document_id", { min: 1 }),
  };
}

export function parseLeaseVoidBody(body) {
  return { void_reason: optionalString(body.void_reason) };
}

// signed_name is required even when a drawn signature is also provided —
// the typed name is what's shown everywhere a signature is referenced in
// text (matches move_in_inspections' signed_name-only design); the drawn
// image, if present, is additional, not a replacement.
export function parseLeaseSignBody(body) {
  return { signed_name: requireString(body.signed_name, "signed_name") };
}

// Enabling requires an explicit acknowledgment of the risk; disabling never
// does — there's nothing to acknowledge about turning a feature back off.
export function parseAiLeaseGenerationBody(body) {
  if (typeof body.enabled !== "boolean") {
    throw new ApiError(400, "enabled must be a boolean");
  }
  if (body.enabled && body.acknowledged !== true) {
    throw new ApiError(400, "You must acknowledge the risk before enabling AI lease drafting");
  }
  return { enabled: body.enabled };
}

export function parseContactDemoBody(body) {
  return {
    name: requireBoundedString(body.name, "name", 200),
    email: requireEmailFormat(body.email, "email"),
    phone: optionalString(body.phone),
    preferred_time: requireBoundedString(body.preferred_time, "preferred_time", 200),
  };
}

const WEBSITE_THEMES = ["classic", "modern", "bold"];

// Lowercase letters/digits/hyphens only, matching what's actually safe to
// drop straight into a URL path segment (xean.ca/listings/<slug>) with no
// further encoding — not just "non-empty" like requireString.
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const HEX_COLOR_FORMAT = /^#[0-9a-fA-F]{6}$/;

export function parseWebsiteBody(body) {
  const slug = requireString(body.slug, "slug").toLowerCase();
  if (!SLUG_FORMAT.test(slug)) {
    throw new ApiError(400, "slug must be lowercase letters, numbers, and hyphens only");
  }
  const theme = body.theme === undefined ? "classic" : body.theme;
  if (!WEBSITE_THEMES.includes(theme)) {
    throw new ApiError(400, `theme must be one of: ${WEBSITE_THEMES.join(", ")}`);
  }
  const primaryColor = optionalString(body.primary_color);
  if (primaryColor !== null && !HEX_COLOR_FORMAT.test(primaryColor)) {
    throw new ApiError(400, "primary_color must be a hex color like #3d6d9c");
  }
  return {
    slug,
    enabled: Boolean(body.enabled),
    tagline: optionalString(body.tagline),
    description: optionalString(body.description),
    theme,
    primary_color: primaryColor,
  };
}

export function parseUnitListingOverrideBody(body) {
  return {
    advertised_price: body.advertised_price === undefined || body.advertised_price === null || body.advertised_price === ""
      ? null
      : requireNumber(body.advertised_price, "advertised_price", { min: 0 }),
    incentive_text: optionalString(body.incentive_text),
    description: optionalString(body.description),
  };
}
