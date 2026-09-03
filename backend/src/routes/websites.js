import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseWebsiteBody, parseUnitListingOverrideBody } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";

const router = Router();

// Same shape as maintenance.js's assertUnitInBusiness — units have no
// business_id of their own, so ownership is only checkable through the
// property join.
async function assertUnitInBusiness(unitId, businessId) {
  const { rows } = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = $1 AND p.business_id = $2`,
    [unitId, businessId]
  );
  if (!rows[0]) throw new ApiError(404, "Unit not found");
}

// The edit UI's one call: site-level config (or defaults if the business
// hasn't set anything up yet) plus every vacant unit with whatever override/
// photos already exist, so the manager sees exactly what the public page
// will show.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows: siteRows } = await pool.query("SELECT * FROM business_websites WHERE business_id = $1", [
      req.businessId,
    ]);
    const site = siteRows[0] || null;

    const { rows: units } = await pool.query(
      `SELECT
         u.id, u.unit_number, u.bedrooms, u.bathrooms, u.rent_amount,
         p.name AS property_name, p.address, p.city, p.province,
         o.advertised_price, o.incentive_text, o.description AS override_description
       FROM units u
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN unit_listing_overrides o ON o.unit_id = u.id
       WHERE p.business_id = $1 AND u.status = 'vacant'
       ORDER BY p.name, u.unit_number`,
      [req.businessId]
    );

    const unitIds = units.map((u) => u.id);
    const { rows: photos } = unitIds.length
      ? await pool.query(
          "SELECT id, unit_id, url, position FROM unit_listing_photos WHERE unit_id = ANY($1) ORDER BY position, id",
          [unitIds]
        )
      : { rows: [] };

    const photosByUnit = new Map();
    for (const photo of photos) {
      if (!photosByUnit.has(photo.unit_id)) photosByUnit.set(photo.unit_id, []);
      photosByUnit.get(photo.unit_id).push({ id: photo.id, url: photo.url, position: photo.position });
    }

    res.json({
      site,
      units: units.map((u) => ({ ...u, photos: photosByUnit.get(u.id) || [] })),
    });
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseWebsiteBody(req.body);
    const { rows: existing } = await pool.query(
      "SELECT business_id FROM business_websites WHERE slug = $1 AND business_id != $2",
      [data.slug, req.businessId]
    );
    if (existing[0]) throw new ApiError(400, "That slug is already taken");

    const { rows } = await pool.query(
      `INSERT INTO business_websites (business_id, slug, enabled, tagline, description, theme, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (business_id) DO UPDATE
         SET slug = $2, enabled = $3, tagline = $4, description = $5, theme = $6, primary_color = $7, updated_at = now()
       RETURNING *`,
      [req.businessId, data.slug, data.enabled, data.tagline, data.description, data.theme, data.primary_color]
    );
    res.json(rows[0]);
  })
);

router.put(
  "/units/:unitId",
  asyncHandler(async (req, res) => {
    await assertUnitInBusiness(req.params.unitId, req.businessId);
    const data = parseUnitListingOverrideBody(req.body);

    const { rows } = await pool.query(
      `INSERT INTO unit_listing_overrides (unit_id, advertised_price, incentive_text, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (unit_id) DO UPDATE
         SET advertised_price = $2, incentive_text = $3, description = $4, updated_at = now()
       RETURNING *`,
      [req.params.unitId, data.advertised_price, data.incentive_text, data.description]
    );
    res.json(rows[0]);
  })
);

router.post(
  "/units/:unitId/photos",
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    await assertUnitInBusiness(req.params.unitId, req.businessId);
    if (!req.file) throw new ApiError(400, "photo file is required");

    let uploaded;
    try {
      uploaded = await uploadToCloudinary(req.file.buffer, "xean/listing-photos");
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      throw new ApiError(502, "Failed to upload photo, please try again");
    }

    const { rows: positionRows } = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM unit_listing_photos WHERE unit_id = $1",
      [req.params.unitId]
    );

    const { rows } = await pool.query(
      `INSERT INTO unit_listing_photos (unit_id, url, cloudinary_public_id, cloudinary_resource_type, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, unit_id, url, position`,
      [req.params.unitId, uploaded.url, uploaded.publicId, uploaded.resourceType, positionRows[0].next_position]
    );
    res.status(201).json(rows[0]);
  })
);

router.delete(
  "/units/:unitId/photos/:photoId",
  asyncHandler(async (req, res) => {
    await assertUnitInBusiness(req.params.unitId, req.businessId);

    const { rows } = await pool.query(
      "DELETE FROM unit_listing_photos WHERE id = $1 AND unit_id = $2 RETURNING cloudinary_public_id, cloudinary_resource_type",
      [req.params.photoId, req.params.unitId]
    );
    if (!rows[0]) throw new ApiError(404, "Photo not found");

    deleteFromCloudinary(rows[0].cloudinary_public_id, rows[0].cloudinary_resource_type);
    res.status(204).end();
  })
);

export default router;
