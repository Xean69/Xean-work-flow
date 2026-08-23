import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "./errors.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Buffered in memory rather than written to disk — the buffer goes straight
// to Cloudinary (and, for documents, into the AI extraction call) without
// ever touching this server's filesystem, which is what makes uploads safe
// on a deploy target with no persistent/writable disk.
const storage = multer.memoryStorage();

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

const CHAT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

// Cloudinary's own actual account limits (confirmed via the Admin API's
// usage endpoint, not assumed) — 10MB for images/raw on the Free plan,
// 100MB for video. Multer's own limit has to be a single number, so it's
// set to the higher (video) ceiling; assertChatAttachmentSizeOk enforces
// the tighter image/document one before ever calling Cloudinary, so a
// too-large photo fails fast with a clear message instead of a Cloudinary
// rejection after the upload already happened.
const CHAT_IMAGE_DOC_MAX_SIZE = 10 * 1024 * 1024;
const CHAT_VIDEO_MAX_SIZE = 100 * 1024 * 1024;

// Shared by the maintenance chat's comment routes (both portal and
// dashboard) and the tenant's initial report form — a message can now
// optionally carry one image, PDF, or video.
export const uploadChatAttachment = multer({
  storage,
  limits: { fileSize: CHAT_VIDEO_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!CHAT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, "Only images, PDFs, and videos are supported"));
    }
    cb(null, true);
  },
});

export function assertChatAttachmentSizeOk(file) {
  if (!file.mimetype.startsWith("video/") && file.size > CHAT_IMAGE_DOC_MAX_SIZE) {
    throw new ApiError(400, "Images and documents must be under 10MB");
  }
}

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
