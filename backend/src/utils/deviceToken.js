import { randomBytes, createHash } from "node:crypto";

// The raw token lives only in the browser's cookie jar; only its hash is
// ever stored — same reasoning as resetToken.js's reset tokens, even
// though a device token is lower-stakes (it only gates whether a login
// alert fires, not access to anything). sha256, not bcrypt, for the same
// reason resetToken.js picked it: this is a random 256-bit token, not a
// human-guessable password, so a slow KDF buys nothing.
export function generateDeviceToken() {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
