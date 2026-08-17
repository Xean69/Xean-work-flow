import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseScheduledMessageBody } from "../utils/validate.js";

const router = Router();

async function assertStayInBusiness(stayId, businessId) {
  if (stayId == null) return;
  const { rows } = await pool.query("SELECT id FROM stays WHERE id = $1 AND business_id = $2", [
    stayId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "stay_id does not belong to your business");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM scheduled_messages WHERE business_id = $1 ORDER BY id",
      [req.businessId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseScheduledMessageBody(req.body);
    await assertStayInBusiness(data.stay_id, req.businessId);

    const { rows } = await pool.query(
      `INSERT INTO scheduled_messages (business_id, stay_id, message_type, send_timing, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.businessId, data.stay_id, data.message_type, data.send_timing, data.is_active]
    );
    res.status(201).json(rows[0]);
  })
);

// Also used for the on/off toggle — the frontend sends the full row back
// with just is_active flipped.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseScheduledMessageBody(req.body);
    await assertStayInBusiness(data.stay_id, req.businessId);

    const { rows } = await pool.query(
      `UPDATE scheduled_messages
       SET stay_id = $1, message_type = $2, send_timing = $3, is_active = $4
       WHERE id = $5 AND business_id = $6
       RETURNING *`,
      [data.stay_id, data.message_type, data.send_timing, data.is_active, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Scheduled message not found");
    res.json(rows[0]);
  })
);

export default router;
