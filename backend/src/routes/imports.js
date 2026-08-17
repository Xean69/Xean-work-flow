import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import {
  PROPERTY_CSV_HEADERS,
  TENANT_CSV_HEADERS,
  validatePropertyRow,
  validateTenantRow,
  normalizeKey,
} from "../utils/importValidate.js";

const router = Router();

const MAX_ROWS = 2000;

// CSVs are parsed in memory and never written to disk — unlike documents/
// receipts, there's nothing here worth keeping once the rows are read.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return cb(new ApiError(400, "File must be a .csv"));
    }
    cb(null, true);
  },
});

// Parses the uploaded CSV into an array of { header: rawStringValue }
// objects. Only checks that the required columns exist — doesn't validate
// the data itself, that's validatePropertyRow/validateTenantRow's job.
function parseCsvBuffer(buffer, requiredHeaders) {
  const text = buffer.toString("utf8");
  let table;
  try {
    table = parse(text, { bom: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new ApiError(400, "Could not parse this file as CSV");
  }
  if (table.length === 0) throw new ApiError(400, "CSV file is empty");

  const headerRow = table[0].map((h) => h.trim());
  const missing = requiredHeaders.filter((h) => !headerRow.includes(h));
  if (missing.length) {
    throw new ApiError(400, `CSV is missing required column(s): ${missing.join(", ")}`);
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) throw new ApiError(400, "CSV has no data rows");
  if (dataRows.length > MAX_ROWS) throw new ApiError(400, `CSV has too many rows (max ${MAX_ROWS} per import)`);

  return dataRows.map((cols) => {
    const obj = {};
    headerRow.forEach((h, i) => {
      obj[h] = (cols[i] ?? "").trim();
    });
    return obj;
  });
}

// The raw string values for just the columns we care about — always
// returned as-is (whether or not the row is valid) so the preview table
// can show what was actually typed/uploaded for editing, never a blank.
function pickRawValues(raw, headers) {
  const out = {};
  for (const h of headers) out[h] = raw[h] !== undefined ? String(raw[h]).trim() : "";
  return out;
}

function propertyKey(name, address) {
  return `${normalizeKey(name)}|${normalizeKey(address)}`;
}
function propertyUnitKey(name, address, unitNumber) {
  return `${propertyKey(name, address)}|${normalizeKey(unitNumber)}`;
}
function tenantUnitKey(propertyName, unitNumber) {
  return `${normalizeKey(propertyName)}|${normalizeKey(unitNumber)}`;
}

// ---------------------------------------------------------------------
// Properties / Units
// ---------------------------------------------------------------------

// Loads everything needed to detect duplicates/conflicts against what
// this business already has — scoped by business_id, so an import can
// never see (or collide with) another business's properties or units.
async function loadExistingPropertyContext(businessId) {
  const { rows: properties } = await pool.query(
    "SELECT id, name, address FROM properties WHERE business_id = $1",
    [businessId]
  );
  const { rows: units } = await pool.query(
    `SELECT u.property_id, u.unit_number
     FROM units u JOIN properties p ON p.id = u.property_id
     WHERE p.business_id = $1`,
    [businessId]
  );
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const unitKeys = new Set();
  for (const u of units) {
    const prop = propertyById.get(u.property_id);
    if (prop) unitKeys.add(propertyUnitKey(prop.name, prop.address, u.unit_number));
  }
  const propertyIdByKey = new Map(properties.map((p) => [propertyKey(p.name, p.address), p.id]));
  return { propertyIdByKey, unitKeys };
}

// Validates every row and flags cross-row problems (duplicate unit within
// this business or within the file itself, conflicting details for what's
// supposed to be the same property). Mutates unitKeys/detailsByKey as it
// goes so later rows see duplicates introduced earlier in the same file.
function checkPropertyRow(raw, { unitKeys, detailsByKey }) {
  const { errors, data } = validatePropertyRow(raw);
  const rowErrors = [...errors];
  if (data) {
    const pKey = propertyKey(data.name, data.address);
    const existingDetails = detailsByKey.get(pKey);
    if (
      existingDetails &&
      (existingDetails.city !== data.city ||
        existingDetails.province !== data.province ||
        existingDetails.postal_code !== data.postal_code)
    ) {
      rowErrors.push(`Conflicting city/province/postal_code for property "${data.name}" vs. an earlier row`);
    } else {
      detailsByKey.set(pKey, { city: data.city, province: data.province, postal_code: data.postal_code });
    }

    const uKey = propertyUnitKey(data.name, data.address, data.unit_number);
    if (unitKeys.has(uKey)) {
      rowErrors.push(`Unit "${data.unit_number}" at "${data.name}" already exists or is duplicated in this file`);
    }
    unitKeys.add(uKey);
  }
  return { data, errors: rowErrors };
}

router.post(
  "/properties/preview",
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "file is required");
    const rawRows = parseCsvBuffer(req.file.buffer, PROPERTY_CSV_HEADERS);
    const { unitKeys, propertyIdByKey } = await loadExistingPropertyContext(req.businessId);
    const detailsByKey = new Map();

    const rows = rawRows.map((raw, i) => {
      const { errors } = checkPropertyRow(raw, { unitKeys, detailsByKey });
      return { row: i + 1, values: pickRawValues(raw, PROPERTY_CSV_HEADERS), errors };
    });

    res.json({
      rows,
      validCount: rows.filter((r) => r.errors.length === 0).length,
      errorCount: rows.filter((r) => r.errors.length > 0).length,
      newPropertyCount: new Set(
        rows.filter((r) => r.errors.length === 0).map((r) => propertyKey(r.values.name, r.values.address))
      ).size,
      // Only meaningful as a rough hint in the preview — commit is the
      // authoritative check for what's actually new vs. already on file.
      existingPropertyCount: propertyIdByKey.size,
    });
  })
);

router.post(
  "/properties/commit",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) throw new ApiError(400, "rows is required");
    if (rows.length > MAX_ROWS) throw new ApiError(400, `Too many rows (max ${MAX_ROWS} per import)`);

    const { unitKeys, propertyIdByKey } = await loadExistingPropertyContext(req.businessId);
    const detailsByKey = new Map();

    let createdProperties = 0;
    let createdUnits = 0;
    const skipped = [];

    for (const [i, raw] of rows.entries()) {
      const rowNum = i + 1;
      const { data, errors } = checkPropertyRow(raw, { unitKeys, detailsByKey });
      if (errors.length) {
        skipped.push({ row: rowNum, reason: errors.join("; ") });
        continue;
      }

      const pKey = propertyKey(data.name, data.address);
      let propertyId = propertyIdByKey.get(pKey);
      if (!propertyId) {
        const {
          rows: [prop],
        } = await pool.query(
          `INSERT INTO properties (business_id, name, address, city, province, postal_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [req.businessId, data.name, data.address, data.city, data.province, data.postal_code]
        );
        propertyId = prop.id;
        propertyIdByKey.set(pKey, propertyId);
        createdProperties++;
      }

      await pool.query(
        `INSERT INTO units (property_id, unit_number, bedrooms, bathrooms, rent_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'vacant')`,
        [propertyId, data.unit_number, data.bedrooms, data.bathrooms, data.rent_amount]
      );
      createdUnits++;
    }

    res.json({ createdProperties, createdUnits, skipped });
  })
);

// ---------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------

async function loadExistingTenantContext(businessId, candidateEmails) {
  const { rows: unitRows } = await pool.query(
    `SELECT u.id AS unit_id, u.unit_number, p.name AS property_name
     FROM units u JOIN properties p ON p.id = u.property_id
     WHERE p.business_id = $1`,
    [businessId]
  );
  const unitIdByKey = new Map(unitRows.map((u) => [tenantUnitKey(u.property_name, u.unit_number), u.unit_id]));

  // Tenant email uniqueness is enforced globally in the schema (it's the
  // tenant portal login identifier), not per-business — so this checks
  // across all businesses, but the response never reveals which business
  // an email belongs to, only that it's taken.
  let existingEmails = new Set();
  const emails = [...new Set(candidateEmails.filter(Boolean))];
  if (emails.length) {
    const { rows } = await pool.query("SELECT lower(email) AS email FROM tenants WHERE lower(email) = ANY($1::text[])", [
      emails,
    ]);
    existingEmails = new Set(rows.map((r) => r.email));
  }

  return { unitIdByKey, existingEmails };
}

function checkTenantRow(raw, { unitIdByKey, existingEmails, seenEmails }) {
  const { errors, data } = validateTenantRow(raw);
  const rowErrors = [...errors];
  let unitId = null;
  if (data) {
    unitId = unitIdByKey.get(tenantUnitKey(data.property_name, data.unit_number)) ?? null;
    if (!unitId) {
      rowErrors.push(`No unit "${data.unit_number}" found at property "${data.property_name}"`);
    }
    if (data.email) {
      const key = normalizeKey(data.email);
      if (seenEmails.has(key)) rowErrors.push(`Duplicate email in this file: ${data.email}`);
      else if (existingEmails.has(key)) rowErrors.push(`Email ${data.email} is already in use`);
      seenEmails.add(key);
    }
  }
  return { data, unitId, errors: rowErrors };
}

router.post(
  "/tenants/preview",
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "file is required");
    const rawRows = parseCsvBuffer(req.file.buffer, TENANT_CSV_HEADERS);
    const { unitIdByKey, existingEmails } = await loadExistingTenantContext(
      req.businessId,
      rawRows.map((r) => r.email)
    );
    const seenEmails = new Set();

    const rows = rawRows.map((raw, i) => {
      const { errors } = checkTenantRow(raw, { unitIdByKey, existingEmails, seenEmails });
      return { row: i + 1, values: pickRawValues(raw, TENANT_CSV_HEADERS), errors };
    });

    res.json({
      rows,
      validCount: rows.filter((r) => r.errors.length === 0).length,
      errorCount: rows.filter((r) => r.errors.length > 0).length,
    });
  })
);

router.post(
  "/tenants/commit",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) throw new ApiError(400, "rows is required");
    if (rows.length > MAX_ROWS) throw new ApiError(400, `Too many rows (max ${MAX_ROWS} per import)`);

    const { unitIdByKey, existingEmails } = await loadExistingTenantContext(
      req.businessId,
      rows.map((r) => r.email)
    );
    const seenEmails = new Set();

    let created = 0;
    const skipped = [];

    for (const [i, raw] of rows.entries()) {
      const rowNum = i + 1;
      const { data, unitId, errors } = checkTenantRow(raw, { unitIdByKey, existingEmails, seenEmails });
      if (errors.length) {
        skipped.push({ row: rowNum, reason: errors.join("; ") });
        continue;
      }

      await pool.query(
        `INSERT INTO tenants (business_id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.businessId, unitId, data.full_name, data.email, data.phone, data.lease_start, data.lease_end, data.rent_amount, data.deposit_amount]
      );
      await pool.query("UPDATE units SET status = 'occupied' WHERE id = $1", [unitId]);
      created++;
    }

    res.json({ created, skipped });
  })
);

export default router;
