import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { generateUploadSignature } from "../utils/upload.js";

const router = Router();

// Narrower than upload.js's own global ALLOWED_UPLOAD_FOLDERS — that set is
// the outer safety net across every account type; this is which of those
// folders an *admin* session specifically should be able to request a
// signature for. xean/staff-messages is deliberately excluded: that's
// staff-to-manager messaging (see routes/staff.js), never something an
// admin session sends into.
const ADMIN_UPLOAD_FOLDERS = new Set(["xean/documents", "xean/inspections", "xean/lease-templates", "xean/maintenance-chat"]);

// Shared by every admin-mounted route that used to accept a raw file body
// (documents, move-in inspection photos, lease templates, maintenance
// ticket attachments) — see upload.js's generateUploadSignature for why
// this exists at all (Vercel's proxy to Railway can't carry a file over
// ~4.3MB; this is what lets the browser upload straight to Cloudinary
// instead).
//
// Gated on requireAdminAuth only (mounted in index.js), not the stricter
// staffOnly some of those routes additionally require — a signature alone
// can't create or change anything in this app, it only authorizes a
// Cloudinary upload. The actual record-creation routes each still enforce
// their own real role check afterward, unchanged from before.
router.post(
  "/signature",
  asyncHandler(async (req, res) => {
    const { folder } = req.body;
    if (!ADMIN_UPLOAD_FOLDERS.has(folder)) throw new ApiError(400, "Invalid upload folder");
    res.json(generateUploadSignature(folder));
  })
);

export default router;
