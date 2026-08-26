import bcrypt from "bcryptjs";
import pool from "../db.js";
import { ApiError } from "./errors.js";
import { asyncHandler } from "./asyncHandler.js";

const SALT_ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Guards tenant-portal routes. A logged-in tenant's id lives in their
// session (set at login, cleared at logout) — never in a client-supplied
// header or param, so a tenant can't impersonate another by editing a URL.
export function requireTenantAuth(req, res, next) {
  if (!req.session?.tenantId) {
    throw new ApiError(401, "Not logged in");
  }
  req.tenantId = req.session.tenantId;
  next();
}

// Guards every manager-dashboard API route (mounted per-router in index.js).
// Entirely separate from requireTenantAuth/tenantId — a tenant session and
// an admin session share the same cookie mechanism but never the same flag,
// so neither login can be used to access the other's routes.
//
// businessId is set at login (see routes/admin.js) and is what every route
// filters its queries by — it's the whole multi-business boundary. It comes
// only from the session, never from the request body/params/query, so
// there's no way for a request to claim a different business_id than the
// one its admin actually belongs to.
//
// role is looked up fresh from the database on every request rather than
// cached in the session at login — so if a business's owner changes a
// teammate's role, or removes them entirely, that takes effect on their
// very next request instead of staying stale until they next log in. The
// same query doubles as an existence check: a removed admin's session
// cookie stops authenticating immediately, since the row it points to is
// just gone.
export const requireAdminAuth = asyncHandler(async (req, res, next) => {
  if (!req.session?.adminId || !req.session?.businessId) {
    throw new ApiError(401, "Not logged in");
  }

  const { rows } = await pool.query("SELECT role FROM admins WHERE id = $1 AND business_id = $2", [
    req.session.adminId,
    req.session.businessId,
  ]);
  if (!rows[0]) {
    throw new ApiError(401, "Not logged in");
  }

  req.adminId = req.session.adminId;
  req.businessId = req.session.businessId;
  req.role = rows[0].role;
  next();
});

// Guards routes/actions restricted to specific roles, e.g.
// requireRole("owner") for team management, or requireRole("owner",
// "manager") for anything an accountant shouldn't reach. Always used after
// requireAdminAuth, which is what actually sets req.role.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      throw new ApiError(403, "You don't have permission to do this");
    }
    next();
  };
}

// Guards the maintenance staff portal — a third account type alongside
// admins and tenants, entirely separate from both (own session flag, own
// table). Mirrors requireAdminAuth's re-query-every-request shape (so
// removing a staff member revokes access on their very next request, not
// just at next login) rather than requireTenantAuth's trust-the-session-id
// shape, since staff — like admins, unlike tenants — carry their own
// business_id directly rather than deriving it through a join each time.
export const requireStaffAuth = asyncHandler(async (req, res, next) => {
  if (!req.session?.staffId || !req.session?.businessId) {
    throw new ApiError(401, "Not logged in");
  }

  const { rows } = await pool.query("SELECT id FROM maintenance_staff WHERE id = $1 AND business_id = $2", [
    req.session.staffId,
    req.session.businessId,
  ]);
  if (!rows[0]) {
    throw new ApiError(401, "Not logged in");
  }

  req.staffId = req.session.staffId;
  req.businessId = req.session.businessId;
  next();
});
