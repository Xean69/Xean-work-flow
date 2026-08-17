import { requireString, requireNumber, optionalNumber, optionalString, requireDate } from "./validate.js";

// The manual-entry validators in validate.js throw on the first bad field
// — fine for a form, but a bulk-import preview needs to show every problem
// with a row at once, not just the first one hit. This runs a field
// validator and, if it throws, records the message and moves on instead
// of stopping the whole row.
function tryField(errors, fn) {
  try {
    return fn();
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

export const PROPERTY_CSV_HEADERS = [
  "name",
  "address",
  "city",
  "province",
  "postal_code",
  "unit_number",
  "bedrooms",
  "bathrooms",
  "rent_amount",
];

// Returns { errors: string[], data: {...} | null }. data is populated with
// whatever parsed successfully even when errors exist, so the preview UI
// can show the entered values back for editing rather than blanking them.
export function validatePropertyRow(raw) {
  const errors = [];
  const name = tryField(errors, () => requireString(raw.name, "name"));
  const address = tryField(errors, () => requireString(raw.address, "address"));
  const city = tryField(errors, () => requireString(raw.city, "city"));
  const province = tryField(errors, () => requireString(raw.province, "province"));
  const postal_code = tryField(errors, () => requireString(raw.postal_code, "postal_code"));
  const unit_number = tryField(errors, () => requireString(raw.unit_number, "unit_number"));
  const bedrooms = tryField(errors, () => optionalNumber(raw.bedrooms, "bedrooms")) ?? 0;
  const bathrooms = tryField(errors, () => optionalNumber(raw.bathrooms, "bathrooms")) ?? 0;
  const rent_amount = tryField(errors, () => requireNumber(raw.rent_amount, "rent_amount", { min: 0 }));

  if (errors.length) return { errors, data: null };
  return { errors, data: { name, address, city, province, postal_code, unit_number, bedrooms, bathrooms, rent_amount } };
}

export const TENANT_CSV_HEADERS = [
  "full_name",
  "email",
  "phone",
  "property_name",
  "unit_number",
  "lease_start",
  "lease_end",
  "rent_amount",
  "deposit_amount",
];

export function validateTenantRow(raw) {
  const errors = [];
  const full_name = tryField(errors, () => requireString(raw.full_name, "full_name"));
  const email = optionalString(raw.email);
  const phone = optionalString(raw.phone);
  const property_name = tryField(errors, () => requireString(raw.property_name, "property_name"));
  const unit_number = tryField(errors, () => requireString(raw.unit_number, "unit_number"));
  const lease_start = tryField(errors, () => requireDate(raw.lease_start, "lease_start"));
  const lease_end = tryField(errors, () => requireDate(raw.lease_end, "lease_end"));
  const rent_amount = tryField(errors, () => requireNumber(raw.rent_amount, "rent_amount", { min: 0 }));
  const deposit_amount = tryField(errors, () => requireNumber(raw.deposit_amount, "deposit_amount", { min: 0 }));

  if (lease_start && lease_end && new Date(lease_end) <= new Date(lease_start)) {
    errors.push("lease_end must be after lease_start");
  }

  if (errors.length) return { errors, data: null };
  return {
    errors,
    data: { full_name, email, phone, property_name, unit_number, lease_start, lease_end, rent_amount, deposit_amount },
  };
}

// Case/whitespace-insensitive key so "123 Main St" and "123 main st " match
// — CSV data is never as clean as what a form enforces.
export function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}
