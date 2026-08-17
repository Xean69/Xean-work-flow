import { Router } from "express";
import { randomBytes } from "node:crypto";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { hashPassword } from "../utils/auth.js";
import { parseInviteBody, parseRoleChangeBody } from "../utils/validate.js";

const router = Router();

// 16 URL-safe characters (12 random bytes) — comfortably over the 12-char
// admin password minimum, easy to select/copy/paste as a single token.
function generateTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, email, role, created_at FROM admins WHERE business_id = $1 ORDER BY (role = 'owner') DESC, created_at ASC",
      [req.businessId]
    );
    res.json(rows);
  })
);

// Stands in for a real email-invite flow (not built yet) — creates the
// account directly and hands back a one-time temporary password for the
// owner to share manually. This is the only response that ever contains a
// plaintext password anywhere in this API.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseInviteBody(req.body);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const { rows } = await pool.query(
        `INSERT INTO admins (email, password_hash, business_id, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, role, created_at`,
        [data.email, passwordHash, req.businessId, data.role]
      );
      res.status(201).json({ ...rows[0], temporaryPassword });
    } catch (err) {
      if (err.code === "23505") {
        throw new ApiError(409, "An account with that email already exists");
      }
      throw err;
    }
  })
);

router.put(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const data = parseRoleChangeBody(req.body);
    // Excludes role = 'owner' rows so the endpoint can never demote the
    // business's one owner (or, since only owner/manager/accountant are
    // ever assignable, promote anyone to owner either).
    const { rows } = await pool.query(
      `UPDATE admins SET role = $1
       WHERE id = $2 AND business_id = $3 AND role != 'owner'
       RETURNING id, email, role, created_at`,
      [data.role, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Team member not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM admins WHERE id = $1 AND business_id = $2 AND role != 'owner'",
      [req.params.id, req.businessId]
    );
    if (!rowCount) throw new ApiError(404, "Team member not found");
    res.status(204).end();
  })
);

export default router;
