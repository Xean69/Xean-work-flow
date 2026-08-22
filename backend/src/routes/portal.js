import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { verifyPassword, hashPassword, requireTenantAuth } from "../utils/auth.js";
import { parsePortalRepairBody, parseMessageBody, parseForgotPasswordBody, parseTenantResetPasswordBody, requireString } from "../utils/validate.js";
import { classifyMaintenanceRequest } from "../services/maintenanceTriage.js";
import { generateMaintenanceChatReply } from "../services/maintenanceChat.js";
import { currentPeriod } from "../utils/period.js";
import {
  notifyManagersOfMaintenanceRequest,
  notifyManagersOfMaintenanceEmergency,
  notifyManagersOfTenantMessage,
  sendTenantPasswordResetEmail,
} from "../services/email.js";
import { generateResetToken, hashResetToken } from "../utils/resetToken.js";
import { loadInspection } from "./moveInInspections.js";
import { getPeriodStatus } from "../utils/ledger.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const { rows } = await pool.query(
      "SELECT id, full_name, email, password_hash FROM tenants WHERE lower(email) = lower($1)",
      [email]
    );
    const tenant = rows[0];

    // Same generic error whether the email doesn't exist, has no password
    // set yet, or the password is wrong — never hint at which case it was.
    if (!tenant || !tenant.password_hash || !(await verifyPassword(password, tenant.password_hash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    req.session.tenantId = tenant.id;
    res.json({ id: tenant.id, full_name: tenant.full_name, email: tenant.email });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});

// Same shape and same reasoning as the dashboard's /api/admin/forgot-password
// — identical response whether or not the email belongs to a tenant, so
// this can't be used to check who has a portal login.
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const data = parseForgotPasswordBody(req.body);
    const { rows } = await pool.query("SELECT id, email FROM tenants WHERE lower(email) = lower($1)", [
      data.email,
    ]);
    const tenant = rows[0];

    if (tenant) {
      const { token, tokenHash, expiresAt } = generateResetToken();
      await pool.query("UPDATE tenants SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3", [
        tokenHash,
        expiresAt,
        tenant.id,
      ]);
      await sendTenantPasswordResetEmail({ email: tenant.email, token });
    }

    res.json({ message: "If that email exists, we've sent a reset link." });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const data = parseTenantResetPasswordBody(req.body);
    const { rows } = await pool.query(
      "SELECT id FROM tenants WHERE reset_token_hash = $1 AND reset_token_expires_at > now()",
      [hashResetToken(data.token)]
    );
    if (!rows[0]) throw new ApiError(400, "This reset link is invalid or has expired.");

    await pool.query(
      "UPDATE tenants SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $2",
      [await hashPassword(data.password), rows[0].id]
    );
    res.status(204).end();
  })
);

router.get(
  "/me",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.full_name, t.email, t.rent_amount, t.deposit_amount,
         t.lease_start, t.lease_end, t.first_period_rent_amount,
         u.unit_number,
         p.name AS property_name, p.address, p.city, p.province, p.postal_code,
         COALESCE(ta.addon_total, 0) AS addon_total,
         ta.addons
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(ta2.quantity * pa.monthly_price) AS addon_total,
           json_agg(
             json_build_object(
               'id', ta2.id,
               'addon_id', pa.id,
               'name', pa.name,
               'quantity', ta2.quantity,
               'unit_price', pa.monthly_price,
               'subtotal', ta2.quantity * pa.monthly_price
             )
             ORDER BY pa.name
           ) AS addons
         FROM tenant_addons ta2
         JOIN property_addons pa ON pa.id = ta2.addon_id
         WHERE ta2.tenant_id = t.id
       ) ta ON true
       WHERE t.id = $1`,
      [req.tenantId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    const tenant = rows[0];
    // Same period-scoped meaning the old rentAmount+addonTotal formula
    // produced (see utils/ledger.js) — sourced from real ledger charge rows
    // instead of live math, but unchanged in what it means to the tenant.
    const periodStatus = await getPeriodStatus(tenant.id, currentPeriod());
    res.json({
      ...tenant,
      addons: tenant.addons || [],
      current_period: currentPeriod(),
      payment_status: periodStatus.status,
    });
  })
);

router.get(
  "/documents",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, file_name, doc_type, uploaded_at
       FROM documents
       WHERE tenant_id = $1
       ORDER BY uploaded_at DESC`,
      [req.tenantId]
    );
    res.json(rows);
  })
);

// Deliberately separate from the manager's /api/documents/:id/download,
// which has no ownership check at all — this one confirms the document
// actually belongs to the logged-in tenant before serving anything.
router.get(
  "/documents/:id/download",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT file_url FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");
    if (!doc.file_url) {
      throw new ApiError(404, "This file predates Cloudinary storage and is no longer available");
    }

    res.redirect(doc.file_url);
  })
);

// A draft is invisible here — only a finalized inspection "exists" as far
// as the tenant is concerned, so there's nothing to leak or half-show
// before the manager is done building it.
router.get(
  "/inspection",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id FROM move_in_inspections WHERE tenant_id = $1 AND status = 'finalized'",
      [req.tenantId]
    );
    if (!rows[0]) return res.json(null);
    res.json(await loadInspection(rows[0].id));
  })
);

router.post(
  "/inspection/sign",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const signedName = requireString(req.body.signed_name, "signed_name");
    const { rows } = await pool.query(
      `UPDATE move_in_inspections
       SET signed_at = now(), signed_name = $1
       WHERE tenant_id = $2 AND status = 'finalized' AND signed_at IS NULL
       RETURNING id`,
      [signedName, req.tenantId]
    );
    if (!rows[0]) {
      throw new ApiError(400, "This inspection isn't available to sign right now");
    }
    res.json(await loadInspection(rows[0].id));
  })
);

router.get(
  "/maintenance",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.id, m.title, m.description, m.status, m.priority, m.created_at, m.resolved_at,
         m.ai_urgency, m.ai_trade, m.ai_reasoning, m.ai_classification_status, m.is_emergency,
         EXISTS (
           SELECT 1 FROM maintenance_comments c
           WHERE c.request_id = m.id
             AND c.sender IN ('manager', 'ai')
             AND c.created_at > COALESCE(m.tenant_last_read_at, '-infinity'::timestamptz)
         ) AS unread_by_tenant
       FROM maintenance_requests m
       WHERE m.tenant_id = $1
       ORDER BY m.created_at DESC`,
      [req.tenantId]
    );
    res.json(rows);
  })
);

// The unit is looked up from the tenant's own record, never taken from the
// request — a tenant can only ever file a repair against their own unit.
router.post(
  "/maintenance",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const data = parsePortalRepairBody(req.body);
    const { rows: tenantRows } = await pool.query("SELECT unit_id, full_name FROM tenants WHERE id = $1", [
      req.tenantId,
    ]);
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");
    // units has no business_id of its own — it hangs off properties, which
    // does. (Pre-existing bug found while wiring this up: this INSERT never
    // set business_id before, and the column is NOT NULL — every portal
    // repair submission was failing outright. Fixed here as part of the
    // same change, since triage can't be tested through the portal without it.)
    const { rows: unitRows } = await pool.query(
      `SELECT p.business_id, p.name AS property_name, u.unit_number
       FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = $1`,
      [tenantRows[0].unit_id]
    );

    const { rows } = await pool.query(
      `INSERT INTO maintenance_requests (business_id, unit_id, tenant_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, $5, 'new', $6)
       RETURNING id, title, description, status, priority, created_at, resolved_at`,
      [unitRows[0]?.business_id, tenantRows[0].unit_id, req.tenantId, data.title, data.description, data.priority]
    );
    const ticket = rows[0];

    // Same classification pass as the dashboard's create route — runs once,
    // right here, regardless of which side opened the ticket.
    const result = await classifyMaintenanceRequest(ticket.title, ticket.description);
    const { rows: updated } = await pool.query(
      `UPDATE maintenance_requests
       SET ai_urgency = $1, ai_trade = $2, ai_reasoning = $3, ai_classification_status = $4
       WHERE id = $5
       RETURNING id, title, description, status, priority, created_at, resolved_at, ai_urgency, ai_trade, ai_reasoning, ai_classification_status, is_emergency`,
      [result.urgency, result.trade, result.reasoning, result.status, ticket.id]
    );

    await notifyManagersOfMaintenanceRequest({
      businessId: unitRows[0]?.business_id,
      title: ticket.title,
      description: ticket.description,
      propertyName: unitRows[0]?.property_name,
      unitNumber: unitRows[0]?.unit_number,
      tenantName: tenantRows[0].full_name,
      aiUrgency: result.urgency,
      aiTrade: result.trade,
    });

    // The tenant's first message in the thread — a clarifying question or a
    // safe troubleshooting tip, before a human manager needs to get
    // involved at all.
    const firstReply = await generateMaintenanceChatReply({
      title: ticket.title,
      description: ticket.description,
      trade: result.trade,
      urgency: result.urgency,
      comments: [],
    });
    if (firstReply) {
      await pool.query(
        "INSERT INTO maintenance_comments (business_id, request_id, sender, body) VALUES ($1, $2, 'ai', $3)",
        [unitRows[0]?.business_id, ticket.id, firstReply]
      );
    }

    res.status(201).json(updated[0]);
  })
);

// Ownership is checked in the WHERE clause, not just by looking the row up
// by id — a tenant can only ever open their own repair requests. Opening
// the thread marks it read from the tenant's side.
router.get(
  "/maintenance/:id",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, title, description, status, priority, created_at, resolved_at,
              ai_urgency, ai_trade, ai_reasoning, ai_classification_status, is_emergency
       FROM maintenance_requests
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (!rows[0]) throw new ApiError(404, "Maintenance request not found");

    const { rows: comments } = await pool.query(
      "SELECT id, sender, body, created_at FROM maintenance_comments WHERE request_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );

    await pool.query("UPDATE maintenance_requests SET tenant_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);

    res.json({ ...rows[0], comments });
  })
);

router.post(
  "/maintenance/:id/comments",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const data = parseMessageBody(req.body);
    const { rows: ticketRows } = await pool.query(
      `SELECT id, business_id, title, description, ai_trade, ai_urgency, is_emergency
       FROM maintenance_requests WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Maintenance request not found");
    const ticket = ticketRows[0];

    // Pre-existing bug found while wiring up email notifications: this
    // INSERT never set business_id before, and the column is NOT NULL — a
    // tenant replying to their own ticket's thread was failing outright.
    const { rows } = await pool.query(
      `INSERT INTO maintenance_comments (business_id, request_id, sender, body)
       VALUES ($1, $2, 'tenant', $3)
       RETURNING id, sender, body, created_at`,
      [ticket.business_id, req.params.id, data.body]
    );
    await pool.query("UPDATE maintenance_requests SET tenant_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);

    // Once a ticket is flagged an emergency, the AI stops chiming in
    // entirely — a human manager has taken over from there.
    if (!ticket.is_emergency) {
      const { rows: comments } = await pool.query(
        "SELECT sender, body FROM maintenance_comments WHERE request_id = $1 ORDER BY created_at ASC",
        [req.params.id]
      );
      const reply = await generateMaintenanceChatReply({
        title: ticket.title,
        description: ticket.description,
        trade: ticket.ai_trade,
        urgency: ticket.ai_urgency,
        comments,
      });
      if (reply) {
        await pool.query(
          "INSERT INTO maintenance_comments (business_id, request_id, sender, body) VALUES ($1, $2, 'ai', $3)",
          [ticket.business_id, req.params.id, reply]
        );
      }
    }

    res.status(201).json(rows[0]);
  })
);

// Tenant-initiated escalation — idempotent, so a double-click can't send a
// second emergency email or post a second acknowledgment. priority (not
// ai_urgency) is the field that actually drives the kanban's urgency dot,
// same as everywhere else "how urgent is this" gets decided.
router.post(
  "/maintenance/:id/emergency",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows: ticketRows } = await pool.query(
      `SELECT m.id, m.business_id, m.title, m.is_emergency, p.name AS property_name, u.unit_number, t.full_name AS tenant_name
       FROM maintenance_requests m
       JOIN units u ON u.id = m.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Maintenance request not found");
    const ticket = ticketRows[0];

    if (ticket.is_emergency) {
      return res.json({ is_emergency: true });
    }

    await pool.query("UPDATE maintenance_requests SET priority = 'high', is_emergency = true WHERE id = $1", [
      ticket.id,
    ]);
    await pool.query(
      `INSERT INTO maintenance_comments (business_id, request_id, sender, body)
       VALUES ($1, $2, 'ai', 'This has been flagged as an emergency. A manager has been notified and will reach out as soon as possible.')`,
      [ticket.business_id, ticket.id]
    );

    await notifyManagersOfMaintenanceEmergency({
      businessId: ticket.business_id,
      title: ticket.title,
      propertyName: ticket.property_name,
      unitNumber: ticket.unit_number,
      tenantName: ticket.tenant_name,
    });

    res.json({ is_emergency: true });
  })
);

router.get(
  "/messages",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, sender, body, created_at FROM messages WHERE tenant_id = $1 ORDER BY created_at ASC",
      [req.tenantId]
    );
    res.json(rows);
  })
);

router.post(
  "/messages",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const data = parseMessageBody(req.body);
    // Pre-existing bug found while wiring up email notifications: this
    // INSERT never set business_id before, and the column is NOT NULL —
    // every message a tenant sent through the portal was failing outright.
    const { rows: tenantRows } = await pool.query("SELECT business_id, full_name FROM tenants WHERE id = $1", [
      req.tenantId,
    ]);
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const { rows } = await pool.query(
      `INSERT INTO messages (business_id, tenant_id, sender, body)
       VALUES ($1, $2, 'tenant', $3)
       RETURNING id, sender, body, created_at`,
      [tenantRows[0].business_id, req.tenantId, data.body]
    );

    await notifyManagersOfTenantMessage({
      businessId: tenantRows[0].business_id,
      tenantName: tenantRows[0].full_name,
      messageBody: data.body,
    });

    res.status(201).json(rows[0]);
  })
);

export default router;
