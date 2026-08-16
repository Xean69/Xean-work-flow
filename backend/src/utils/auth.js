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
