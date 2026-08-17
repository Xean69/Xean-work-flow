import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMaintenanceBody, parseMessageBody } from "../utils/validate.js";

const router = Router();

async function assertUnitInBusiness(unitId, businessId) {
  const { rows } = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = $1 AND p.business_id = $2`,
    [unitId, businessId]
  );
  if (!rows[0]) throw new ApiError(400, "unit_id does not belong to a property in your business");
}

async function assertTenantInBusiness(tenantId, businessId) {
  if (tenantId == null) return;
  const { rows } = await pool.query("SELECT id FROM tenants WHERE id = $1 AND business_id = $2", [
    tenantId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "tenant_id does not belong to your business");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.*,
         u.unit_number,
         p.id AS property_id,
         p.name AS property_name,
         t.full_name AS tenant_name,
         EXISTS (
           SELECT 1 FROM maintenance_comments c
           WHERE c.request_id = m.id
             AND c.sender = 'tenant'
             AND c.created_at > COALESCE(m.manager_last_read_at, '-infinity'::timestamptz)
         ) AS unread_by_manager
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.business_id = $1
       ORDER BY m.created_at DESC`,
      [req.businessId]
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
    await assertUnitInBusiness(data.unit_id, req.businessId);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO maintenance_requests (business_id, unit_id, tenant_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, $5, 'new', $6)
       RETURNING *`,
      [req.businessId, data.unit_id, data.tenant_id, data.title, data.description, data.priority]
    );
    res.status(201).json(rows[0]);
  })
);

// Opening a ticket's detail view marks it read from the manager's side —
// this is what clears the unread badge, same as opening an email.
router.get(
  "/:id",
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
       WHERE m.id = $1 AND m.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");

    const { rows: comments } = await pool.query(
      "SELECT id, sender, body, created_at FROM maintenance_comments WHERE request_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );

    await pool.query("UPDATE maintenance_requests SET manager_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);

    res.json({ ...rows[0], comments });
  })
);

router.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const data = parseMessageBody(req.body);
    const { rows: ticketRows } = await pool.query(
      "SELECT id FROM maintenance_requests WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Maintenance request not found");

    const { rows } = await pool.query(
      `INSERT INTO maintenance_comments (business_id, request_id, sender, body)
       VALUES ($1, $2, 'manager', $3)
       RETURNING id, sender, body, created_at`,
      [req.businessId, req.params.id, data.body]
    );
    // Sending a comment implies you've seen the thread up to now too.
    await pool.query("UPDATE maintenance_requests SET manager_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);
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
    await assertUnitInBusiness(data.unit_id, req.businessId);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

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
       WHERE id = $7 AND business_id = $8
       RETURNING *`,
      [data.unit_id, data.tenant_id, data.title, data.description, data.status, data.priority, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM maintenance_requests WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Maintenance request not found");
    res.status(204).end();
  })
);

export default router;
