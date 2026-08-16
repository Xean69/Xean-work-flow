import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  // Store under a random name so two uploads can never collide and a
  // crafted filename can never escape the uploads folder. The original
  // name is kept in the database purely for display.
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

// Shared by any route that accepts a file (Documents, Expenses receipts).
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, "Only PDF, JPG, and PNG files are supported"));
    }
    cb(null, true);
  },
});

export function deleteUploadedFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(UPLOADS_DIR, filename), () => {});
}
