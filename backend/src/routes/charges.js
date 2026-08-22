import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseChargeUpdateBody } from "../utils/validate.js";

const router = Router();

// ledger_charges has no business_id of its own — scoped through
// tenant_id -> tenants.business_id, same as tenant_addons/tenant_occupants.
// charge_type and period are structural and never edited here.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseChargeUpdateBody(req.body);
    const { rows } = await pool.query(
      `UPDATE ledger_charges c
       SET description = $1, amount = $2, due_date = $3
       FROM tenants t
       WHERE c.tenant_id = t.id AND c.id = $4 AND t.business_id = $5
       RETURNING c.*`,
      [data.description, data.amount, data.due_date, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Charge not found");
    res.json(rows[0]);
  })
);

// Blocked if any payment has already been allocated against this charge —
// a real charge that money was applied to shouldn't silently vanish along
// with the record of what that money paid for.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: chargeRows } = await pool.query(
      `SELECT c.id FROM ledger_charges c
       JOIN tenants t ON t.id = c.tenant_id
       WHERE c.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!chargeRows[0]) throw new ApiError(404, "Charge not found");

    const { rows: allocRows } = await pool.query(
      "SELECT 1 FROM payment_allocations WHERE charge_id = $1 LIMIT 1",
      [req.params.id]
    );
    if (allocRows[0]) {
      throw new ApiError(409, "A payment has already been applied to this charge — it can't be deleted.");
    }

    await pool.query("DELETE FROM ledger_charges WHERE id = $1", [req.params.id]);
    res.status(204).end();
  })
);

export default router;
