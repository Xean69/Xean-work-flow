import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseRecurringChargeBody } from "../utils/validate.js";

const router = Router();

// Edits the definition only — already-generated ledger_charges instances
// from past periods keep whatever amount/description they were created
// with, same as an addon's price change never rewrites past charges.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseRecurringChargeBody(req.body);
    const { rows } = await pool.query(
      `UPDATE recurring_charges rc
       SET description = $1, amount = $2
       FROM tenants t
       WHERE rc.tenant_id = t.id AND rc.id = $3 AND t.business_id = $4
       RETURNING rc.*`,
      [data.description, data.amount, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Recurring charge not found");
    res.json(rows[0]);
  })
);

// "Delete" here means stop future generation (active = false), not erase
// the definition — already-generated charge instances keep their link to
// it so the ledger's history stays intact.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE recurring_charges rc
       SET active = false
       FROM tenants t
       WHERE rc.tenant_id = t.id AND rc.id = $1 AND t.business_id = $2
       RETURNING rc.id`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Recurring charge not found");
    res.status(204).end();
  })
);

export default router;
