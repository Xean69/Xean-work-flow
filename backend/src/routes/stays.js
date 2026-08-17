import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseStayBody } from "../utils/validate.js";

const router = Router();

async function assertUnitInBusiness(unitId, businessId) {
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
         s.*,
         u.unit_number,
         p.id AS property_id,
         p.name AS property_name
       FROM stays s
       JOIN units u ON u.id = s.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE s.business_id = $1
       ORDER BY s.checkout_date DESC`,
      [req.businessId]
    );
    res.json(rows);
  })
);

// New bookings always start at the first milestone — turnover_status isn't
// something the create form exposes, so it's forced here before validation.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseStayBody({ ...req.body, turnover_status: "checkout_done" });
    await assertUnitInBusiness(data.unit_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO stays (business_id, unit_id, platform, guest_name, checkout_date, next_checkin_date, turnover_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'checkout_done')
       RETURNING *`,
      [req.businessId, data.unit_id, data.platform, data.guest_name, data.checkout_date, data.next_checkin_date]
    );
    res.status(201).json(rows[0]);
  })
);

// Used both for editing a booking's details and for advancing/reverting
// its turnover_status via the step buttons on the board.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseStayBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE stays
       SET unit_id = $1, platform = $2, guest_name = $3, checkout_date = $4,
           next_checkin_date = $5, turnover_status = $6
       WHERE id = $7 AND business_id = $8
       RETURNING *`,
      [
        data.unit_id,
        data.platform,
        data.guest_name,
        data.checkout_date,
        data.next_checkin_date,
        data.turnover_status,
        req.params.id,
        req.businessId,
      ]
    );
    if (!rows[0]) throw new ApiError(404, "Stay not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM stays WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Stay not found");
    res.status(204).end();
  })
);

export default router;
