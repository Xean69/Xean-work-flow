import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMessageBody, parseAnnouncementBody } from "../utils/validate.js";
import { notifyTenantOfNewMessage, notifyTenantOfAnnouncement } from "../services/email.js";

const router = Router();

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
