import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseGuideSectionBody } from "../utils/validate.js";

const router = Router();

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseGuideSectionBody(req.body);
    const { rows } = await pool.query(
      `UPDATE property_guides
       SET section_title = $1, content = $2
       WHERE id = $3 AND business_id = $4
       RETURNING *`,
      [data.section_title, data.content, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Guide section not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM property_guides WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Guide section not found");
    res.status(204).end();
  })
);

export default router;
