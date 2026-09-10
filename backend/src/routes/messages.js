import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseMessageBody, parseAnnouncementBody } from "../utils/validate.js";
import { notifyTenantOfNewMessage, notifyTenantOfAnnouncement, notifyStaffOfNewMessage } from "../services/email.js";
import { pushToTenant, pushToStaff } from "../services/webPush.js";
import { uploadToCloudinary } from "../utils/upload.js";
import { generateAnnouncementPdfBuffer } from "../services/announcementPdf.js";

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
    await pushToStaff(req.params.staffId, { title: "New message", body: data.body, url: "/staff/messages" }, { mandatory: false });

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

    // Rendered once for the whole send, not once per recipient — the
    // letterhead, subject, body, and sent time are identical for everyone;
    // only the Cloudinary upload and documents row below are per-tenant, so
    // each recipient still ends up with their own independent file (see
    // announcementPdf.js). A failure here (a bad business_name/timezone
    // lookup, or jsPDF itself throwing) shouldn't block the announcement
    // itself from sending — it just means no PDF gets attached this time.
    let pdfBuffer = null;
    try {
      const { rows: businessRows } = await pool.query(
        "SELECT business_name, timezone FROM businesses WHERE id = $1",
        [req.businessId]
      );
      const business = businessRows[0];
      pdfBuffer = generateAnnouncementPdfBuffer({
        businessName: business?.business_name || "Xean",
        subject: data.subject || "Announcement",
        body: data.body,
        sentAt: new Date(),
        timezone: business?.timezone,
      });
    } catch (err) {
      console.error("Failed to generate announcement PDF:", err);
    }

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
        await pushToTenant(t.id, { title: data.subject || "Announcement", body: data.body, url: "/portal/messages" }, { mandatory: false });

        // A separate document row + Cloudinary asset per tenant, not one
        // shared file, so deleting one recipient's copy later can never
        // take another recipient's copy down with it. Deliberately no
        // notifyTenantOfNewDocument/pushToTenant("New document") here —
        // the announcement email/push above already told this tenant about
        // this exact thing; a second notification just for the PDF copy
        // sitting in their Documents section would be redundant. doc_type
        // 'other' skips AI extraction (see extraction.js's TOOLS map),
        // which a plain announcement letter has no use for.
        if (pdfBuffer) {
          try {
            const uploaded = await uploadToCloudinary(pdfBuffer, "xean/documents");
            await pool.query(
              `INSERT INTO documents
                 (business_id, tenant_id, file_name, file_url, cloudinary_public_id, cloudinary_resource_type, doc_type, extraction_status)
               VALUES ($1, $2, $3, $4, $5, $6, 'other', 'unsupported')`,
              [
                req.businessId,
                t.id,
                `${data.subject || "Announcement"}.pdf`,
                uploaded.url,
                uploaded.publicId,
                uploaded.resourceType,
              ]
            );
          } catch (err) {
            console.error(`Failed to attach announcement PDF for tenant ${t.id}:`, err);
          }
        }
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
    await pushToTenant(req.params.tenantId, { title: "New message", body: data.body, url: "/portal/messages" }, { mandatory: false });

    res.status(201).json(rows[0]);
  })
);

export default router;
