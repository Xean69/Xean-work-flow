import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseDocumentBody, parseDocumentStatusBody, parseExtractedDataBody } from "../utils/validate.js";
import { upload, UPLOADS_DIR, deleteUploadedFile } from "../utils/upload.js";
import { requireRole } from "../utils/auth.js";
import { extractDocumentData, isExtractableDocType } from "../services/extraction.js";

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
    const { rows } = await pool.query(
      `SELECT
         d.*,
         p.name AS property_name,
         t.full_name AS tenant_name
       FROM documents d
       LEFT JOIN properties p ON p.id = d.property_id
       LEFT JOIN tenants t ON t.id = d.tenant_id
       WHERE d.business_id = $1
       ORDER BY d.uploaded_at DESC`,
      [req.businessId]
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

    let data;
    try {
      data = parseDocumentBody(req.body);
      await assertPropertyInBusiness(data.property_id, req.businessId);
      await assertTenantInBusiness(data.tenant_id, req.businessId);
    } catch (err) {
      // Metadata was invalid, but multer already wrote the file to disk —
      // clean it up rather than leaving an orphaned upload behind.
      deleteUploadedFile(req.file.filename);
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (business_id, property_id, tenant_id, file_name, file_path, doc_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.businessId, data.property_id, data.tenant_id, req.file.originalname, req.file.filename, data.doc_type, data.notes]
    );
    const doc = rows[0];

    // Extraction runs once, right here on upload — never on a later view —
    // to keep API costs down. doc_types with no extractor (application,
    // other) are marked unsupported without ever calling the API.
    if (isExtractableDocType(doc.doc_type)) {
      const result = await extractDocumentData(path.join(UPLOADS_DIR, doc.file_path), doc.doc_type);
      const { rows: updated } = await pool.query(
        `UPDATE documents
         SET extracted_data = $1, extraction_confidence = $2, extraction_status = $3, extracted_at = now()
         WHERE id = $4
         RETURNING *`,
        [result.data, result.confidence, result.status, doc.id]
      );
      return res.status(201).json(updated[0]);
    }

    const { rows: updated } = await pool.query(
      `UPDATE documents SET extraction_status = 'unsupported' WHERE id = $1 RETURNING *`,
      [doc.id]
    );
    res.status(201).json(updated[0]);
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

    const result = await extractDocumentData(path.join(UPLOADS_DIR, doc.file_path), doc.doc_type);
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

// Serves the file inline so PDFs/images open in a new browser tab instead
// of forcing a download — the browser's own viewer still offers a save
// option if the user wants one.
router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
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
      "DELETE FROM documents WHERE id = $1 AND business_id = $2 RETURNING file_path",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Document not found");
    deleteUploadedFile(rows[0].file_path);
    res.status(204).end();
  })
);

export default router;
