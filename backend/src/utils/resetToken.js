import { randomBytes, createHash } from "node:crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// The raw token goes in the emailed link and is never stored — only its
// hash is, so a database leak alone can't be used to reset anyone's
// password. sha256 (not bcrypt) is deliberate: see schema.sql's note by
// the reset_token_hash columns for why.
export function generateResetToken() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
