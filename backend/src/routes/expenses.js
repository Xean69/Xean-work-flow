import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseExpenseBody } from "../utils/validate.js";
import { upload, UPLOADS_DIR, deleteUploadedFile } from "../utils/upload.js";
import { requireRole } from "../utils/auth.js";

const router = Router();

// Mounted for owner/manager/accountant alike (see index.js) so accountants
// can read expenses — but creating, editing, and deleting are staff-only,
// applied per-route here rather than at the mount level.
const staffOnly = requireRole("owner", "manager");

async function assertPropertyInBusiness(propertyId, businessId) {
  if (propertyId == null) return;
  const { rows } = await pool.query("SELECT id FROM properties WHERE id = $1 AND business_id = $2", [
    propertyId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "property_id does not belong to your business");
}

async function assertUnitInBusiness(unitId, businessId) {
  if (unitId == null) return;
  const { rows } = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = $1 AND p.business_id = $2`,
    [unitId, businessId]
  );
  if (!rows[0]) throw new ApiError(400, "unit_id does not belong to a property in your business");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         e.*,
         p.name AS property_name,
         u.unit_number
       FROM expenses e
       LEFT JOIN properties p ON p.id = e.property_id
       LEFT JOIN units u ON u.id = e.unit_id
       WHERE e.business_id = $1
       ORDER BY e.expense_date DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

// The receipt photo is optional — this route accepts one if attached, but
// works fine without it.
router.post(
  "/",
  staffOnly,
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    let data;
    try {
      data = parseExpenseBody(req.body);
      await assertPropertyInBusiness(data.property_id, req.businessId);
      await assertUnitInBusiness(data.unit_id, req.businessId);
    } catch (err) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO expenses (business_id, property_id, unit_id, amount, category, vendor_name, expense_date, receipt_file_path, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.businessId,
        data.property_id,
        data.unit_id,
        data.amount,
        data.category,
        data.vendor_name,
        data.expense_date,
        req.file ? req.file.filename : null,
        data.notes,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

// Editing can optionally attach/replace the receipt photo. If no new file
// is sent, whatever receipt was already on the expense is left alone.
router.put(
  "/:id",
  staffOnly,
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      "SELECT receipt_file_path FROM expenses WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!existingRows[0]) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new ApiError(404, "Expense not found");
    }

    let data;
    try {
      data = parseExpenseBody(req.body);
      await assertPropertyInBusiness(data.property_id, req.businessId);
      await assertUnitInBusiness(data.unit_id, req.businessId);
    } catch (err) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw err;
    }

    const receiptFilePath = req.file ? req.file.filename : existingRows[0].receipt_file_path;

    const { rows } = await pool.query(
      `UPDATE expenses
       SET property_id = $1, unit_id = $2, amount = $3, category = $4,
           vendor_name = $5, expense_date = $6, receipt_file_path = $7, notes = $8
       WHERE id = $9 AND business_id = $10
       RETURNING *`,
      [
        data.property_id,
        data.unit_id,
        data.amount,
        data.category,
        data.vendor_name,
        data.expense_date,
        receiptFilePath,
        data.notes,
        req.params.id,
        req.businessId,
      ]
    );

    if (req.file && existingRows[0].receipt_file_path) {
      deleteUploadedFile(existingRows[0].receipt_file_path);
    }

    res.json(rows[0]);
  })
);

router.get(
  "/:id/receipt",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT receipt_file_path FROM expenses WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const filePath = rows[0]?.receipt_file_path;
    if (!filePath) throw new ApiError(404, "This expense has no receipt attached");

    res.setHeader("Content-Disposition", "inline");
    res.sendFile(path.join(UPLOADS_DIR, filePath), (err) => {
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
      "DELETE FROM expenses WHERE id = $1 AND business_id = $2 RETURNING receipt_file_path",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Expense not found");
    deleteUploadedFile(rows[0].receipt_file_path);
    res.status(204).end();
  })
);

export default router;
