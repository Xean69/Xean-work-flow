import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseComplianceCheckBody, parseComplianceStatusBody } from "../utils/validate.js";

const router = Router();

async function assertPropertyInBusiness(propertyId, businessId) {
  const { rows } = await pool.query("SELECT id FROM properties WHERE id = $1 AND business_id = $2", [
    propertyId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "property_id does not belong to your business");
}

// GET / - every check for the business, newest first within each
// property. Grouping by property happens on the frontend; this just
// includes property_name so it doesn't need a second round trip.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*, p.name AS property_name
       FROM compliance_checks c
       JOIN properties p ON p.id = c.property_id
       WHERE c.business_id = $1
       ORDER BY p.name, c.created_at DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseComplianceCheckBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO compliance_checks (business_id, property_id, title, description, clause_reference, severity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.businessId, data.property_id, data.title, data.description, data.clause_reference, data.severity]
    );
    res.status(201).json(rows[0]);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseComplianceCheckBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE compliance_checks
       SET property_id = $1, title = $2, description = $3, clause_reference = $4, severity = $5
       WHERE id = $6 AND business_id = $7
       RETURNING *`,
      [data.property_id, data.title, data.description, data.clause_reference, data.severity, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Compliance check not found");
    res.json(rows[0]);
  })
);

// Separate lightweight endpoint for the resolve/reopen toggle, distinct
// from the full edit above — mirrors the Documents review-status route.
router.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = parseComplianceStatusBody(req.body);
    const { rows } = await pool.query(
      "UPDATE compliance_checks SET status = $1 WHERE id = $2 AND business_id = $3 RETURNING *",
      [data.status, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Compliance check not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM compliance_checks WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Compliance check not found");
    res.status(204).end();
  })
);

export default router;
