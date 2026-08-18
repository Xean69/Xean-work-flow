import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { verifyPassword, requireTenantAuth } from "../utils/auth.js";
import { UPLOADS_DIR } from "../utils/upload.js";
import { parsePortalRepairBody, parseMessageBody } from "../utils/validate.js";
import { classifyMaintenanceRequest } from "../services/maintenanceTriage.js";
import { currentPeriod } from "../utils/period.js";
import { notifyManagersOfMaintenanceRequest, notifyManagersOfTenantMessage } from "../services/email.js";

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

// Same paid-vs-rent-for-the-current-period logic as GET /api/tenants on the
// manager side (tenants.js) — kept as its own small copy here rather than a
// shared import since the two routes' surrounding queries don't otherwise
// overlap. paid >= rent covers $0 rent as trivially "paid" with no
// special-casing needed.
function computePaymentStatus(rentAmount, paidAmount) {
  const rent = Number(rentAmount) || 0;
  const paid = Number(paidAmount) || 0;
  if (paid >= rent) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
}

router.get(
  "/me",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.full_name, t.email, t.rent_amount, t.deposit_amount,
         t.lease_start, t.lease_end,
         u.unit_number,
         p.name AS property_name, p.address, p.city, p.province, p.postal_code,
         COALESCE((
           SELECT SUM(amount) FROM rent_payments
           WHERE tenant_id = t.id AND period_covered = $2
         ), 0) AS current_period_paid
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE t.id = $1`,
      [req.tenantId, currentPeriod()]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    const tenant = rows[0];
    res.json({
      ...tenant,
      current_period: currentPeriod(),
      payment_status: computePaymentStatus(tenant.rent_amount, tenant.current_period_paid),
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
      "SELECT file_name, file_path FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");

    res.setHeader("Content-Disposition", `inline; filename="${doc.file_name}"`);
    res.sendFile(path.join(UPLOADS_DIR, doc.file_path), (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "File not found on disk" });
      }
    });
  })
);

router.get(
  "/maintenance",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         m.id, m.title, m.description, m.status, m.priority, m.created_at, m.resolved_at,
         m.ai_urgency, m.ai_trade, m.ai_reasoning, m.ai_classification_status,
         EXISTS (
           SELECT 1 FROM maintenance_comments c
           WHERE c.request_id = m.id
             AND c.sender = 'manager'
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
       RETURNING id, title, description, status, priority, created_at, resolved_at, ai_urgency, ai_trade, ai_reasoning, ai_classification_status`,
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
              ai_urgency, ai_trade, ai_reasoning, ai_classification_status
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
      "SELECT id, business_id FROM maintenance_requests WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Maintenance request not found");

    // Pre-existing bug found while wiring up email notifications: this
    // INSERT never set business_id before, and the column is NOT NULL — a
    // tenant replying to their own ticket's thread was failing outright.
    const { rows } = await pool.query(
      `INSERT INTO maintenance_comments (business_id, request_id, sender, body)
       VALUES ($1, $2, 'tenant', $3)
       RETURNING id, sender, body, created_at`,
      [ticketRows[0].business_id, req.params.id, data.body]
    );
    await pool.query("UPDATE maintenance_requests SET tenant_last_read_at = now() WHERE id = $1", [
      req.params.id,
    ]);
    res.status(201).json(rows[0]);
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

// The property is derived from the tenant's own unit, never taken from the
// request — a tenant can only ever see their own property's guide.
router.get(
  "/guide",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT g.id, g.section_title, g.content
       FROM property_guides g
       JOIN units u ON u.property_id = g.property_id
       JOIN tenants t ON t.unit_id = u.id
       WHERE t.id = $1
       ORDER BY g.sort_order, g.id`,
      [req.tenantId]
    );
    res.json(rows);
  })
);

export default router;
