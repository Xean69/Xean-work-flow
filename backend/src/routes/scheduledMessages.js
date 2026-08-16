import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseScheduledMessageBody } from "../utils/validate.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM scheduled_messages ORDER BY id");
    res.json(rows);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseScheduledMessageBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO scheduled_messages (stay_id, message_type, send_timing, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.stay_id, data.message_type, data.send_timing, data.is_active]
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
    const { rows } = await pool.query(
      `UPDATE scheduled_messages
       SET stay_id = $1, message_type = $2, send_timing = $3, is_active = $4
       WHERE id = $5
       RETURNING *`,
      [data.stay_id, data.message_type, data.send_timing, data.is_active, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Scheduled message not found");
    res.json(rows[0]);
  })
);

export default router;
