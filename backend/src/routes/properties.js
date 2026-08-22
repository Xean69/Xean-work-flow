import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parsePropertyBody, parseUnitBody, parseAddonBody } from "../utils/validate.js";

const router = Router();

// GET /api/properties - every property, with unit/occupancy counts rolled up
// in a single query so the dashboard doesn't need a separate call per card.
// Scoped to the logged-in admin's business — req.businessId comes only from
// their session (see requireAdminAuth), never from anything client-supplied.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         p.*,
         COUNT(u.id)::int AS unit_count,
         -- Short Term and Notices still have someone actually living there,
         -- same as a plain Occupied — only Vacant/Turnover/Rent Ready are
         -- genuinely not generating rent right now.
         COUNT(u.id) FILTER (WHERE u.status IN ('occupied', 'short_term', 'notices'))::int AS occupied_count,
         ROUND(AVG(u.rent_amount))::int AS avg_rent
       FROM properties p
       LEFT JOIN units u ON u.property_id = p.id
       WHERE p.business_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parsePropertyBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO properties (business_id, name, address, city, province, postal_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.businessId, data.name, data.address, data.city, data.province, data.postal_code]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /api/properties/:id - one property plus its units, for the detail page
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: propertyRows } = await pool.query(
      "SELECT * FROM properties WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    const property = propertyRows[0];
    if (!property) throw new ApiError(404, "Property not found");

    const { rows: units } = await pool.query(
      "SELECT * FROM units WHERE property_id = $1 ORDER BY unit_number",
      [req.params.id]
    );
    const { rows: addons } = await pool.query(
      "SELECT * FROM property_addons WHERE property_id = $1 ORDER BY name",
      [req.params.id]
    );
    res.json({ ...property, units, addons });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parsePropertyBody(req.body);
    const { rows } = await pool.query(
      `UPDATE properties
       SET name = $1, address = $2, city = $3, province = $4, postal_code = $5
       WHERE id = $6 AND business_id = $7
       RETURNING *`,
      [data.name, data.address, data.city, data.province, data.postal_code, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Property not found");
    res.json(rows[0]);
  })
);

// DELETE /api/properties/:id - the units FK is ON DELETE CASCADE, so this
// also removes every unit belonging to the property.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM properties WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Property not found");
    res.status(204).end();
  })
);

router.post(
  "/:id/units",
  asyncHandler(async (req, res) => {
    const { rows: propertyRows } = await pool.query(
      "SELECT id FROM properties WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!propertyRows[0]) throw new ApiError(404, "Property not found");

    const data = parseUnitBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO units (property_id, unit_number, bedrooms, bathrooms, rent_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.params.id, data.unit_number, data.bedrooms, data.bathrooms, data.rent_amount, data.status]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  "/:id/addons",
  asyncHandler(async (req, res) => {
    const { rows: propertyRows } = await pool.query(
      "SELECT id FROM properties WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!propertyRows[0]) throw new ApiError(404, "Property not found");

    const data = parseAddonBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO property_addons (business_id, property_id, name, monthly_price)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.businessId, req.params.id, data.name, data.monthly_price]
    );
    res.status(201).json(rows[0]);
  })
);

export default router;
