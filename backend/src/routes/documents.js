import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseDocumentBody, parseDocumentStatusBody, parseExtractedDataBody } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import { requireRole } from "../utils/auth.js";
import { extractDocumentData, isExtractableDocType, mimeTypeForFilename } from "../services/extraction.js";
import { notifyTenantOfNewDocument } from "../services/email.js";
import { pushToTenant } from "../services/webPush.js";

const router = Router();

// Mounted for owner/manager/accountant alike (see index.js) so accountants
// can read documents — but uploading and deleting are staff-only, applied
// per-route here rather than at the mount level.
const staffOnly = requireRole("owner", "manager");

async function assertPropertyInBusiness(propertyId, businessId) {
  if (propertyId == null) return;
  const { rows } = await pool.query("SELECT id FROM properties WHERE id = $1 AND business_id = $2", [
    propertyId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "property_id does not belong to your business");
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
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : null;
    const { rows } = await pool.query(
      `SELECT
         d.*,
         p.name AS property_name,
         t.full_name AS tenant_name,
         t.email AS tenant_email,
         t.lease_start,
         t.lease_end,
         u.unit_number
       FROM documents d
       LEFT JOIN properties p ON p.id = d.property_id
       LEFT JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN units u ON u.id = t.unit_id
       WHERE d.business_id = $1 AND ($2::int IS NULL OR d.tenant_id = $2)
       ORDER BY d.uploaded_at DESC`,
      [req.businessId, tenantId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  staffOnly,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "file is required");

    // multer's memoryStorage holds the file only in req.file.buffer — validate
    // metadata first, so a bad request never touches Cloudinary at all.
    const data = parseDocumentBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);
    await assertTenantInBusiness(data.tenant_id, req.businessId);

    let uploaded;
    try {
      uploaded = await uploadToCloudinary(req.file.buffer, "xean/documents");
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      throw new ApiError(502, "Failed to upload file, please try again");
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (business_id, property_id, tenant_id, file_name, file_url, cloudinary_public_id, cloudinary_resource_type, doc_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.businessId,
        data.property_id,
        data.tenant_id,
        req.file.originalname,
        uploaded.url,
        uploaded.publicId,
        uploaded.resourceType,
        data.doc_type,
        data.notes,
      ]
    );
    const doc = rows[0];

    // Extraction runs once, right here on upload — never on a later view —
    // to keep API costs down. doc_types with no extractor (application,
    // other) are marked unsupported without ever calling the API.
    let finalDoc;
    if (isExtractableDocType(doc.doc_type)) {
      const result = await extractDocumentData(req.file.buffer, req.file.mimetype, doc.doc_type);
      const { rows: updated } = await pool.query(
        `UPDATE documents
         SET extracted_data = $1, extraction_confidence = $2, extraction_status = $3, extracted_at = now()
         WHERE id = $4
         RETURNING *`,
        [result.data, result.confidence, result.status, doc.id]
      );
      finalDoc = updated[0];
    } else {
      const { rows: updated } = await pool.query(
        `UPDATE documents SET extraction_status = 'unsupported' WHERE id = $1 RETURNING *`,
        [doc.id]
      );
      finalDoc = updated[0];
    }

    // Fire-and-forget, same as every other automatic notification — a
    // failed send should never block the upload itself. The return value
    // only matters to the deliberate manual "Resend" route below.
    if (doc.tenant_id) {
      const { rows: tenantRows } = await pool.query("SELECT full_name, email, language FROM tenants WHERE id = $1", [
        doc.tenant_id,
      ]);
      const tenant = tenantRows[0];
      if (tenant) {
        notifyTenantOfNewDocument({
          tenantEmail: tenant.email,
          tenantName: tenant.full_name,
          docType: doc.doc_type,
          fileName: doc.file_name,
          language: tenant.language,
        });
        // Documents (including a sent lease) all surface on the same
        // /portal/lease page — there's no separate documents route.
        pushToTenant(doc.tenant_id, { title: "New document", body: doc.file_name, url: "/portal/lease" }, { mandatory: false });
      }
    }

    res.status(201).json(finalDoc);
  })
);

// Re-runs extraction on demand (first extraction for older rows that
// predate this feature, or a deliberate re-try). Staff-only, same as
// upload — accountants can view extracted data but can't trigger a paid
// API call.
router.post(
  "/:id/extract",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");
    if (!isExtractableDocType(doc.doc_type)) {
      throw new ApiError(400, "This document type doesn't support AI extraction");
    }
    if (!doc.file_url) {
      throw new ApiError(400, "This document predates Cloudinary storage and has no file to re-extract from");
    }

    const response = await fetch(doc.file_url);
    const fileBuffer = Buffer.from(await response.arrayBuffer());
    const result = await extractDocumentData(fileBuffer, mimeTypeForFilename(doc.file_name), doc.doc_type);
    const { rows: updated } = await pool.query(
      `UPDATE documents
       SET extracted_data = $1, extraction_confidence = $2, extraction_status = $3, extracted_at = now()
       WHERE id = $4 AND business_id = $5
       RETURNING *`,
      [result.data, result.confidence, result.status, doc.id, req.businessId]
    );
    res.json(updated[0]);
  })
);

// Manual fallback for when extraction failed, is unsupported, or just needs
// a correction — same staff-only gate as upload/re-extract. Overwrites
// extracted_data wholesale and clears the confidence signal, since a human
// entry isn't "high" or "low" confidence, it's just entered.
router.put(
  "/:id/extracted-data",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");

    const data = parseExtractedDataBody(doc.doc_type, req.body);

    const { rows: updated } = await pool.query(
      `UPDATE documents
       SET extracted_data = $1, extraction_confidence = NULL, extraction_status = 'manual', extracted_at = now()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [data, doc.id, req.businessId]
    );
    res.json(updated[0]);
  })
);

// Redirects to the file's Cloudinary URL rather than streaming it through
// this server — the browser fetches the bytes straight from Cloudinary's
// CDN, and this route stays the stable, auth-checked link the frontend
// links to.
router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT file_url FROM documents WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");
    if (!doc.file_url) {
      throw new ApiError(404, "This file predates Cloudinary storage and is no longer available");
    }

    res.redirect(doc.file_url);
  })
);

// Deliberate, manager-clicked resend — unlike the automatic notification
// on upload, this reports back whether the send actually worked instead of
// silently no-oping, since a click with no feedback would look broken.
router.post(
  "/:id/resend",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.doc_type, d.file_name, d.tenant_id, t.full_name AS tenant_name, t.email AS tenant_email, t.language AS tenant_language
       FROM documents d
       LEFT JOIN tenants t ON t.id = d.tenant_id
       WHERE d.id = $1 AND d.business_id = $2`,
      [req.params.id, req.businessId]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found");
    if (!doc.tenant_email) {
      throw new ApiError(400, "This document has no tenant email to send to");
    }

    const sent = await notifyTenantOfNewDocument({
      tenantEmail: doc.tenant_email,
      tenantName: doc.tenant_name,
      docType: doc.doc_type,
      fileName: doc.file_name,
      language: doc.tenant_language,
    });
    if (!sent) throw new ApiError(502, "Failed to send the email, please try again");
    await pushToTenant(doc.tenant_id, { title: "New document", body: doc.file_name, url: "/portal/lease" }, { mandatory: false });
    res.json({ sent: true });
  })
);

// Deliberately NOT staffOnly — marking a document reviewed is closer to
// bookkeeping/triage than to uploading or deleting, and accountants are
// allowed to do it even though they're read-only on everything else here
// (falls through to the anyRole check already applied where this router
// is mounted in index.js).
router.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = parseDocumentStatusBody(req.body);
    const { rows } = await pool.query(
      "UPDATE documents SET status = $1 WHERE id = $2 AND business_id = $3 RETURNING *",
      [data.status, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Document not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM documents WHERE id = $1 AND business_id = $2 RETURNING cloudinary_public_id, cloudinary_resource_type",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Document not found");
    deleteFromCloudinary(rows[0].cloudinary_public_id, rows[0].cloudinary_resource_type);
    res.status(204).end();
  })
);

export default router;
