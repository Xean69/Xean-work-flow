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
