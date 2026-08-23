import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseEvictionEventBody } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";

const router = Router();

// eviction_events has no business_id of its own — scoped through
// tenant_id -> tenants.business_id, same as tenant_addons/tenant_occupants.
// Editing can optionally attach/replace the notice attachment. If no new
// file is sent, whatever attachment was already there is left alone.
router.put(
  "/:id",
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const data = parseEvictionEventBody(req.body);

    const { rows: existingRows } = await pool.query(
      `SELECT e.attachment_cloudinary_public_id, e.attachment_cloudinary_resource_type
       FROM eviction_events e JOIN tenants t ON t.id = e.tenant_id
       WHERE e.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!existingRows[0]) throw new ApiError(404, "Eviction event not found");

    let uploaded = null;
    if (req.file) {
      try {
        uploaded = await uploadToCloudinary(req.file.buffer, "xean/eviction-notices");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload attachment, please try again");
      }
    }

    const params = [data.notice_type, data.stage, data.date_issued, data.notes];
    const setClauses = ["notice_type = $1", "stage = $2", "date_issued = $3", "notes = $4"];
    if (uploaded) {
      params.push(uploaded.url, uploaded.publicId, uploaded.resourceType);
      setClauses.push(
        `attachment_url = $${params.length - 2}`,
        `attachment_cloudinary_public_id = $${params.length - 1}`,
        `attachment_cloudinary_resource_type = $${params.length}`
      );
    }
    params.push(req.params.id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE eviction_events e
       SET ${setClauses.join(", ")}
       FROM tenants t
       WHERE e.tenant_id = t.id AND e.id = $${params.length - 1} AND t.business_id = $${params.length}
       RETURNING e.*`,
      params
    );
    if (!rows[0]) throw new ApiError(404, "Eviction event not found");

    if (uploaded && existingRows[0].attachment_cloudinary_public_id) {
      deleteFromCloudinary(existingRows[0].attachment_cloudinary_public_id, existingRows[0].attachment_cloudinary_resource_type);
    }

    res.json(rows[0]);
  })
);

// Business-scoped redirect to the notice's attachment, same pattern as
// GET /expenses/:id/receipt and GET /documents/:id/download.
router.get(
  "/:id/attachment",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.attachment_url
       FROM eviction_events e JOIN tenants t ON t.id = e.tenant_id
       WHERE e.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    const event = rows[0];
    if (!event) throw new ApiError(404, "Eviction event not found");
    if (!event.attachment_url) throw new ApiError(404, "This notice has no attachment");
    res.redirect(event.attachment_url);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `DELETE FROM eviction_events e
       USING tenants t
       WHERE e.tenant_id = t.id AND e.id = $1 AND t.business_id = $2
       RETURNING e.attachment_cloudinary_public_id, e.attachment_cloudinary_resource_type`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Eviction event not found");
    deleteFromCloudinary(rows[0].attachment_cloudinary_public_id, rows[0].attachment_cloudinary_resource_type);
    res.status(204).end();
  })
);

export default router;
