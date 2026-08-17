import bcrypt from "bcryptjs";
import { ApiError } from "./errors.js";

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
export function requireAdminAuth(req, res, next) {
  if (!req.session?.adminId || !req.session?.businessId) {
    throw new ApiError(401, "Not logged in");
  }
  req.adminId = req.session.adminId;
  req.businessId = req.session.businessId;
  next();
}
