import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseUnitBody } from "../utils/validate.js";

const router = Router();

// Units have no business_id column of their own (see schema.sql) — they're
// scoped to a business through their property, so every route here checks
// ownership by joining to properties and filtering on business_id.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseUnitBody(req.body);
    const { rows } = await pool.query(
      `UPDATE units u
       SET unit_number = $1, bedrooms = $2, bathrooms = $3, rent_amount = $4, status = $5
       FROM properties p
       WHERE u.property_id = p.id AND u.id = $6 AND p.business_id = $7
       RETURNING u.*`,
      [data.unit_number, data.bedrooms, data.bathrooms, data.rent_amount, data.status, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Unit not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM units u
       USING properties p
       WHERE u.property_id = p.id AND u.id = $1 AND p.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Unit not found");
    res.status(204).end();
  })
);

export default router;
