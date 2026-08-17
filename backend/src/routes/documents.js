import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseDocumentBody } from "../utils/validate.js";
import { upload, UPLOADS_DIR, deleteUploadedFile } from "../utils/upload.js";
import { requireRole } from "../utils/auth.js";

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
    res.status(201).json(rows[0]);
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
