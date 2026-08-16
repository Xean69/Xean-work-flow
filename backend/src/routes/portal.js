import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { verifyPassword, requireTenantAuth } from "../utils/auth.js";
import { UPLOADS_DIR } from "../utils/upload.js";

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

router.get(
  "/me",
  requireTenantAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.full_name, t.email, t.rent_amount, t.deposit_amount,
         t.lease_start, t.lease_end,
         u.unit_number,
         p.name AS property_name, p.address, p.city, p.province, p.postal_code
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE t.id = $1`,
      [req.tenantId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    res.json(rows[0]);
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

export default router;
