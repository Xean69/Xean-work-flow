import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM, not just AES-256-CBC — GCM's auth tag means a tampered
// ciphertext (a corrupted row, or someone editing the DB by hand) fails to
// decrypt loudly instead of silently producing garbage that then gets fed
// to otplib as if it were a real secret.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — the size GCM is actually designed for, not the 16-byte CBC default.

function getKey() {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("TOTP_ENCRYPTION_KEY is not set — required to encrypt/decrypt 2FA secrets at rest");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256");
  }
  return key;
}

// Stored as iv:authTag:ciphertext, all hex — one column, no separate
// columns for the IV/tag to keep in sync with the ciphertext.
export function encryptTotpSecret(plainSecret) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptTotpSecret(stored) {
  const [ivHex, authTagHex, encryptedHex] = stored.split(":");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
