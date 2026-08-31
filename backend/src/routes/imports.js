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
import { readSpreadsheet } from "../utils/spreadsheetReader.js";
import { suggestColumnMapping, TARGET_FIELDS } from "../services/importMapping.js";

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

// The migration importer's own upload — accepts .xlsx too (a higher size
// cap than the plain-CSV path above, since a formatted workbook runs
// larger than raw text for the same row count). Extension is checked here
// for a fast rejection; readSpreadsheet() rejects anything else (including
// the old .xls format) with a clearer message once it actually reads the
// file.
const migrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const lower = file.originalname.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      return cb(new ApiError(400, "File must be a .csv or .xlsx"));
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

// ---------------------------------------------------------------------
// Migration import — "Migrate from any spreadsheet." Unlike the two fixed-
// template flows above (which require an exact header match), this reads
// whatever columns a real export actually has and uses AI to propose which
// Xean field each one maps to (see services/importMapping.js), then a
// manager confirms/edits that mapping before anything is validated or
// imported. One spreadsheet row commonly carries both a unit and its
// current tenant together (a typical roster export), so each row is
// checked and importable as two independent halves — a unit with a
// problem tenant field can still be imported on its own.
// ---------------------------------------------------------------------

function parseMigrationMapping(mapping) {
  if (!mapping || typeof mapping !== "object") throw new ApiError(400, "mapping is required");
  const sourceByTarget = new Map();
  for (const [sourceHeader, targetField] of Object.entries(mapping)) {
    if (targetField === "unmapped" || targetField == null) continue;
    if (!TARGET_FIELDS.includes(targetField)) {
      throw new ApiError(400, `Unknown target field: ${targetField}`);
    }
    // Last one wins if two source columns were mapped to the same target —
    // the confirmation UI's one-dropdown-per-target-slot design prevents
    // this in practice, this is just a defensive fallback.
    sourceByTarget.set(targetField, sourceHeader);
  }
  return sourceByTarget;
}

// Splits one raw spreadsheet row into its unit-half and tenant-half raw
// values, per the confirmed mapping — property_name/unit_number/
// rent_amount are shared between the two halves since they're literally
// the same cell in the source row.
function applyMappingToRow(raw, sourceByTarget) {
  const get = (target) => {
    const src = sourceByTarget.get(target);
    return src !== undefined ? String(raw[src] ?? "").trim() : "";
  };
  const unitRaw = {
    name: get("name"),
    address: get("address"),
    city: get("city"),
    province: get("province"),
    postal_code: get("postal_code"),
    unit_number: get("unit_number"),
    bedrooms: get("bedrooms"),
    bathrooms: get("bathrooms"),
    rent_amount: get("rent_amount"),
  };
  const tenantRaw = {
    full_name: get("tenant_full_name"),
    email: get("tenant_email"),
    phone: get("tenant_phone"),
    property_name: unitRaw.name,
    unit_number: unitRaw.unit_number,
    lease_start: get("lease_start"),
    lease_end: get("lease_end"),
    rent_amount: unitRaw.rent_amount,
    deposit_amount: get("deposit_amount"),
  };
  return { unitRaw, tenantRaw };
}

// Tenant-side unit lookup for the migration flow specifically differs from
// loadExistingTenantContext above: a unit referenced by a tenant row here
// may not exist in the database yet at all — it might be created by this
// exact same import's own unit rows a moment earlier. unitKeys is seeded
// with every unit already in the database (loadExistingPropertyContext),
// then checkPropertyRow adds this file's own valid unit rows to the same
// set as they're validated — so by the time tenant rows are checked, one
// set correctly answers "does this unit exist, either already or as of
// this import" for both purposes at once.
// A migration tenant row often has no email at all to dedupe on (unlike
// the plain tenant importer above), so re-running a migration file after
// it already succeeded once needs a second signal: whether the unit
// itself already has a tenant. Batch-loaded once per request rather than
// queried per row, same "load everything needed up front" shape as
// loadExistingPropertyContext/loadExistingTenantContext above.
async function loadOccupiedUnitKeys(businessId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.name AS property_name, u.unit_number
     FROM tenants t
     JOIN units u ON u.id = t.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE p.business_id = $1`,
    [businessId]
  );
  return new Set(rows.map((r) => tenantUnitKey(r.property_name, r.unit_number)));
}

function checkMigrationTenantRow(tenantRaw, { unitKeys, occupiedUnitKeys, existingEmails, seenEmails }) {
  const { errors, data } = validateTenantRow(tenantRaw);
  const rowErrors = [...errors];
  if (data) {
    const key = tenantUnitKey(data.property_name, data.unit_number);
    if (!unitKeys.has(key)) {
      rowErrors.push(`No unit "${data.unit_number}" found at property "${data.property_name}" — check the unit is included and valid above`);
    } else if (occupiedUnitKeys.has(key)) {
      rowErrors.push(`Unit "${data.unit_number}" at "${data.property_name}" already has a tenant on file`);
    }
    if (data.email) {
      const emailKey = normalizeKey(data.email);
      if (seenEmails.has(emailKey)) rowErrors.push(`Duplicate email in this file: ${data.email}`);
      else if (existingEmails.has(emailKey)) rowErrors.push(`Email ${data.email} is already in use`);
      seenEmails.add(emailKey);
    }
  }
  return { data, errors: rowErrors };
}

router.post(
  "/migrate/analyze",
  migrationUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "file is required");
    const { headers, rows } = await readSpreadsheet(req.file.buffer, req.file.originalname);

    // The mapping call only needs a handful of real values to disambiguate
    // an ambiguous header — never the whole file, regardless of how many
    // rows were uploaded.
    const sampleRows = rows.slice(0, 8);
    const suggestedMapping = await suggestColumnMapping(headers, sampleRows);

    res.json({ headers, rows, rowCount: rows.length, suggestedMapping });
  })
);

router.post(
  "/migrate/preview",
  asyncHandler(async (req, res) => {
    const rawRows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rawRows || rawRows.length === 0) throw new ApiError(400, "rows is required");
    if (rawRows.length > MAX_ROWS) throw new ApiError(400, `Too many rows (max ${MAX_ROWS} per import)`);
    const sourceByTarget = parseMigrationMapping(req.body.mapping);
    const hasTenantData = sourceByTarget.has("tenant_full_name");

    // unitKeys is seeded with every unit this business already has
    // (loadExistingPropertyContext), then checkPropertyRow adds this
    // file's own valid rows to the SAME set as it goes — so a re-import of
    // an already-imported file correctly flags every row as a duplicate,
    // not just duplicates within the file itself.
    const { unitKeys, propertyIdByKey } = await loadExistingPropertyContext(req.businessId);
    const detailsByKey = new Map();

    const unitResults = rawRows.map((raw) => {
      const { unitRaw, tenantRaw } = applyMappingToRow(raw, sourceByTarget);
      const { data, errors } = checkPropertyRow(unitRaw, { unitKeys, detailsByKey });
      return { values: pickRawValues(unitRaw, PROPERTY_CSV_HEADERS), errors, tenantRaw, validUnitData: data };
    });

    let tenantResults = null;
    if (hasTenantData) {
      const { unitIdByKey: dbTenantUnitIds, existingEmails } = await loadExistingTenantContext(
        req.businessId,
        rawRows.map((_, i) => unitResults[i].tenantRaw.email)
      );
      // Tenant-side unit lookup uses the 2-part (property name + unit
      // number) key scheme loadExistingTenantContext already uses — not
      // the 3-part (name+address+unit) scheme unitKeys above uses for
      // property deduplication, which needs the address to tell apart two
      // same-named properties. Seeded with existing DB units, then this
      // file's own newly-valid units are added below so a tenant row can
      // resolve against a unit its own file is creating.
      const tenantLookupKeys = new Set(dbTenantUnitIds.keys());
      for (const u of unitResults) {
        if (u.validUnitData) tenantLookupKeys.add(tenantUnitKey(u.validUnitData.name, u.validUnitData.unit_number));
      }
      const occupiedUnitKeys = await loadOccupiedUnitKeys(req.businessId);
      const seenEmails = new Set();
      tenantResults = unitResults.map(({ tenantRaw }) => {
        const { errors } = checkMigrationTenantRow(tenantRaw, { unitKeys: tenantLookupKeys, occupiedUnitKeys, existingEmails, seenEmails });
        return { values: pickRawValues(tenantRaw, TENANT_CSV_HEADERS), errors };
      });
    }

    const rows = unitResults.map((u, i) => ({
      row: i + 1,
      unit: { values: u.values, errors: u.errors },
      tenant: hasTenantData ? tenantResults[i] : null,
    }));

    res.json({
      rows,
      hasTenantData,
      validUnitCount: rows.filter((r) => r.unit.errors.length === 0).length,
      validTenantCount: hasTenantData ? rows.filter((r) => r.tenant.errors.length === 0).length : 0,
      existingPropertyCount: propertyIdByKey.size,
    });
  })
);

router.post(
  "/migrate/commit",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) throw new ApiError(400, "rows is required");
    if (rows.length > MAX_ROWS) throw new ApiError(400, `Too many rows (max ${MAX_ROWS} per import)`);

    // --- Pass 1: units (and their properties) ---
    // unitKeys is seeded with every unit this business already has, and
    // checkPropertyRow adds each newly-created row to the same set — same
    // "re-committing an already-imported file flags everything as a
    // duplicate" behavior as /migrate/preview above, this time backed by
    // real inserts rather than just a validation pass.
    const { unitKeys, propertyIdByKey } = await loadExistingPropertyContext(req.businessId);
    const detailsByKey = new Map();
    const unitIdByPendingKey = new Map();

    let createdProperties = 0;
    let createdUnits = 0;
    const skippedUnits = [];

    for (const [i, r] of rows.entries()) {
      const rowNum = i + 1;
      if (!r.unitIncluded) continue;
      const { data, errors } = checkPropertyRow(r.unitValues, { unitKeys, detailsByKey });
      if (errors.length) {
        skippedUnits.push({ row: rowNum, reason: errors.join("; ") });
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

      const {
        rows: [unit],
      } = await pool.query(
        `INSERT INTO units (property_id, unit_number, bedrooms, bathrooms, rent_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'vacant') RETURNING id`,
        [propertyId, data.unit_number, data.bedrooms, data.bathrooms, data.rent_amount]
      );
      createdUnits++;
      unitIdByPendingKey.set(tenantUnitKey(data.name, data.unit_number), unit.id);
    }

    // --- Pass 2: tenants, against units that already existed plus the
    // ones this same commit just created above. Same 2-part key scheme
    // reasoning as /migrate/preview — see the comment there.
    const { unitIdByKey: dbTenantUnitIds, existingEmails } = await loadExistingTenantContext(
      req.businessId,
      rows.map((r) => r.tenantValues?.email).filter(Boolean)
    );
    const tenantLookupKeys = new Set([...dbTenantUnitIds.keys(), ...unitIdByPendingKey.keys()]);
    const occupiedUnitKeys = await loadOccupiedUnitKeys(req.businessId);
    const seenEmails = new Set();

    let createdTenants = 0;
    const skippedTenants = [];

    for (const [i, r] of rows.entries()) {
      const rowNum = i + 1;
      if (!r.tenantIncluded) continue;

      const { errors, data } = checkMigrationTenantRow(r.tenantValues, {
        unitKeys: tenantLookupKeys,
        occupiedUnitKeys,
        existingEmails,
        seenEmails,
      });
      if (errors.length) {
        skippedTenants.push({ row: rowNum, reason: errors.join("; ") });
        continue;
      }

      const key = tenantUnitKey(data.property_name, data.unit_number);
      const unitId = dbTenantUnitIds.get(key) ?? unitIdByPendingKey.get(key);
      if (!unitId) {
        // Should be unreachable given the check above, but a missing id
        // here would otherwise insert a tenant with a null unit_id.
        skippedTenants.push({ row: rowNum, reason: `Could not resolve unit "${data.unit_number}" at "${data.property_name}"` });
        continue;
      }

      await pool.query(
        `INSERT INTO tenants (business_id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.businessId, unitId, data.full_name, data.email, data.phone, data.lease_start, data.lease_end, data.rent_amount, data.deposit_amount]
      );
      await pool.query("UPDATE units SET status = 'occupied' WHERE id = $1", [unitId]);
      occupiedUnitKeys.add(key);
      createdTenants++;
    }

    res.json({
      createdProperties,
      createdUnits,
      createdTenants,
      skippedUnits,
      skippedTenants,
    });
  })
);

export default router;
