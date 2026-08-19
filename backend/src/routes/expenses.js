import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseExpenseBody } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
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
    const data = parseExpenseBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);
    await assertUnitInBusiness(data.unit_id, req.businessId);

    let uploaded = null;
    if (req.file) {
      try {
        uploaded = await uploadToCloudinary(req.file.buffer, "xean-intake/receipts");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload receipt, please try again");
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO expenses (business_id, property_id, unit_id, amount, category, vendor_name, expense_date, receipt_url, receipt_cloudinary_public_id, receipt_cloudinary_resource_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.businessId,
        data.property_id,
        data.unit_id,
        data.amount,
        data.category,
        data.vendor_name,
        data.expense_date,
        uploaded?.url ?? null,
        uploaded?.publicId ?? null,
        uploaded?.resourceType ?? null,
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
      "SELECT receipt_cloudinary_public_id, receipt_cloudinary_resource_type FROM expenses WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!existingRows[0]) throw new ApiError(404, "Expense not found");

    const data = parseExpenseBody(req.body);
    await assertPropertyInBusiness(data.property_id, req.businessId);
    await assertUnitInBusiness(data.unit_id, req.businessId);

    let uploaded = null;
    if (req.file) {
      try {
        uploaded = await uploadToCloudinary(req.file.buffer, "xean-intake/receipts");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload receipt, please try again");
      }
    }

    const setClauses = [
      "property_id = $1",
      "unit_id = $2",
      "amount = $3",
      "category = $4",
      "vendor_name = $5",
      "expense_date = $6",
      "notes = $7",
    ];
    const params = [
      data.property_id,
      data.unit_id,
      data.amount,
      data.category,
      data.vendor_name,
      data.expense_date,
      data.notes,
    ];
    if (uploaded) {
      setClauses.push(
        `receipt_url = $${params.length + 1}`,
        `receipt_cloudinary_public_id = $${params.length + 2}`,
        `receipt_cloudinary_resource_type = $${params.length + 3}`
      );
      params.push(uploaded.url, uploaded.publicId, uploaded.resourceType);
    }
    params.push(req.params.id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE expenses SET ${setClauses.join(", ")}
       WHERE id = $${params.length - 1} AND business_id = $${params.length}
       RETURNING *`,
      params
    );

    res.json(rows[0]);

    if (uploaded && existingRows[0].receipt_cloudinary_public_id) {
      deleteFromCloudinary(existingRows[0].receipt_cloudinary_public_id, existingRows[0].receipt_cloudinary_resource_type);
    }
  })
);

router.get(
  "/:id/receipt",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT receipt_url FROM expenses WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const receiptUrl = rows[0]?.receipt_url;
    if (!receiptUrl) throw new ApiError(404, "This expense has no receipt attached");

    res.redirect(receiptUrl);
  })
);

router.delete(
  "/:id",
  staffOnly,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM expenses WHERE id = $1 AND business_id = $2 RETURNING receipt_cloudinary_public_id, receipt_cloudinary_resource_type",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Expense not found");
    deleteFromCloudinary(rows[0].receipt_cloudinary_public_id, rows[0].receipt_cloudinary_resource_type);
    res.status(204).end();
  })
);

export default router;
