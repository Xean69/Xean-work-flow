import { ApiError } from "./errors.js";

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} is required`);
  }
  return value.trim();
}

function requireNumber(value, field, { min = -Infinity } = {}) {
  const num = Number(value);
  if (Number.isNaN(num) || num < min) {
    throw new ApiError(400, `${field} must be a number${min === -Infinity ? "" : ` >= ${min}`}`);
  }
  return num;
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

function optionalString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function requireDate(value, field) {
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

function optionalNumber(value, field) {
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

export function parseUnitBody(body) {
  const status = body.status === undefined ? "vacant" : body.status;
  if (status !== "vacant" && status !== "occupied") {
    throw new ApiError(400, "status must be 'vacant' or 'occupied'");
  }
  return {
    unit_number: requireString(body.unit_number, "unit_number"),
    bedrooms: requireNumber(body.bedrooms, "bedrooms", { min: 0 }),
    bathrooms: requireNumber(body.bathrooms, "bathrooms", { min: 0 }),
    rent_amount: requireNumber(body.rent_amount, "rent_amount", { min: 0 }),
    status,
  };
}
