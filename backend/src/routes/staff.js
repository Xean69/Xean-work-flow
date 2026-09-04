import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { verifyPassword, requireStaffAuth } from "../utils/auth.js";
import { parseStaffStatusBody, parseAwayStatusBody, parseMessageBody, parseRescheduleProposalBody } from "../utils/validate.js";
import {
  notifyManagersOfStaffMessage,
  notifyTenantOfMaintenanceReply,
  notifyTenantOfRescheduleProposed,
} from "../services/email.js";
import { uploadChatAttachment, uploadToCloudinary, assertChatAttachmentSizeOk } from "../utils/upload.js";
import { proposeReschedule } from "../services/maintenanceReschedule.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const { rows } = await pool.query(
      "SELECT id, first_name, last_name, email, business_id, password_hash FROM maintenance_staff WHERE lower(email) = lower($1)",
      [email]
    );
    const staff = rows[0];

    // Same generic error whether the email doesn't exist, has no password
    // set yet, or the password is wrong — never hint at which case it was.
    if (!staff || !staff.password_hash || !(await verifyPassword(password, staff.password_hash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    req.session.staffId = staff.id;
    req.session.businessId = staff.business_id;
    res.json({ id: staff.id, first_name: staff.first_name, last_name: staff.last_name, email: staff.email });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});

router.get(
  "/me",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, first_name, last_name, email, phone, language, away, away_note FROM maintenance_staff WHERE id = $1",
      [req.staffId]
    );
    if (!rows[0]) throw new ApiError(404, "Not found");
    res.json(rows[0]);
  })
);

// The one manual half of presence — see schema.sql's note. away_note is
// only ever stored while away is true; turning away off always clears it,
// so a stale note can never resurface the next time someone goes away.
router.patch(
  "/me/status",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const data = parseAwayStatusBody(req.body);
    const { rows } = await pool.query(
      "UPDATE maintenance_staff SET away = $1, away_note = $2 WHERE id = $3 RETURNING id, away, away_note",
      [data.away, data.awayNote, req.staffId]
    );
    res.json(rows[0]);
  })
);

// Scoped to this staff member's own assignments only — the whole point of
// the staff portal being separate from the manager dashboard. Excludes
// status = 'pending' same as the manager board does; a ticket can't be
// assigned before it's promoted out of the pre-ticket AI chat anyway.
router.get(
  "/maintenance",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.id, m.title, m.description, m.status, m.priority, m.created_at, m.resolved_at,
         -- DATE columns carry no timezone, but node-pg's default parser reads
         -- them as local midnight in the server's own timezone, which can
         -- serialize to a different UTC calendar day — same cast used by the
         -- detail endpoint below and by maintenance.js's own list query.
         m.entry_permission, m.entry_date::text AS entry_date,
         u.unit_number, p.name AS property_name, t.full_name AS tenant_name
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.assigned_staff_id = $1 AND m.business_id = $2 AND m.status != 'pending'
       ORDER BY m.created_at DESC`,
      [req.staffId, req.businessId]
    );
    res.json(rows);
  })
);

// Includes the full comment thread (tenant/manager/ai/staff) — a
// technician needs the tenant's description/photos and any manager notes
// to actually do the job. Staff can also post into this thread themselves
// (see POST below) in addition to changing status.
router.get(
  "/maintenance/:id",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.id, m.title, m.description, m.status, m.priority, m.created_at, m.resolved_at,
         m.entry_permission, m.entry_date::text AS entry_date, m.is_emergency,
         m.ai_urgency, m.ai_trade, m.ai_classification_status,
         u.unit_number, p.name AS property_name, t.full_name AS tenant_name, t.phone AS tenant_phone
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.assigned_staff_id = $2 AND m.business_id = $3`,
      [req.params.id, req.staffId, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Ticket not found");

    const { rows: comments } = await pool.query(
      `SELECT mc.id, mc.sender, mc.body, mc.attachment_url, mc.attachment_cloudinary_resource_type,
              mc.attachment_file_name, mc.created_at, mc.staff_id, mc.is_completion_note,
              st.first_name AS staff_first_name
       FROM maintenance_comments mc
       LEFT JOIN maintenance_staff st ON st.id = mc.staff_id
       WHERE mc.request_id = $1 ORDER BY mc.created_at ASC`,
      [req.params.id]
    );

    const { rows: reschedules } = await pool.query(
      `SELECT r.id, r.proposed_by, r.staff_id, r.proposed_date::text AS proposed_date, r.proposed_time_window,
              r.status, r.responded_at, r.entry_permission, r.entry_date::text AS entry_date, r.created_at,
              st.first_name AS staff_first_name
       FROM maintenance_reschedules r
       LEFT JOIN maintenance_staff st ON st.id = r.staff_id
       WHERE r.request_id = $1 ORDER BY r.created_at ASC`,
      [req.params.id]
    );

    res.json({ ...rows[0], comments, reschedules });
  })
);

// The staff counterpart to routes/maintenance.js's manager comment route —
// same shape (attachment upload, plain INSERT, tenant notification), no AI
// call either, since a real human is typing. Scoped to this staff member's
// own assignment, same WHERE as the GET above, so posting into a ticket
// that isn't theirs 404s instead of silently succeeding.
router.post(
  "/maintenance/:id/comments",
  requireStaffAuth,
  uploadChatAttachment.single("attachment"),
  asyncHandler(async (req, res) => {
    if (req.file) assertChatAttachmentSizeOk(req.file);
    const data = parseMessageBody(req.body, { requireBody: !req.file });

    const { rows: ticketRows } = await pool.query(
      `SELECT m.id, m.title, t.email AS tenant_email, t.full_name AS tenant_name, t.language AS tenant_language
       FROM maintenance_requests m
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.assigned_staff_id = $2 AND m.business_id = $3`,
      [req.params.id, req.staffId, req.businessId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Ticket not found");

    let uploaded = null;
    if (req.file) {
      try {
        uploaded = await uploadToCloudinary(req.file.buffer, "xean/maintenance-chat");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload attachment, please try again");
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO maintenance_comments
         (business_id, request_id, sender, staff_id, is_completion_note, body,
          attachment_url, attachment_cloudinary_public_id, attachment_cloudinary_resource_type, attachment_file_name)
       VALUES ($1, $2, 'staff', $3, false, $4, $5, $6, $7, $8)
       RETURNING id, sender, body, attachment_url, attachment_cloudinary_resource_type, attachment_file_name, created_at`,
      [
        req.businessId,
        req.params.id,
        req.staffId,
        data.body,
        uploaded?.url || null,
        uploaded?.publicId || null,
        uploaded?.resourceType || null,
        req.file?.originalname || null,
      ]
    );

    // No tenant_email means either the ticket has no tenant attached or
    // that tenant has no email on file — notifyTenantOfMaintenanceReply
    // no-ops in that case rather than failing.
    await notifyTenantOfMaintenanceReply({
      tenantEmail: ticketRows[0].tenant_email,
      tenantName: ticketRows[0].tenant_name,
      ticketTitle: ticketRows[0].title,
      commentBody: data.body || "(sent an attachment)",
      language: ticketRows[0].tenant_language,
    });

    res.status(201).json(rows[0]);
  })
);

// Proposes a new visit date on this staff member's own assigned ticket —
// see services/maintenanceReschedule.js for the shared logic with the
// manager equivalent (routes/maintenance.js POST /:id/reschedules).
router.post(
  "/maintenance/:id/reschedules",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const data = parseRescheduleProposalBody(req.body);

    const { rows: ticketRows } = await pool.query(
      `SELECT m.title, t.email AS tenant_email, t.full_name AS tenant_name, t.language AS tenant_language
       FROM maintenance_requests m
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.assigned_staff_id = $2 AND m.business_id = $3`,
      [req.params.id, req.staffId, req.businessId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Ticket not found");

    const proposal = await proposeReschedule({
      requestId: req.params.id,
      businessId: req.businessId,
      proposedBy: "staff",
      staffId: req.staffId,
      proposedDate: data.proposedDate,
      proposedTimeWindow: data.proposedTimeWindow,
    });

    await notifyTenantOfRescheduleProposed({
      tenantEmail: ticketRows[0].tenant_email,
      tenantName: ticketRows[0].tenant_name,
      ticketTitle: ticketRows[0].title,
      proposedDate: proposal.proposed_date,
      language: ticketRows[0].tenant_language,
    });

    res.status(201).json(proposal);
  })
);

// The one field a staff member is allowed to change on their own assigned
// ticket — title/description/priority/reassignment stay manager-only via
// routes/maintenance.js's own, separate endpoints. Resolving requires a
// completion note (enforced in parseStaffStatusBody); it's inserted as a
// maintenance_comments row in the same transaction as the status change,
// so the note and the resolution can never end up disagreeing. This is one
// of two ways a sender='staff' comment gets created now (the other being
// the free-text POST /maintenance/:id/comments above) — is_completion_note
// is what the UI actually keys off to tell the two apart, not sender alone.
router.patch(
  "/maintenance/:id/status",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const data = parseStaffStatusBody(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `UPDATE maintenance_requests
         SET status = $1,
             resolved_at = CASE
               WHEN $1 = 'resolved' AND status != 'resolved' THEN now()
               WHEN $1 != 'resolved' THEN NULL
               ELSE resolved_at
             END,
             sla_clock_started_at = CASE
               WHEN $1 != 'resolved' AND status = 'resolved' THEN now()
               ELSE sla_clock_started_at
             END
         WHERE id = $2 AND assigned_staff_id = $3 AND business_id = $4
         RETURNING id, status, resolved_at, business_id`,
        [data.status, req.params.id, req.staffId, req.businessId]
      );
      if (!rows[0]) throw new ApiError(404, "Ticket not found");

      if (data.completionNote) {
        await client.query(
          "INSERT INTO maintenance_comments (business_id, request_id, sender, staff_id, body) VALUES ($1, $2, 'staff', $3, $4)",
          [rows[0].business_id, req.params.id, req.staffId, data.completionNote]
        );
      }

      if (data.status === "resolved") {
        await client.query(
          `UPDATE maintenance_reschedules
           SET status = 'cancelled'
           WHERE request_id = $1 AND (status = 'pending' OR (status = 'approved' AND entry_permission IS NULL))`,
          [req.params.id]
        );
      }

      await client.query("COMMIT");
      res.json({ id: rows[0].id, status: rows[0].status, resolved_at: rows[0].resolved_at });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// Staff-manager inbox — one thread per staff member (see schema.sql's note
// on staff_messages), separate from any specific ticket. No "threads" list
// needed here the way the manager's Inbox.jsx has one: a staff member only
// ever has this one thread with the manager.
// ============================================================================

router.get(
  "/messages",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, sender, body, attachment_url, attachment_cloudinary_resource_type, attachment_file_name, created_at
       FROM staff_messages WHERE staff_id = $1 ORDER BY created_at ASC`,
      [req.staffId]
    );
    res.json(rows);
  })
);

router.post(
  "/messages",
  requireStaffAuth,
  uploadChatAttachment.single("attachment"),
  asyncHandler(async (req, res) => {
    if (req.file) assertChatAttachmentSizeOk(req.file);
    const data = parseMessageBody(req.body, { requireBody: !req.file });

    let uploaded = null;
    if (req.file) {
      try {
        uploaded = await uploadToCloudinary(req.file.buffer, "xean/staff-messages");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload attachment, please try again");
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_messages
         (business_id, staff_id, sender, body, attachment_url, attachment_cloudinary_public_id, attachment_cloudinary_resource_type, attachment_file_name)
       VALUES ($1, $2, 'staff', $3, $4, $5, $6, $7)
       RETURNING id, sender, body, attachment_url, attachment_cloudinary_resource_type, attachment_file_name, created_at`,
      [
        req.businessId,
        req.staffId,
        data.body,
        uploaded?.url || null,
        uploaded?.publicId || null,
        uploaded?.resourceType || null,
        req.file?.originalname || null,
      ]
    );

    const { rows: staffRows } = await pool.query(
      "SELECT first_name, last_name FROM maintenance_staff WHERE id = $1",
      [req.staffId]
    );
    const staff = staffRows[0];
    await notifyManagersOfStaffMessage({
      businessId: req.businessId,
      staffName: `${staff.first_name} ${staff.last_name}`,
      messageBody: data.body || "(sent an attachment)",
    });

    res.status(201).json(rows[0]);
  })
);

export default router;
