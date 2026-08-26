import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMessageBody, parseAnnouncementBody } from "../utils/validate.js";
import { notifyTenantOfNewMessage, notifyTenantOfAnnouncement, notifyStaffOfNewMessage } from "../services/email.js";

const router = Router();

// ============================================================================
// Staff-manager inbox — the manager-facing side of staff_messages (see
// schema.sql's note). Mirrors the tenant thread routes below in shape, but
// against maintenance_staff instead of tenants. /staff-threads and
// /staff/:staffId are both declared here, ahead of the tenant routes'
// GET /:tenantId, so Express never matches "staff-threads" or "staff" as a
// literal tenantId value.
// ============================================================================

router.get(
  "/staff-threads",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         s.id AS staff_id,
         s.first_name,
         s.last_name,
         m.body AS last_message,
         m.sender AS last_sender,
         m.created_at AS last_message_at
       FROM maintenance_staff s
       LEFT JOIN LATERAL (
         SELECT body, sender, created_at
         FROM staff_messages
         WHERE staff_id = s.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE s.business_id = $1
       ORDER BY COALESCE(m.created_at, s.created_at) DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

router.get(
  "/staff/:staffId",
  asyncHandler(async (req, res) => {
    const { rows: staffRows } = await pool.query(
      "SELECT id FROM maintenance_staff WHERE id = $1 AND business_id = $2",
      [req.params.staffId, req.businessId]
    );
    if (!staffRows[0]) throw new ApiError(404, "Maintenance team member not found");

    const { rows } = await pool.query(
      `SELECT id, sender, body, attachment_url, attachment_cloudinary_resource_type, attachment_file_name, created_at
       FROM staff_messages WHERE staff_id = $1 ORDER BY created_at ASC`,
      [req.params.staffId]
    );
    res.json(rows);
  })
);

router.post(
  "/staff/:staffId",
  asyncHandler(async (req, res) => {
    const data = parseMessageBody(req.body);
    const { rows: staffRows } = await pool.query(
      "SELECT id, first_name, last_name, email, language FROM maintenance_staff WHERE id = $1 AND business_id = $2",
      [req.params.staffId, req.businessId]
    );
    if (!staffRows[0]) throw new ApiError(404, "Maintenance team member not found");

    const { rows } = await pool.query(
      `INSERT INTO staff_messages (business_id, staff_id, sender, body)
       VALUES ($1, $2, 'manager', $3)
       RETURNING id, sender, body, created_at`,
      [req.businessId, req.params.staffId, data.body]
    );

    await notifyStaffOfNewMessage({
      staffEmail: staffRows[0].email,
      staffName: `${staffRows[0].first_name} ${staffRows[0].last_name}`,
      messageBody: data.body,
      language: staffRows[0].language,
    });

    res.status(201).json(rows[0]);
  })
);

// One row per tenant who has a portal login (only they can message), with
// their most recent message as a preview — including tenants who haven't
// sent anything yet, so the manager can start the conversation.
router.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         t.id AS tenant_id,
         t.full_name,
         u.unit_number,
         p.name AS property_name,
         m.body AS last_message,
         m.subject AS last_subject,
         m.sender AS last_sender,
         m.created_at AS last_message_at
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT body, subject, sender, created_at
         FROM messages
         WHERE tenant_id = t.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE t.password_hash IS NOT NULL AND t.business_id = $1
       ORDER BY COALESCE(m.created_at, t.created_at) DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

router.get(
  "/:tenantId",
  asyncHandler(async (req, res) => {
    const { rows: tenantRows } = await pool.query(
      "SELECT id FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.tenantId, req.businessId]
    );
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const { rows } = await pool.query(
      "SELECT id, sender, subject, body, created_at FROM messages WHERE tenant_id = $1 ORDER BY created_at ASC",
      [req.params.tenantId]
    );
    res.json(rows);
  })
);

// Declared before /:tenantId below so Express doesn't match "announce" as
// a :tenantId value. tenant_ids is the manager's already-fine-tuned
// recipient list (property filter + individual checkbox toggles resolved
// client-side) — re-validated here against this business, since a tenant
// id is client-supplied and could otherwise reach across businesses.
router.post(
  "/announce",
  asyncHandler(async (req, res) => {
    const data = parseAnnouncementBody(req.body);
    const { rows: tenantRows } = await pool.query(
      "SELECT id, email, full_name, language FROM tenants WHERE id = ANY($1) AND business_id = $2",
      [data.tenantIds, req.businessId]
    );

    const sendable = tenantRows.filter((t) => t.email);
    const skipped = tenantRows.filter((t) => !t.email).map((t) => ({ tenant_id: t.id, full_name: t.full_name }));

    await Promise.all(
      sendable.map(async (t) => {
        await pool.query(
          `INSERT INTO messages (business_id, tenant_id, sender, subject, body)
           VALUES ($1, $2, 'manager', $3, $4)`,
          [req.businessId, t.id, data.subject, data.body]
        );
        await notifyTenantOfAnnouncement({
          tenantEmail: t.email,
          tenantName: t.full_name,
          subject: data.subject,
          announcementBody: data.body,
          language: t.language,
        });
      })
    );

    res.status(201).json({ sent: sendable.length, skipped });
  })
);

router.post(
  "/:tenantId",
  asyncHandler(async (req, res) => {
    const data = parseMessageBody(req.body);
    const { rows: tenantRows } = await pool.query(
      "SELECT id, email, full_name, language FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.tenantId, req.businessId]
    );
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const { rows } = await pool.query(
      `INSERT INTO messages (business_id, tenant_id, sender, body)
       VALUES ($1, $2, 'manager', $3)
       RETURNING id, sender, body, created_at`,
      [req.businessId, req.params.tenantId, data.body]
    );

    await notifyTenantOfNewMessage({
      tenantEmail: tenantRows[0].email,
      tenantName: tenantRows[0].full_name,
      messageBody: data.body,
      language: tenantRows[0].language,
    });

    res.status(201).json(rows[0]);
  })
);

export default router;
