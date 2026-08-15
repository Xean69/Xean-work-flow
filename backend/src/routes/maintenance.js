import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMaintenanceBody } from "../utils/validate.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.*,
         u.unit_number,
         p.id AS property_id,
         p.name AS property_name,
         t.full_name AS tenant_name
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       ORDER BY m.created_at DESC`
    );
    res.json(rows);
  })
);

// New requests always start in the "new" column — status isn't something
// the create form exposes, so it's forced here before validation.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseMaintenanceBody({ ...req.body, status: "new" });
    const { rows } = await pool.query(
      `INSERT INTO maintenance_requests (unit_id, tenant_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, 'new', $5)
       RETURNING *`,
      [data.unit_id, data.tenant_id, data.title, data.description, data.priority]
    );
    res.status(201).json(rows[0]);
  })
);

// Used both for editing a ticket's details and for moving it between
// columns. resolved_at is managed here, not by the client: it's stamped
// the moment status becomes 'resolved' and cleared the moment it isn't.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseMaintenanceBody(req.body);
    const { rows } = await pool.query(
      `UPDATE maintenance_requests
       SET unit_id = $1,
           tenant_id = $2,
           title = $3,
           description = $4,
           status = $5,
           priority = $6,
           resolved_at = CASE
             WHEN $5 = 'resolved' AND status != 'resolved' THEN now()
             WHEN $5 != 'resolved' THEN NULL
             ELSE resolved_at
           END
       WHERE id = $7
       RETURNING *`,
      [data.unit_id, data.tenant_id, data.title, data.description, data.status, data.priority, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM maintenance_requests WHERE id = $1", [
      req.params.id,
    ]);
    if (!rowCount) throw new ApiError(404, "Maintenance request not found");
    res.status(204).end();
  })
);

export default router;
