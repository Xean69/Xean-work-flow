import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseOccupantBody } from "../utils/validate.js";

const router = Router();

// tenant_occupants has no business_id of its own — it's scoped through
// tenant_id -> tenants.business_id, same as tenant_addons.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseOccupantBody(req.body);
    const { rows } = await pool.query(
      `UPDATE tenant_occupants o
       SET full_name = $1, relationship = $2, notes = $3
       FROM tenants t
       WHERE o.tenant_id = t.id AND o.id = $4 AND t.business_id = $5
       RETURNING o.*`,
      [data.full_name, data.relationship, data.notes, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Occupant not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM tenant_occupants o
       USING tenants t
       WHERE o.tenant_id = t.id AND o.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Occupant not found");
    res.status(204).end();
  })
);

export default router;
