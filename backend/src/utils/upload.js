import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "./errors.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Cloudinary's own actual account limit for images/raw files (confirmed via
// the Admin API's usage endpoint, not assumed) — shared by every image/
// document upload path (Documents, Expense receipts, Eviction Notice
// attachments, and the image/document case of maintenance chat attachments
// below). A file between this and the old 20MB used to be silently accepted
// here only to fail at Cloudinary with a less friendly error.
const IMAGE_DOC_MAX_SIZE = 10 * 1024 * 1024;

// Buffered in memory rather than written to disk — the buffer goes straight
// to Cloudinary (and, for documents, into the AI extraction call) without
// ever touching this server's filesystem, which is what makes uploads safe
// on a deploy target with no persistent/writable disk.
const storage = multer.memoryStorage();

// Shared by any route that accepts a file (Documents, Expenses receipts).
export const upload = multer({
  storage,
  limits: { fileSize: IMAGE_DOC_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, "Only PDF, JPG, and PNG files are supported"));
    }
    cb(null, true);
  },
});

// Real Cloudinary account limit for video, not assumed — maintenance chat
// attachments (image/PDF/video) now upload direct-to-Cloudinary (see
// generateUploadSignature below), but this ceiling is still what
// assertUploadedSizeOk enforces for a video specifically, same distinction
// the old multer-based limit made (images/documents stay capped at
// IMAGE_DOC_MAX_SIZE; video gets much more headroom).
const CHAT_VIDEO_MAX_SIZE = 100 * 1024 * 1024;

// Folders a signed direct-to-Cloudinary upload is allowed to land in — an
// explicit allowlist rather than trusting whatever folder the client asks
// for, even though every caller is already authenticated. Keeps a signed
// upload scoped to "one of the folders this app actually uses" instead of
// an arbitrary path in the account.
const ALLOWED_UPLOAD_FOLDERS = new Set([
  "xean/documents",
  "xean/inspections",
  "xean/lease-templates",
  "xean/maintenance-chat",
  "xean/staff-messages",
]);

// Vercel's rewrite-proxy to Railway hard-fails (502, before the request
// ever reaches this app) on any request body over ~4.3MB — see the
// investigation this replaces. The fix is uploading straight from the
// browser to Cloudinary, which needs a short-lived signed request the
// browser can't forge on its own (folder + timestamp, HMAC-signed with the
// account's api_secret, exactly as Cloudinary's own signed-upload docs
// describe). Everything else about the upload (file bytes, doc metadata)
// now travels browser-to-Cloudinary directly; only this small JSON
// exchange and the final metadata report-back still go through the proxy.
export function generateUploadSignature(folder) {
  if (!ALLOWED_UPLOAD_FOLDERS.has(folder)) {
    throw new ApiError(400, "Invalid upload folder");
  }
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUDINARY_API_SECRET);
  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  };
}

// The one server-side size check still possible once the file itself never
// passes through this server at all: Cloudinary's base signed-upload
// endpoint has no signed "reject if over N bytes" parameter to enforce
// ahead of time (that's an upload-preset feature, configured in
// Cloudinary's own dashboard, not something this deploy sets up) — so this
// is the after-the-fact equivalent, run the moment the browser reports
// back what it actually uploaded. A file over the limit is deleted from
// Cloudinary immediately rather than left as an orphaned asset attached to
// nothing, and the request is rejected the same as if this had been
// caught before the upload ever started.
export function assertUploadedSizeOk(bytes, publicId, resourceType, limit = IMAGE_DOC_MAX_SIZE) {
  if (Number(bytes) > limit) {
    deleteFromCloudinary(publicId, resourceType);
    throw new ApiError(400, `File must be under ${Math.round(limit / (1024 * 1024))}MB`);
  }
}

export { IMAGE_DOC_MAX_SIZE, CHAT_VIDEO_MAX_SIZE };

// Used wherever a route needs the actual bytes of a file that was uploaded
// direct-to-Cloudinary (AI extraction, lease-template transcription) —
// this server never saw them at upload time, so getting them back means
// fetching the same Cloudinary URL the browser was just given. Mirrors the
// identical fetch this file's own /:id/extract re-extraction route has
// used all along for the same reason (re-running extraction on an old row
// with no buffer left in memory).
export async function fetchUploadedBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new ApiError(502, "Failed to retrieve the uploaded file — please try again");
  return Buffer.from(await response.arrayBuffer());
}

// A drawn e-signature is a small canvas export (PNG only, well under a
// megabyte in practice) — its own tight limit rather than reusing
// IMAGE_DOC_MAX_SIZE, so a malformed/oversized payload fails fast instead
// of being treated like a real document upload.
const SIGNATURE_MAX_SIZE = 2 * 1024 * 1024;

export const uploadSignature = multer({
  storage,
  limits: { fileSize: SIGNATURE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "image/png") {
      return cb(new ApiError(400, "Signature must be a PNG image"));
    }
    cb(null, true);
  },
});

// Uploads an in-memory buffer to Cloudinary and returns the bits a route
// needs to store and later delete the asset. resource_type "auto" lets
// Cloudinary classify PDFs/images itself rather than us guessing — but
// deletion needs whatever it actually picked, so that comes back too
// instead of being assumed.
export function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "auto" }, (err, result) => {
      if (err) return reject(err);
      resolve({ url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type });
    });
    stream.end(buffer);
  });
}

// Best-effort, like the old local-disk delete it replaces — a failed
// cleanup here should never block deleting the document/expense record
// itself.
export function deleteFromCloudinary(publicId, resourceType) {
  if (!publicId) return;
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType || "image" }).catch((err) => {
    console.error(`Failed to delete Cloudinary asset ${publicId}:`, err);
  });
}
