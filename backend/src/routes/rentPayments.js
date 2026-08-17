import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseRentPaymentBody } from "../utils/validate.js";
import { requireRole } from "../utils/auth.js";

const router = Router();

// Mounted for owner/manager/accountant alike (see index.js) so accountants
// can review payment history the same way they can expenses and owner
// statements — but recording, editing, and deleting a payment are
// staff-only, applied per-route here rather than at the mount level.
const staffOnly = requireRole("owner", "manager");

async function assertTenantInBusiness(tenantId, businessId) {
  const { rows } = await pool.query("SELECT id FROM tenants WHERE id = $1 AND business_id = $2", [
    tenantId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "tenant_id does not belong to your business");
}

// GET /api/rent-payments?tenant_id=X — payment history for one tenant,
// most recent first. Not a general ledger view (there's no "list every
// payment across the business" use case yet), so tenant_id is required.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = Number(req.query.tenant_id);
    if (!tenantId) throw new ApiError(400, "tenant_id query parameter is required");
    await assertTenantInBusiness(tenantId, req.businessId);

    const { rows } = await pool.query(
      `SELECT rp.*, a.email AS recorded_by_email
       FROM rent_payments rp
       LEFT JOIN admins a ON a.id = rp.recorded_by
       WHERE rp.tenant_id = $1 AND rp.business_id = $2
       ORDER BY rp.payment_date DESC, rp.created_at DESC`,
      [tenantId, req.businessId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  staffOnly,
  asyncHandler(async (req, res) => {
    const data = parseRentPaymentBody(req.body);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO rent_payments (business_id, tenant_id, amount, payment_date, method, period_covered, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.businessId,
        data.tenant_id,
        data.amount,
        data.payment_date,
        data.method,
        data.period_covered,
        data.notes,
        req.adminId,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

// recorded_by is deliberately left untouched here — an edit shouldn't
// change who's credited with originally recording the payment.
router.put(
  "/:id",
  staffOnly,
  asyncHandler(async (req, res) => {
    const data = parseRentPaymentBody(req.body);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE rent_payments
       SET tenant_id = $1, amount = $2, payment_date = $3, method = $4, period_covered = $5, notes = $6
       WHERE id = $7 AND business_id = $8
       RETURNING *`,
      [
        data.tenant_id,
        data.amount,
        data.payment_date,
        data.method,
        data.period_covered,
        data.notes,
        req.params.id,
        req.businessId,
      ]
    );
    if (!rows[0]) throw new ApiError(404, "Payment not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM rent_payments WHERE id = $1 AND business_id = $2", [
      req.params.id,
      req.businessId,
    ]);
    if (!rowCount) throw new ApiError(404, "Payment not found");
    res.status(204).end();
  })
);

export default router;
