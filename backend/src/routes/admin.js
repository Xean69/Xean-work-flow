import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import {
  verifyPassword,
  hashPassword,
  requireAdminAuth,
  requirePending2fa,
  requireTwoFactorSetupAuth,
} from "../utils/auth.js";
import {
  parseSignupBody,
  parseForgotPasswordBody,
  parseAdminResetPasswordBody,
  parseLanguageBody,
  parseTimezoneBody,
  safeTimezoneOrNull,
  parsePushPreferenceBody,
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
} from "../utils/validate.js";
import { generateResetToken, hashResetToken } from "../utils/resetToken.js";
import { sendAdminPasswordResetEmail } from "../services/email.js";
import { computeTrialStatus } from "../utils/trial.js";
import { upsertSubscription, deleteSubscription } from "../services/pushSubscriptions.js";
import { encryptTotpSecret, decryptTotpSecret } from "../utils/totpEncryption.js";
import {
  generateTotpSecret,
  totpKeyUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  issueBackupCodes,
  tryConsumeBackupCode,
} from "../services/twoFactor.js";
import { rateLimit } from "../utils/publicRateLimit.js";

const router = Router();

const DEFAULT_SCHEDULED_MESSAGES = [
  ["checkin_instructions", "24h_before_checkin", true],
  ["welcome", "on_arrival", true],
  ["checkout_reminder", "8am_checkout_day", true],
  ["review_request", "2h_after_checkout", false],
];

// Shared by every route that completes a login (2fa/verify, 2fa/setup/
// confirm) — queried fresh rather than threaded through from an earlier
// query in the same request, same reasoning as requireAdminAuth's own
// re-query-every-request shape: this is the one place the response shape
// is defined, so it can never quietly drift between the three ways a login
// can finish (no 2FA existed pre-this-feature is no longer possible, but
// setup-completion and normal-verify still both funnel through here).
async function loadAdminSummary(adminId) {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.role, a.business_id, a.timezone, b.business_name, b.created_at AS trial_started_at
     FROM admins a
     JOIN businesses b ON b.id = a.business_id
     WHERE a.id = $1`,
    [adminId]
  );
  const admin = rows[0];
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    business_id: admin.business_id,
    timezone: admin.timezone,
    business_name: admin.business_name,
    trial_started_at: admin.trial_started_at,
    trial_status: computeTrialStatus(admin.trial_started_at),
  };
}

// Two-factor authentication is mandatory for every dashboard account
// (owner/manager/accountant alike — this is a security boundary around the
// whole dashboard, not a per-role notification target like
// getManagerRecipients elsewhere). Password alone never creates a session
// past this point: req.session.adminId is set only in /2fa/verify or
// /2fa/setup/confirm, once the second factor (or a fresh setup) is
// actually satisfied.
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.email, a.password_hash, a.timezone, a.totp_enabled
       FROM admins a
       WHERE lower(a.email) = lower($1)`,
      [email]
    );
    const admin = rows[0];

    // Same generic error whether the email doesn't exist or the password is
    // wrong — never hint at which case it was.
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    // Only ever fills in a timezone this account has never had — a
    // deliberate manual choice made later in Settings must never be
    // silently overwritten by a subsequent login's fresh detection.
    const detectedTimezone = safeTimezoneOrNull(req.body.timezone);
    if (!admin.timezone && detectedTimezone) {
      await pool.query("UPDATE admins SET timezone = $1 WHERE id = $2", [detectedTimezone, admin.id]);
    }

    // Not yet set up — route into the mandatory setup flow rather than
    // blocking the account out entirely. Every account that predates this
    // feature is in exactly this state on its next login, by design (see
    // schema.sql: totp_enabled defaults to false, never assumed true).
    if (!admin.totp_enabled) {
      req.session.pendingSetup2faAdminId = admin.id;
      return res.json({ requires_2fa_setup: true });
    }

    req.session.pending2faAdminId = admin.id;
    res.json({ requires_2fa: true });
  })
);

router.post(
  "/2fa/setup/init",
  requireTwoFactorSetupAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT email FROM admins WHERE id = $1", [req.adminId]);
    if (!rows[0]) throw new ApiError(404, "Account not found");

    // Overwrites any prior secret unconditionally, including a confirmed
    // one — reaching this route at all means either this account has never
    // completed setup, or it's a deliberate reset (see /2fa/reset, which
    // requires re-entering a password first and is the only other way a
    // fully-authenticated admin ends up back here). totp_enabled is set
    // false here too so a reset takes effect immediately rather than
    // leaving the old secret live until setup is actually confirmed.
    const secret = generateTotpSecret();
    await pool.query("UPDATE admins SET totp_secret_encrypted = $1, totp_enabled = false WHERE id = $2", [
      encryptTotpSecret(secret),
      req.adminId,
    ]);

    const qrCodeDataUrl = await generateQrCodeDataUrl(totpKeyUri(secret, rows[0].email));
    res.json({ qr_code_data_url: qrCodeDataUrl, secret });
  })
);

router.post(
  "/2fa/setup/confirm",
  requireTwoFactorSetupAuth,
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (typeof code !== "string" || !code) throw new ApiError(400, "code is required");

    const { rows } = await pool.query("SELECT totp_secret_encrypted FROM admins WHERE id = $1", [req.adminId]);
    const secretEncrypted = rows[0]?.totp_secret_encrypted;
    if (!secretEncrypted) throw new ApiError(400, "No 2FA setup in progress — call /2fa/setup/init first");

    if (!(await verifyTotpCode(decryptTotpSecret(secretEncrypted), code))) {
      throw new ApiError(401, "Invalid code");
    }

    await pool.query("UPDATE admins SET totp_enabled = true, totp_enabled_at = now() WHERE id = $1", [req.adminId]);
    const backupCodes = await issueBackupCodes(req.adminId);

    // Completes the login when this was the mandatory-setup-during-login
    // path (no adminId session existed yet); a harmless no-op re-assignment
    // when this was a voluntary mid-session reset from Settings (adminId
    // was already set to this same value).
    const admin = await loadAdminSummary(req.adminId);
    req.session.adminId = req.adminId;
    req.session.businessId = admin.business_id;
    delete req.session.pendingSetup2faAdminId;

    res.json({ ...admin, backup_codes: backupCodes });
  })
);

// The one brute-forceable step in this whole flow — a 6-digit code is a
// 1-in-a-million guess, not a password, so unlike /login itself (a
// pre-existing gap, out of scope here) this genuinely needs a limiter, not
// just optional hardening. 10 attempts per 15 minutes per IP still allows
// for a mistyped code or two without meaningfully narrowing a real
// brute-force attempt's odds.
router.post(
  "/2fa/verify",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
  requirePending2fa,
  asyncHandler(async (req, res) => {
    const { code, backup_code } = req.body;
    const { rows } = await pool.query("SELECT totp_secret_encrypted FROM admins WHERE id = $1", [req.adminId]);
    const secretEncrypted = rows[0]?.totp_secret_encrypted;
    if (!secretEncrypted) throw new ApiError(401, "Not logged in");

    const ok = backup_code
      ? await tryConsumeBackupCode(req.adminId, backup_code)
      : await verifyTotpCode(decryptTotpSecret(secretEncrypted), code);
    if (!ok) throw new ApiError(401, "Invalid code");

    const admin = await loadAdminSummary(req.adminId);
    req.session.adminId = req.adminId;
    req.session.businessId = admin.business_id;
    delete req.session.pending2faAdminId;

    res.json(admin);
  })
);

// Deliberately requires the full, already-authenticated session
// (requireAdminAuth), not the setup-flow's dual-mode auth — resetting 2FA
// is only ever a voluntary action an already-logged-in admin takes on
// their own account, and re-entering the password here (not just a click)
// is what stops someone who's grabbed an unlocked, unattended session from
// silently disarming 2FA for a device they don't actually control.
router.post(
  "/2fa/reset",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (typeof password !== "string" || !password) throw new ApiError(400, "password is required");

    const { rows } = await pool.query("SELECT password_hash FROM admins WHERE id = $1", [req.adminId]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) {
      throw new ApiError(401, "Incorrect password");
    }

    await pool.query(
      "UPDATE admins SET totp_enabled = false, totp_enabled_at = NULL, totp_secret_encrypted = NULL WHERE id = $1",
      [req.adminId]
    );
    await pool.query("DELETE FROM admin_backup_codes WHERE admin_id = $1", [req.adminId]);

    res.status(204).end();
  })
);

// Same password re-entry gate as /2fa/reset, and for the same reason —
// this invalidates every code a manager may have already written down, so
// a bare click isn't enough to trigger it.
router.post(
  "/2fa/backup-codes/regenerate",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (typeof password !== "string" || !password) throw new ApiError(400, "password is required");

    const { rows } = await pool.query("SELECT password_hash, totp_enabled FROM admins WHERE id = $1", [req.adminId]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) {
      throw new ApiError(401, "Incorrect password");
    }
    if (!rows[0].totp_enabled) throw new ApiError(400, "Two-factor authentication isn't enabled");

    const backupCodes = await issueBackupCodes(req.adminId);
    res.json({ backup_codes: backupCodes });
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
      `SELECT a.id, a.email, a.role, a.language, a.timezone, a.push_notify_other, a.totp_enabled, a.totp_enabled_at,
              a.business_id, b.business_name, b.created_at AS trial_started_at, b.logo_url,
              b.ai_lease_generation_enabled, b.timezone AS business_timezone
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       WHERE a.id = $1`,
      [req.adminId]
    );
    if (!rows[0]) throw new ApiError(404, "Admin not found");
    res.json({ ...rows[0], trial_status: computeTrialStatus(rows[0].trial_started_at) });
  })
);

// Only the account's own language, never someone else's — req.adminId
// (from the session) is both the target and the auth check, same shape as
// every other self-service "update my own account" route.
router.patch(
  "/me/language",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = parseLanguageBody(req.body);
    const { rows } = await pool.query(
      "UPDATE admins SET language = $1 WHERE id = $2 RETURNING id, language",
      [data.language, req.adminId]
    );
    res.json(rows[0]);
  })
);

// This admin's own personal display timezone — distinct from the
// business's own timezone (see businessRouter's PATCH /timezone), which
// governs shared scheduling logic instead of one person's preference.
router.patch(
  "/me/timezone",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = parseTimezoneBody(req.body);
    const { rows } = await pool.query(
      "UPDATE admins SET timezone = $1 WHERE id = $2 RETURNING id, timezone",
      [data.timezone, req.adminId]
    );
    res.json(rows[0]);
  })
);

// Controls only the OTHER-category push toggle — mandatory maintenance
// pushes ignore this value entirely (see services/webPush.js).
router.patch(
  "/me/push-preference",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = parsePushPreferenceBody(req.body);
    const { rows } = await pool.query(
      "UPDATE admins SET push_notify_other = $1 WHERE id = $2 RETURNING id, push_notify_other",
      [data.notifyOther, req.adminId]
    );
    res.json(rows[0]);
  })
);

router.post(
  "/push/subscribe",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const subscription = parsePushSubscriptionBody(req.body);
    await upsertSubscription({
      businessId: req.businessId,
      ownerColumn: "admin_id",
      ownerId: req.adminId,
      subscription,
    });
    res.status(204).end();
  })
);

router.post(
  "/push/unsubscribe",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = parsePushUnsubscribeBody(req.body);
    await deleteSubscription({ ownerColumn: "admin_id", ownerId: req.adminId, endpoint: data.endpoint });
    res.status(204).end();
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
    // The founding owner's own browser is genuinely present at this exact
    // moment — the one signup-time opportunity to seed both their personal
    // display timezone and the brand-new business's own timezone (which
    // governs the billing job) from a real detection instead of a guess.
    // Falls back to each column's own schema default (NULL / 'UTC') when
    // absent or invalid, exactly as if this field didn't exist at all.
    const detectedTimezone = safeTimezoneOrNull(req.body.timezone);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: businessRows } = await client.query(
        `INSERT INTO businesses (business_name, contact_email, timezone)
         VALUES ($1, $2, COALESCE($3, 'UTC'))
         RETURNING id, business_name, created_at`,
        [data.business_name, data.email, detectedTimezone]
      );
      const business = businessRows[0];

      const { rows: adminRows } = await client.query(
        "INSERT INTO admins (email, password_hash, business_id, role, timezone) VALUES ($1, $2, $3, 'owner', $4) RETURNING id, email, role, timezone",
        [data.email, passwordHash, business.id, detectedTimezone]
      );
      const admin = adminRows[0];

      for (const [messageType, sendTiming, isActive] of DEFAULT_SCHEDULED_MESSAGES) {
        await client.query(
          "INSERT INTO scheduled_messages (business_id, message_type, send_timing, is_active) VALUES ($1, $2, $3, $4)",
          [business.id, messageType, sendTiming, isActive]
        );
      }

      await client.query("COMMIT");

      // Same rule as /login: no full session until 2FA is actually set up.
      // A brand-new signup is the one case with zero existing-account
      // history to consider — there's no "predates this requirement"
      // grandfathering argument here at all, so this goes straight into
      // setup rather than ever holding a real adminId session first.
      req.session.pendingSetup2faAdminId = admin.id;
      res.status(201).json({ requires_2fa_setup: true });
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
