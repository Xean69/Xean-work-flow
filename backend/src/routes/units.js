import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseUnitBody } from "../utils/validate.js";

const router = Router();

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseUnitBody(req.body);
    const { rows } = await pool.query(
      `UPDATE units
       SET unit_number = $1, bedrooms = $2, bathrooms = $3, rent_amount = $4, status = $5
       WHERE id = $6
       RETURNING *`,
      [data.unit_number, data.bedrooms, data.bathrooms, data.rent_amount, data.status, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Unit not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM units WHERE id = $1", [req.params.id]);
    if (!rowCount) throw new ApiError(404, "Unit not found");
    res.status(204).end();
  })
);

export default router;
