import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseEvictionEventBody } from "../utils/validate.js";

const router = Router();

// eviction_events has no business_id of its own — scoped through
// tenant_id -> tenants.business_id, same as tenant_addons/tenant_occupants.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseEvictionEventBody(req.body);
    const { rows } = await pool.query(
      `UPDATE eviction_events e
       SET notice_type = $1, stage = $2, date_issued = $3, notes = $4
       FROM tenants t
       WHERE e.tenant_id = t.id AND e.id = $5 AND t.business_id = $6
       RETURNING e.*`,
      [data.notice_type, data.stage, data.date_issued, data.notes, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Eviction event not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM eviction_events e
       USING tenants t
       WHERE e.tenant_id = t.id AND e.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Eviction event not found");
    res.status(204).end();
  })
);

export default router;
