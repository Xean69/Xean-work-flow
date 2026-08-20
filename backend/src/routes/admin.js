import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { verifyPassword, hashPassword, requireAdminAuth } from "../utils/auth.js";
import { parseSignupBody, parseForgotPasswordBody, parseAdminResetPasswordBody } from "../utils/validate.js";
import { generateResetToken, hashResetToken } from "../utils/resetToken.js";
import { sendAdminPasswordResetEmail } from "../services/email.js";
import { computeTrialStatus } from "../utils/trial.js";

const router = Router();

const DEFAULT_SCHEDULED_MESSAGES = [
  ["checkin_instructions", "24h_before_checkin", true],
  ["welcome", "on_arrival", true],
  ["checkout_reminder", "8am_checkout_day", true],
  ["review_request", "2h_after_checkout", false],
];

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.email, a.password_hash, a.role, a.business_id, b.business_name, b.created_at AS trial_started_at
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       WHERE lower(a.email) = lower($1)`,
      [email]
    );
    const admin = rows[0];

    // Same generic error whether the email doesn't exist or the password is
    // wrong — never hint at which case it was.
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    req.session.adminId = admin.id;
    req.session.businessId = admin.business_id;
    res.json({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      business_id: admin.business_id,
      business_name: admin.business_name,
      trial_started_at: admin.trial_started_at,
      trial_status: computeTrialStatus(admin.trial_started_at),
    });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});

// Deliberately responds identically whether or not the email belongs to an
// account — otherwise this endpoint would let anyone check which email
// addresses have a dashboard login, just by watching which ones get a
// different response.
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const data = parseForgotPasswordBody(req.body);
    const { rows } = await pool.query("SELECT id, email FROM admins WHERE lower(email) = lower($1)", [
      data.email,
    ]);
    const admin = rows[0];

    if (admin) {
      const { token, tokenHash, expiresAt } = generateResetToken();
      await pool.query("UPDATE admins SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3", [
        tokenHash,
        expiresAt,
        admin.id,
      ]);
      // Never throws — see services/email.js. A failed send still gets the
      // same generic response as a successful one, for the same
      // no-existence-leak reason noted above.
      await sendAdminPasswordResetEmail({ email: admin.email, token });
    }

    res.json({ message: "If that email exists, we've sent a reset link." });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const data = parseAdminResetPasswordBody(req.body);
    const { rows } = await pool.query(
      "SELECT id FROM admins WHERE reset_token_hash = $1 AND reset_token_expires_at > now()",
      [hashResetToken(data.token)]
    );
    if (!rows[0]) throw new ApiError(400, "This reset link is invalid or has expired.");

    // Clearing the token here (not just overwriting it on the next forgot-
    // password request) is what makes it single-use — the same link can't
    // be submitted twice.
    await pool.query(
      "UPDATE admins SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $2",
      [await hashPassword(data.password), rows[0].id]
    );
    res.status(204).end();
  })
);

router.get(
  "/me",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.email, a.role, a.business_id, b.business_name, b.created_at AS trial_started_at
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       WHERE a.id = $1`,
      [req.adminId]
    );
    if (!rows[0]) throw new ApiError(404, "Admin not found");
    res.json({ ...rows[0], trial_status: computeTrialStatus(rows[0].trial_started_at) });
  })
);

// Registers a new business and its first (and, for now, only) admin
// account together, atomically — either both are created or neither is.
// Also seeds the business's 4 default scheduled-message templates, which
// every other business gets the same way (see schema.sql's note on why
// that seeding isn't done there anymore).
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const data = parseSignupBody(req.body);
    const passwordHash = await hashPassword(data.password);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: businessRows } = await client.query(
        "INSERT INTO businesses (business_name, contact_email) VALUES ($1, $2) RETURNING id, business_name, created_at",
        [data.business_name, data.email]
      );
      const business = businessRows[0];

      const { rows: adminRows } = await client.query(
        "INSERT INTO admins (email, password_hash, business_id, role) VALUES ($1, $2, $3, 'owner') RETURNING id, email, role",
        [data.email, passwordHash, business.id]
      );
      const admin = adminRows[0];

      for (const [messageType, sendTiming, isActive] of DEFAULT_SCHEDULED_MESSAGES) {
        await client.query(
          "INSERT INTO scheduled_messages (business_id, message_type, send_timing, is_active) VALUES ($1, $2, $3, $4)",
          [business.id, messageType, sendTiming, isActive]
        );
      }

      await client.query("COMMIT");

      req.session.adminId = admin.id;
      req.session.businessId = business.id;
      res.status(201).json({
        id: admin.id,
        email: admin.email,
        role: admin.role,
        business_id: business.id,
        business_name: business.business_name,
        trial_started_at: business.created_at,
        trial_status: computeTrialStatus(business.created_at),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      // unique_violation — either the business contact email or the admin
      // login email (both checked via case-insensitive unique indexes) is
      // already taken.
      if (err.code === "23505") {
        throw new ApiError(409, "An account with that email already exists");
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

export default router;
