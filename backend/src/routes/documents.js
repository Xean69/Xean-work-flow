import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseDocumentBody } from "../utils/validate.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  // Store under a random name so two uploads can never collide and a
  // crafted filename can never escape the uploads folder. The original
  // name is kept in the database purely for display.
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, "Only PDF, JPG, and PNG files are supported"));
    }
    cb(null, true);
  },
});

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
       ORDER BY d.uploaded_at DESC`
    );
    res.json(rows);
  })
);

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "file is required");

    let data;
    try {
      data = parseDocumentBody(req.body);
    } catch (err) {
      // Metadata was invalid, but multer already wrote the file to disk —
      // clean it up rather than leaving an orphaned upload behind.
      fs.unlink(req.file.path, () => {});
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (property_id, tenant_id, file_name, file_path, doc_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.property_id, data.tenant_id, req.file.originalname, req.file.filename, data.doc_type, data.notes]
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
    const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [req.params.id]);
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
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("DELETE FROM documents WHERE id = $1 RETURNING file_path", [
      req.params.id,
    ]);
    if (!rows[0]) throw new ApiError(404, "Document not found");
    fs.unlink(path.join(UPLOADS_DIR, rows[0].file_path), () => {});
    res.status(204).end();
  })
);

export default router;
