import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseAiLeaseGenerationBody } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import { requireRole } from "../utils/auth.js";

const router = Router();

// Logo is cosmetic branding, available to owner and manager alike (same
// write access as everything else on this page) — only the AI-drafting
// opt-in below is owner-restricted, since that's the actual risk-
// acceptance decision, not a design choice.
router.put(
  "/logo",
  upload.single("logo"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "logo file is required");

    const { rows: existing } = await pool.query(
      "SELECT logo_cloudinary_public_id, logo_cloudinary_resource_type FROM businesses WHERE id = $1",
      [req.businessId]
    );

    let uploaded;
    try {
      uploaded = await uploadToCloudinary(req.file.buffer, "xean/business-logos");
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      throw new ApiError(502, "Failed to upload logo, please try again");
    }

    const { rows } = await pool.query(
      `UPDATE businesses
       SET logo_url = $1, logo_cloudinary_public_id = $2, logo_cloudinary_resource_type = $3
       WHERE id = $4
       RETURNING id, logo_url`,
      [uploaded.url, uploaded.publicId, uploaded.resourceType, req.businessId]
    );

    if (existing[0]?.logo_cloudinary_public_id) {
      deleteFromCloudinary(existing[0].logo_cloudinary_public_id, existing[0].logo_cloudinary_resource_type);
    }

    res.json(rows[0]);
  })
);

// The one-time, owner-only, acknowledgment-gated opt-in for Leases'
// "Generate from scratch" mode — see schema.sql's note on
// ai_lease_generation_enabled for the full reasoning. Disabling never
// requires acknowledgment; only turning it on does (enforced in
// parseAiLeaseGenerationBody).
router.put(
  "/ai-lease-generation",
  requireRole("owner"),
  asyncHandler(async (req, res) => {
    const data = parseAiLeaseGenerationBody(req.body);
    const { rows } = await pool.query(
      "UPDATE businesses SET ai_lease_generation_enabled = $1 WHERE id = $2 RETURNING id, ai_lease_generation_enabled",
      [data.enabled, req.businessId]
    );
    res.json(rows[0]);
  })
);

export default router;
