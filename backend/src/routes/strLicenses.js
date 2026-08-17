import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseStrLicenseBody } from "../utils/validate.js";

const router = Router();

const EXPIRING_SOON_DAYS = 60;

// Status is never stored — derived from expiry_date every time it's
// requested, same reasoning as tenants' lease status (see tenants.js):
// a stored value could silently go stale the moment today's date crosses
// a boundary, with nothing ever writing to the row to catch it.
function computeStatus(expiryDate) {
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((expiry - today) / 86400000);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "active";
}

// Pure Y/M/D arithmetic rather than routing issued_date through a JS Date
// and back — avoids any UTC/local timezone drift changing the calendar
// date. Feb 29 lands on Feb 28 the following (non-leap) year instead of
// silently rolling over into March.
function addOneYear(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const nextYear = year + 1;
  const daysInMonth = new Date(nextYear, month, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return `${nextYear}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

async function assertPropertyInBusiness(propertyId, businessId) {
  const { rows } = await pool.query("SELECT id FROM properties WHERE id = $1 AND business_id = $2", [
    propertyId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "property_id does not belong to your business");
}

// GET / - every property in the business, each paired with its most
// recent license (by issued_date) if it has ever had one at all. A
// property can have many license rows over time (each renewal is a new
// row, preserving history); this always surfaces the latest.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         p.id AS property_id,
         p.name AS property_name,
         l.id AS license_id,
         l.license_number,
         l.issued_date,
         l.expiry_date
       FROM properties p
       LEFT JOIN LATERAL (
         SELECT *
         FROM str_licenses l2
         WHERE l2.property_id = p.id
         ORDER BY l2.issued_date DESC, l2.created_at DESC
         LIMIT 1
       ) l ON true
       WHERE p.business_id = $1
       ORDER BY p.name`,
      [req.businessId]
    );

    res.json(
      rows.map((row) => ({
        ...row,
        status: row.license_id ? computeStatus(row.expiry_date) : "unlicensed",
      }))
    );
  })
);

// Also how a renewal works — post a new license_number (can repeat the
// same number or be a new one, city's call) and issued_date for the same
// property, and it becomes the new "most recent" one.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseStrLicenseBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);
    const expiryDate = addOneYear(data.issued_date);

    const { rows } = await pool.query(
      `INSERT INTO str_licenses (business_id, property_id, license_number, issued_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.businessId, data.property_id, data.license_number, data.issued_date, expiryDate]
    );
    res.status(201).json({ ...rows[0], status: computeStatus(rows[0].expiry_date) });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseStrLicenseBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);
    const expiryDate = addOneYear(data.issued_date);

    const { rows } = await pool.query(
      `UPDATE str_licenses
       SET property_id = $1, license_number = $2, issued_date = $3, expiry_date = $4
       WHERE id = $5 AND business_id = $6
       RETURNING *`,
      [data.property_id, data.license_number, data.issued_date, expiryDate, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "License not found");
    res.json({ ...rows[0], status: computeStatus(rows[0].expiry_date) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM str_licenses WHERE id = $1 AND business_id = $2", [
      req.params.id,
      req.businessId,
    ]);
    if (!rowCount) throw new ApiError(404, "License not found");
    res.status(204).end();
  })
);

export default router;
