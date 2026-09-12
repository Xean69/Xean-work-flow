import { generateSecret as otpGenerateSecret, generateURI, verify as otpVerify } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import pool from "../db.js";

const ISSUER = "Xean";

// otplib's own default is epochTolerance: 0 — only the exact current
// 30-second window. Without some tolerance, an admin's phone clock running
// even a few seconds ahead or behind the server turns a correctly-typed
// code into "invalid" for no reason the admin can see. ±30s (one step
// either way) is otplib's own documented "Standard (most 2FA
// implementations)" recommendation.
const EPOCH_TOLERANCE = 30;

const BACKUP_CODE_COUNT = 10;
const SALT_ROUNDS = 10;

export function generateTotpSecret() {
  return otpGenerateSecret();
}

export function totpKeyUri(secret, email) {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export function generateQrCodeDataUrl(keyUri) {
  return QRCode.toDataURL(keyUri);
}

export async function verifyTotpCode(secret, token) {
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return false;
  const result = await otpVerify({ secret, token, epochTolerance: EPOCH_TOLERANCE });
  return result.valid;
}

// No 0/O/1/I/l — characters real people misread from a phone screen or
// handwritten note. 10 characters from a 32-symbol alphabet is ~50 bits of
// entropy per code, grouped XXXXX-XXXXX purely for readability (the hyphen
// is stripped before verifying, see verifyBackupCode's caller in admin.js).
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateOneBackupCode() {
  let raw = "";
  for (let i = 0; i < 10; i++) {
    raw += BACKUP_CODE_ALPHABET[randomInt(0, BACKUP_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  return Array.from({ length: count }, generateOneBackupCode);
}

export function hashBackupCode(code) {
  return bcrypt.hash(code, SALT_ROUNDS);
}

export function verifyBackupCode(code, hash) {
  return bcrypt.compare(code, hash);
}

// Wipes any existing codes and issues a fresh batch — called once from a
// confirmed setup and again any time a manager deliberately regenerates
// (routes/admin.js gates both behind a re-entered password). Returns the
// plaintext codes exactly once; only their bcrypt hashes are ever
// persisted, so this is the only moment they can be shown or downloaded.
export async function issueBackupCodes(adminId) {
  const codes = generateBackupCodes();
  await pool.query("DELETE FROM admin_backup_codes WHERE admin_id = $1", [adminId]);
  for (const code of codes) {
    await pool.query("INSERT INTO admin_backup_codes (admin_id, code_hash) VALUES ($1, $2)", [
      adminId,
      await hashBackupCode(code),
    ]);
  }
  return codes;
}

// Case-insensitive on purpose (codes are generated uppercase, but someone
// retyping one from a note isn't guaranteed to match case) — normalized
// here, before hashing/comparison, not at generation or storage time.
// Checked against every one of this admin's unused codes rather than
// looked up directly, since bcrypt salts differ per hash: there's no way
// to query for "the row whose hash matches this code" other than trying
// each one, the same reason this schema uses a real table instead of a
// single column at all (see schema.sql's note on admin_backup_codes).
export async function tryConsumeBackupCode(adminId, rawCode) {
  if (typeof rawCode !== "string" || !rawCode.trim()) return false;
  const normalized = rawCode.trim().toUpperCase();

  const { rows } = await pool.query(
    "SELECT id, code_hash FROM admin_backup_codes WHERE admin_id = $1 AND used_at IS NULL",
    [adminId]
  );
  for (const row of rows) {
    if (await verifyBackupCode(normalized, row.code_hash)) {
      await pool.query("UPDATE admin_backup_codes SET used_at = now() WHERE id = $1", [row.id]);
      return true;
    }
  }
  return false;
}
