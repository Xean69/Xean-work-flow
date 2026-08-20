import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseTenantBody, requirePassword } from "../utils/validate.js";
import { hashPassword } from "../utils/auth.js";
import { currentPeriod } from "../utils/period.js";

const router = Router();

const URGENT_DAYS = 14;
const RENEWAL_DAYS = 60;

// Status is never stored — it's derived from lease_end every time it's
// requested, so it can't ever go stale the way a saved value would.
function computeStatus(leaseEnd) {
  const end = new Date(leaseEnd);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((end - today) / 86400000);
  if (daysLeft <= URGENT_DAYS) return "urgent_renewal";
  if (daysLeft <= RENEWAL_DAYS) return "renewal_due";
  return "active";
}

// Same derive-don't-store approach as computeStatus: paid >= rent covers
// $0 rent as trivially "paid" with no special-casing needed.
function computePaymentStatus(rentAmount, paidAmount) {
  const rent = Number(rentAmount) || 0;
  const paid = Number(paidAmount) || 0;
  if (paid >= rent) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
}

// Keeps units.status in sync with whether the unit currently has a tenant,
// so the Properties page's Vacant/Occupied badge always matches reality.
async function syncUnitStatus(unitId) {
  const { rows } = await pool.query("SELECT 1 FROM tenants WHERE unit_id = $1 LIMIT 1", [
    unitId,
  ]);
  await pool.query("UPDATE units SET status = $1 WHERE id = $2", [
    rows.length ? "occupied" : "vacant",
    unitId,
  ]);
}

// A tenant's unit_id must belong to a property in the admin's own business
// — otherwise a request could attach a tenant to (or move one into) another
// business's unit by guessing its id. Returns nothing; throws 400 if the
// unit isn't found in this business.
async function assertUnitInBusiness(unitId, businessId) {
  const { rows } = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = $1 AND p.business_id = $2`,
    [unitId, businessId]
  );
  if (!rows[0]) throw new ApiError(400, "unit_id does not belong to a property in your business");
}

// GET /api/tenants - one row per unit across the whole portfolio: the
// unit's most recent tenant if it has one, or vacant if it doesn't.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         u.id AS unit_id,
         u.unit_number,
         p.id AS property_id,
         p.name AS property_name,
         t.id AS tenant_id,
         t.full_name,
         t.email,
         t.phone,
         t.lease_start,
         t.lease_end,
         t.rent_amount,
         t.deposit_amount,
         (t.password_hash IS NOT NULL) AS has_login,
         COALESCE(rp.paid_amount, 0) AS current_period_paid,
         insp.id AS inspection_id,
         insp.status AS inspection_row_status,
         insp.signed_at AS inspection_signed_at
       FROM units u
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT *
         FROM tenants t2
         WHERE t2.unit_id = u.id
         ORDER BY t2.lease_end DESC, t2.created_at DESC
         LIMIT 1
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS paid_amount
         FROM rent_payments rp2
         WHERE rp2.tenant_id = t.id AND rp2.period_covered = $2
       ) rp ON true
       LEFT JOIN move_in_inspections insp ON insp.tenant_id = t.id
       WHERE p.business_id = $1
       ORDER BY p.name, u.unit_number`,
      [req.businessId, currentPeriod()]
    );

    res.json(
      rows.map((row) => {
        let inspectionStatus = "none";
        if (row.inspection_row_status === "draft") inspectionStatus = "draft";
        else if (row.inspection_row_status === "finalized") {
          inspectionStatus = row.inspection_signed_at ? "signed" : "pending_signature";
        }
        const { inspection_row_status, ...rest } = row;
        return {
          ...rest,
          status: row.tenant_id ? computeStatus(row.lease_end) : "vacant",
          payment_status: row.tenant_id ? computePaymentStatus(row.rent_amount, row.current_period_paid) : null,
          inspection_status: row.tenant_id ? inspectionStatus : null,
        };
      })
    );
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseTenantBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO tenants (business_id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount, created_at`,
      [
        req.businessId,
        data.unit_id,
        data.full_name,
        data.email,
        data.phone,
        data.lease_start,
        data.lease_end,
        data.rent_amount,
        data.deposit_amount,
      ]
    );
    await syncUnitStatus(data.unit_id);
    res.status(201).json(rows[0]);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      "SELECT unit_id FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!existingRows[0]) throw new ApiError(404, "Tenant not found");
    const previousUnitId = existingRows[0].unit_id;

    const data = parseTenantBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE tenants
       SET unit_id = $1, full_name = $2, email = $3, phone = $4, lease_start = $5, lease_end = $6, rent_amount = $7, deposit_amount = $8, updated_at = now()
       WHERE id = $9 AND business_id = $10
       RETURNING id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount, created_at`,
      [
        data.unit_id,
        data.full_name,
        data.email,
        data.phone,
        data.lease_start,
        data.lease_end,
        data.rent_amount,
        data.deposit_amount,
        req.params.id,
        req.businessId,
      ]
    );

    await syncUnitStatus(data.unit_id);
    if (previousUnitId !== data.unit_id) await syncUnitStatus(previousUnitId);

    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM tenants WHERE id = $1 AND business_id = $2 RETURNING unit_id",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    await syncUnitStatus(rows[0].unit_id);
    res.status(204).end();
  })
);

// Lets the property manager set or reset a tenant's portal login. There's
// no invite/self-signup flow yet — this is the manual stand-in for it.
router.put(
  "/:id/password",
  asyncHandler(async (req, res) => {
    const password = requirePassword(req.body.password);
    const { rows } = await pool.query(
      "UPDATE tenants SET password_hash = $1 WHERE id = $2 AND business_id = $3 RETURNING id",
      [await hashPassword(password), req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    res.status(204).end();
  })
);

export default router;
