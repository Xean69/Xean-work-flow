import { Router } from "express";
import path from "node:path";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseExpenseBody } from "../utils/validate.js";
import { upload, UPLOADS_DIR, deleteUploadedFile } from "../utils/upload.js";

const router = Router();

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
       ORDER BY e.expense_date DESC`
    );
    res.json(rows);
  })
);

// The receipt photo is optional — this route accepts one if attached, but
// works fine without it.
router.post(
  "/",
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    let data;
    try {
      data = parseExpenseBody(req.body);
    } catch (err) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO expenses (property_id, unit_id, amount, category, vendor_name, expense_date, receipt_file_path, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
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
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query("SELECT receipt_file_path FROM expenses WHERE id = $1", [
      req.params.id,
    ]);
    if (!existingRows[0]) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw new ApiError(404, "Expense not found");
    }

    let data;
    try {
      data = parseExpenseBody(req.body);
    } catch (err) {
      if (req.file) deleteUploadedFile(req.file.filename);
      throw err;
    }

    const receiptFilePath = req.file ? req.file.filename : existingRows[0].receipt_file_path;

    const { rows } = await pool.query(
      `UPDATE expenses
       SET property_id = $1, unit_id = $2, amount = $3, category = $4,
           vendor_name = $5, expense_date = $6, receipt_file_path = $7, notes = $8
       WHERE id = $9
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
    const { rows } = await pool.query("SELECT receipt_file_path FROM expenses WHERE id = $1", [
      req.params.id,
    ]);
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
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("DELETE FROM expenses WHERE id = $1 RETURNING receipt_file_path", [
      req.params.id,
    ]);
    if (!rows[0]) throw new ApiError(404, "Expense not found");
    deleteUploadedFile(rows[0].receipt_file_path);
    res.status(204).end();
  })
);

export default router;
