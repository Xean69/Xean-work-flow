import pool from "../db.js";
import { ApiError } from "./errors.js";
import { asyncHandler } from "./asyncHandler.js";

const DAY_MS = 1000 * 60 * 60 * 24;

// Derived at read time from the business's stored billing fields (see
// schema.sql's "Trial enforcement" section) — never stored itself, so it can
// never go stale relative to the clock. Access is allowed when the result's
// status is anything but "expired":
//   exempt  — billing_exempt (every business that existed before trial
//             enforcement shipped, plus anything toggled on by hand)
//   paid    — now < paid_until (set by hand on the platform page)
//   trial   — now < trial_ends_at (created_at + 14 days for new signups)
//   expired — none of the above
// Order matters only for what's displayed: an exempt business that also has
// a paid_until shows as exempt, a paid business still inside its trial
// window shows as paid.
export function computeTrialStatus(business, now = Date.now()) {
  const trialEndsAt = business.trial_ends_at ? new Date(business.trial_ends_at) : null;
  const paidUntil = business.paid_until ? new Date(business.paid_until) : null;

  let status;
  if (business.billing_exempt) status = "exempt";
  else if (paidUntil && now < paidUntil.getTime()) status = "paid";
  else if (trialEndsAt && now < trialEndsAt.getTime()) status = "trial";
  else status = "expired";

  return {
    status,
    trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
    paid_until: paidUntil ? paidUntil.toISOString() : null,
    // Whole days remaining, rounded up — "1 day left" right up until the
    // moment it ends, never "0 days left" while access still works.
    days_left: status === "trial" ? Math.ceil((trialEndsAt.getTime() - now) / DAY_MS) : null,
  };
}

export function hasBillingAccess(trial) {
  return trial.status !== "expired";
}

// Server-side trial enforcement for the manager dashboard API. Always runs
// after requireAdminAuth (which sets req.adminId/req.businessId). Re-reads
// the business on every request — the same "never trust a cached value"
// shape requireAdminAuth uses for role — so marking a business paid or
// exempt on the platform page takes effect on its very next request, and
// an expiry takes effect the moment it passes, with no re-login.
//
// 402 + code "trial_expired" is what the frontend keys on to swap the whole
// dashboard for the "Your trial has ended" page (see api/client.js).
//
// Deliberately not applied to /api/portal (tenants) or /api/staff
// (maintenance staff): a lapsed manager subscription must never cut off a
// tenant's ability to report a leak or a technician's ticket view.
export const requireActiveBilling = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query(
    `SELECT b.billing_exempt, b.trial_ends_at, b.paid_until, a.is_platform_owner
     FROM admins a
     JOIN businesses b ON b.id = a.business_id
     WHERE a.id = $1 AND b.id = $2`,
    [req.adminId, req.businessId]
  );
  const row = rows[0];
  if (!row) throw new ApiError(401, "Not logged in");

  // The platform owner is never locked out — otherwise their own
  // business's trial lapsing would lock them out of the very page used to
  // unlock everyone else.
  if (row.is_platform_owner) return next();

  if (!hasBillingAccess(computeTrialStatus(row))) {
    throw new ApiError(402, "Your trial has ended. Contact hrsupport@xean.ca to continue.", "trial_expired");
  }
  next();
});

// Gates /api/platform. 404 (not 403) for everyone else, so the route's
// existence isn't advertised to regular business owners.
export const requirePlatformOwner = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query("SELECT is_platform_owner FROM admins WHERE id = $1", [req.adminId]);
  if (!rows[0]?.is_platform_owner) throw new ApiError(404, "Not found");
  next();
});
