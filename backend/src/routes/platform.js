import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { computeTrialStatus } from "../utils/trial.js";

// Platform-owner billing admin: every business on Xean, with the manual
// "paid until" date and exempt toggle that stand in for a payment processor.
// Mounted in index.js behind requireAdminAuth + requirePlatformOwner, so a
// regular business owner gets 404 from every route here.
//
// This is the ONLY place in the app that reads or writes across businesses.
// It deliberately cannot set is_platform_owner — that flag is set by hand in
// the database, never from the app.
const router = Router();

const BUSINESS_SELECT = `
  SELECT b.id, b.business_name, b.created_at, b.billing_exempt, b.trial_ends_at, b.paid_until,
         (SELECT a.email FROM admins a
          WHERE a.business_id = b.id AND a.role = 'owner'
          ORDER BY a.id LIMIT 1) AS owner_email
  FROM businesses b`;

function toRow(b) {
  return {
    id: b.id,
    business_name: b.business_name,
    owner_email: b.owner_email,
    created_at: b.created_at,
    billing_exempt: b.billing_exempt,
    ...computeTrialStatus(b),
  };
}

router.get(
  "/businesses",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const params = [];
    let where = "";
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE b.business_name ILIKE $1
                  OR b.id::text = $2
                  OR EXISTS (SELECT 1 FROM admins a WHERE a.business_id = b.id AND a.email ILIKE $1)`;
      params.push(q);
    }
    const { rows } = await pool.query(`${BUSINESS_SELECT} ${where} ORDER BY b.created_at DESC, b.id DESC`, params);
    res.json(rows.map(toRow));
  })
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Body: { paid_until?: "YYYY-MM-DD" | null, billing_exempt?: boolean }.
// paid_until is a calendar date meaning "paid through the END of that day"
// (stored as 23:59:59 UTC of that date). null clears it. Takes effect on
// the business's very next request — requireActiveBilling re-reads it.
router.patch(
  "/businesses/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid business id");

    const body = req.body ?? {};
    const sets = [];
    const params = [];

    if ("paid_until" in body) {
      const v = body.paid_until;
      if (v === null || v === "") {
        sets.push("paid_until = NULL");
      } else if (typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        params.push(v);
        sets.push(`paid_until = ($${params.length}::date + time '23:59:59') AT TIME ZONE 'UTC'`);
      } else {
        throw new ApiError(400, "paid_until must be a date (YYYY-MM-DD) or null");
      }
    }
    if ("billing_exempt" in body) {
      if (typeof body.billing_exempt !== "boolean") throw new ApiError(400, "billing_exempt must be true or false");
      params.push(body.billing_exempt);
      sets.push(`billing_exempt = $${params.length}`);
    }
    if (sets.length === 0) throw new ApiError(400, "Nothing to update");

    params.push(id);
    const { rowCount } = await pool.query(
      `UPDATE businesses SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    if (rowCount === 0) throw new ApiError(404, "Business not found");

    const { rows } = await pool.query(`${BUSINESS_SELECT} WHERE b.id = $1`, [id]);
    res.json(toRow(rows[0]));
  })
);

export default router;
