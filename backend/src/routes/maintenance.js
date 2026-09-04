import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMaintenanceBody, parseMessageBody, parseAssignBody, parseRescheduleProposalBody } from "../utils/validate.js";
import { classifyMaintenanceRequest } from "../services/maintenanceTriage.js";
import { generateMaintenanceChatReply } from "../services/maintenanceChat.js";
import {
  notifyManagersOfMaintenanceRequest,
  notifyTenantOfMaintenanceReply,
  notifyStaffOfAssignment,
  notifyTenantOfRescheduleProposed,
} from "../services/email.js";
import { proposeReschedule } from "../services/maintenanceReschedule.js";
import { uploadChatAttachment, uploadToCloudinary, assertChatAttachmentSizeOk } from "../utils/upload.js";

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

async function assertStaffInBusiness(staffId, businessId) {
  if (staffId == null) return;
  const { rows } = await pool.query("SELECT id FROM maintenance_staff WHERE id = $1 AND business_id = $2", [
    staffId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "assigned_staff_id does not belong to your business");
}

// Excludes status = 'pending' — a tenant still chatting with the AI before
// any ticket exists (see routes/portal.js) never appears here at all,
// consistent with the kanban only ever rendering the three known columns.
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
         s.first_name AS assigned_staff_first_name,
         s.last_name AS assigned_staff_last_name,
         EXISTS (
           SELECT 1 FROM maintenance_comments c
           WHERE c.request_id = m.id
             AND c.sender IN ('tenant', 'ai', 'staff')
             AND c.created_at > COALESCE(m.manager_last_read_at, '-infinity'::timestamptz)
         ) AS unread_by_manager,
         -- No stored flag — a ticket is "still pending" purely as a function
         -- of its current status and how long ago its SLA clock last reset
         -- (see schema.sql's note on sla_clock_started_at), so this can
         -- never drift out of sync with reality the way a periodically-swept
         -- flag could.
         (m.status IN ('new', 'in_progress') AND m.sla_clock_started_at <= now() - interval '6 days') AS sla_warning,
         -- Overrides m.*'s entry_date (last column with a given name wins in
         -- node-pg's row-to-object mapping) — DATE columns carry no
         -- timezone, but node-pg's default parser reads them as local
         -- midnight in the server's own timezone, which can serialize to a
         -- different UTC calendar day. Casting to text sidesteps that
         -- entirely instead of depending on what timezone the server
         -- happens to run in.
         m.entry_date::text AS entry_date
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       LEFT JOIN maintenance_staff s ON s.id = m.assigned_staff_id
       WHERE m.business_id = $1 AND m.status != 'pending'
       ORDER BY (m.status IN ('new', 'in_progress') AND m.sla_clock_started_at <= now() - interval '6 days') DESC, m.created_at DESC`,
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
    const ticket = rows[0];

    // Classification runs once, right here on creation — never on a later
    // view or edit — to keep API costs down.
    const result = await classifyMaintenanceRequest(ticket.title, ticket.description);
    const { rows: updated } = await pool.query(
      `UPDATE maintenance_requests
       SET ai_urgency = $1, ai_trade = $2, ai_reasoning = $3, ai_classification_status = $4
       WHERE id = $5
       RETURNING *`,
      [result.urgency, result.trade, result.reasoning, result.status, ticket.id]
    );

    // A ticket added directly on the dashboard still notifies the other
    // managers/owner on the team — not just the one who created it.
    const { rows: contextRows } = await pool.query(
      `SELECT p.name AS property_name, u.unit_number, t.full_name AS tenant_name, t.language AS tenant_language
       FROM units u
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = $2
       WHERE u.id = $1`,
      [ticket.unit_id, ticket.tenant_id]
    );
    await notifyManagersOfMaintenanceRequest({
      businessId: req.businessId,
      title: ticket.title,
      description: ticket.description,
      propertyName: contextRows[0]?.property_name,
      unitNumber: contextRows[0]?.unit_number,
      tenantName: contextRows[0]?.tenant_name,
      aiUrgency: result.urgency,
      aiTrade: result.trade,
    });

    // Only when a tenant is actually attached — a manager-only ticket with
    // no tenant has no one for the assistant to chat with.
    if (ticket.tenant_id) {
      const firstReply = await generateMaintenanceChatReply({
        title: ticket.title,
        description: ticket.description,
        trade: result.trade,
        urgency: result.urgency,
        comments: [],
        language: contextRows[0]?.tenant_language,
      });
      if (firstReply) {
        await pool.query(
          "INSERT INTO maintenance_comments (business_id, request_id, sender, body) VALUES ($1, $2, 'ai', $3)",
          [req.businessId, ticket.id, firstReply]
        );
      }
    }

    res.status(201).json(updated[0]);
  })
);

// Opening a ticket's detail view marks it read from the manager's side —
// this is what clears the unread badge, same as opening an email. Also
// excludes status = 'pending', same reasoning as the list route above — a
// manager can't reach one of these even by guessing an id.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.*,
         u.unit_number,
         p.id AS property_id,
         p.name AS property_name,
         t.full_name AS tenant_name,
         t.phone AS tenant_phone,
         s.first_name AS assigned_staff_first_name,
         s.last_name AS assigned_staff_last_name,
         (m.status IN ('new', 'in_progress') AND m.sla_clock_started_at <= now() - interval '6 days') AS sla_warning,
         m.entry_date::text AS entry_date
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       LEFT JOIN maintenance_staff s ON s.id = m.assigned_staff_id
       WHERE m.id = $1 AND m.business_id = $2 AND m.status != 'pending'`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");

    const { rows: comments } = await pool.query(
      `SELECT mc.id, mc.sender, mc.body, mc.attachment_url, mc.attachment_cloudinary_resource_type,
              mc.attachment_file_name, mc.created_at, mc.staff_id, mc.is_completion_note,
              st.first_name AS staff_first_name
       FROM maintenance_comments mc
       LEFT JOIN maintenance_staff st ON st.id = mc.staff_id
       WHERE mc.request_id = $1 ORDER BY mc.created_at ASC`,
      [req.params.id]
    );

    // Unfiltered — a manager should see cancelled/superseded proposals too,
    // not just the ones the tenant actually got to respond to.
    const { rows: reschedules } = await pool.query(
      `SELECT r.id, r.proposed_by, r.staff_id, r.proposed_date::text AS proposed_date, r.proposed_time_window,
              r.status, r.responded_at, r.entry_permission, r.entry_date::text AS entry_date, r.created_at,
              st.first_name AS staff_first_name
       FROM maintenance_reschedules r
       LEFT JOIN maintenance_staff st ON st.id = r.staff_id
       WHERE r.request_id = $1 ORDER BY r.created_at ASC`,
      [req.params.id]
    );

    await pool.query("UPDATE maintenance_requests SET manager_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);

    res.json({ ...rows[0], comments, reschedules });
  })
);

router.post(
  "/:id/comments",
  uploadChatAttachment.single("attachment"),
  asyncHandler(async (req, res) => {
    if (req.file) assertChatAttachmentSizeOk(req.file);
    const data = parseMessageBody(req.body, { requireBody: !req.file });
    const { rows: ticketRows } = await pool.query(
      `SELECT m.id, m.title, t.email AS tenant_email, t.full_name AS tenant_name, t.language AS tenant_language
       FROM maintenance_requests m
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Maintenance request not found");

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
         (business_id, request_id, sender, body, attachment_url, attachment_cloudinary_public_id, attachment_cloudinary_resource_type, attachment_file_name)
       VALUES ($1, $2, 'manager', $3, $4, $5, $6, $7)
       RETURNING id, sender, body, attachment_url, attachment_cloudinary_resource_type, attachment_file_name, created_at`,
      [
        req.businessId,
        req.params.id,
        data.body,
        uploaded?.url || null,
        uploaded?.publicId || null,
        uploaded?.resourceType || null,
        req.file?.originalname || null,
      ]
    );
    // Sending a comment implies you've seen the thread up to now too.
    await pool.query("UPDATE maintenance_requests SET manager_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);

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

// Used both for editing a ticket's details and for moving it between
// columns. resolved_at is managed here, not by the client: it's stamped
// the moment status becomes 'resolved' and cleared the moment it isn't.
// sla_clock_started_at gets the same reopen treatment — a ticket reopened
// months after being resolved shouldn't instantly re-flag as overdue using
// a clock that stopped mattering the moment it closed. And since a dangling
// reschedule proposal on a now-closed ticket would let a tenant "respond"
// to something moot, resolving cancels any of its own that's still
// pending, or approved but waiting on an entry-permission answer — both in
// the same transaction as the status change.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseMaintenanceBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
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
             END,
             sla_clock_started_at = CASE
               WHEN $5 != 'resolved' AND status = 'resolved' THEN now()
               ELSE sla_clock_started_at
             END
         WHERE id = $7 AND business_id = $8
         RETURNING *`,
        [data.unit_id, data.tenant_id, data.title, data.description, data.status, data.priority, req.params.id, req.businessId]
      );
      if (!rows[0]) throw new ApiError(404, "Maintenance request not found");

      if (data.status === "resolved") {
        await client.query(
          `UPDATE maintenance_reschedules
           SET status = 'cancelled'
           WHERE request_id = $1 AND (status = 'pending' OR (status = 'approved' AND entry_permission IS NULL))`,
          [req.params.id]
        );
      }

      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// Proposes a new visit date on an open ticket — see
// services/maintenanceReschedule.js for the shared logic with the staff
// equivalent (staff.js POST /maintenance/:id/reschedules).
router.post(
  "/:id/reschedules",
  asyncHandler(async (req, res) => {
    const data = parseRescheduleProposalBody(req.body);
    const proposal = await proposeReschedule({
      requestId: req.params.id,
      businessId: req.businessId,
      proposedBy: "manager",
      staffId: null,
      proposedDate: data.proposedDate,
      proposedTimeWindow: data.proposedTimeWindow,
    });

    const { rows: ticketRows } = await pool.query(
      `SELECT m.title, t.email AS tenant_email, t.full_name AS tenant_name, t.language AS tenant_language
       FROM maintenance_requests m
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1`,
      [req.params.id]
    );
    await notifyTenantOfRescheduleProposed({
      tenantEmail: ticketRows[0]?.tenant_email,
      tenantName: ticketRows[0]?.tenant_name,
      ticketTitle: ticketRows[0]?.title,
      proposedDate: proposal.proposed_date,
      language: ticketRows[0]?.tenant_language,
    });

    res.status(201).json(proposal);
  })
);

// Narrow and separate from the full PUT /:id edit above — assigning
// shouldn't require resending title/description/status/priority just to
// attach (or clear) a name. null unassigns.
router.patch(
  "/:id/assign",
  asyncHandler(async (req, res) => {
    const data = parseAssignBody(req.body);
    await assertStaffInBusiness(data.assignedStaffId, req.businessId);

    const { rows } = await pool.query(
      `UPDATE maintenance_requests SET assigned_staff_id = $1 WHERE id = $2 AND business_id = $3
       RETURNING id, title, unit_id`,
      [data.assignedStaffId, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");

    if (data.assignedStaffId != null) {
      const { rows: staffRows } = await pool.query(
        "SELECT first_name, last_name, email, language FROM maintenance_staff WHERE id = $1",
        [data.assignedStaffId]
      );
      const { rows: contextRows } = await pool.query(
        `SELECT p.name AS property_name, u.unit_number
         FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = $1`,
        [rows[0].unit_id]
      );
      const staff = staffRows[0];
      await notifyStaffOfAssignment({
        staffEmail: staff.email,
        staffName: `${staff.first_name} ${staff.last_name}`,
        ticketTitle: rows[0].title,
        propertyName: contextRows[0]?.property_name,
        unitNumber: contextRows[0]?.unit_number,
        language: staff.language,
      });
    }

    res.status(204).end();
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
