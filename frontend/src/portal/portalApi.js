// A separate, dedicated API client for the tenant portal — kept apart from
// src/api/client.js (the property manager's client) since these are two
// genuinely different sessions/experiences hitting different auth-guarded
// routes.
// See src/api/client.js — relative, proxied same-site in both dev and prod.
const BASE_URL = "/api/portal";

import { uploadFileDirectToCloudinary, IMAGE_DOC_MAX_SIZE, CHAT_VIDEO_MAX_SIZE } from "../utils/directCloudinaryUpload.js";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

// Best-effort IANA zone name from the browser itself — used only to seed
// this account's timezone the first time it's ever detected (see
// portal.js's login route, which only fills this in when the tenant
// doesn't already have one).
function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function login(email, password) {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ email, password, timezone: detectTimezone() }),
  });
}

export function logout() {
  return request("/logout", { method: "POST" });
}

export function forgotPassword(email) {
  return request("/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token, password) {
  return request("/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

export function getMe() {
  return request("/me");
}

export function updateTenantLanguage(language) {
  return request("/me/language", { method: "PATCH", body: JSON.stringify({ language }) });
}

export function updateTenantTimezone(timezone) {
  return request("/me/timezone", { method: "PATCH", body: JSON.stringify({ timezone }) });
}

export function updateTenantPushPreference(notifyOther) {
  return request("/me/push-preference", { method: "PATCH", body: JSON.stringify({ notify_other: notifyOther }) });
}

export function subscribeTenantToPush(subscription) {
  return request("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
}

export function unsubscribeTenantFromPush(endpoint) {
  return request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) });
}

export function getPortalDocuments() {
  return request("/documents");
}

export function getPortalDocumentUrl(id) {
  return `${BASE_URL}/documents/${id}/download`;
}

// Bypasses the JSON-only request() helper: signPortalLease below still
// sends a FormData body (its file, a drawn signature, is always well under
// a megabyte — never part of the proxy body-size problem this file's other
// two upload paths had), and the browser needs to set its own multipart
// Content-Type header (with the boundary) rather than the one request()
// hardcodes.
//
// The 90s abort timeout below is still needed even though the maintenance
// routes no longer send a file body through this app's own API at all
// (see createPortalMaintenance/addPortalMaintenanceComment) — creating a
// ticket or posting a comment still awaits a slow AI reply synchronously
// (see backend/src/services/maintenanceChat.js), so that request can still
// hang exactly as before; only the file bytes themselves moved out of it.
//
// 90s, not a smaller number: when the tenant's first AI reply itself times
// out, its fallback outcome is "escalate", which immediately triggers a
// SECOND, independent classification call (maintenanceTriage.js) in the
// same request — confirmed by actually forcing both to stall in testing.
// Worst case is two sequential 30s AI ceilings (15s timeout x 1 retry each)
// + email/push/DB overhead (~15s) = ~75s. This has to sit above that real
// worst case, or a slow-but-recovering backend gets aborted client-side
// right before it would have succeeded on its own.
const UPLOAD_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(path, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { credentials: "same-origin", ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("This is taking longer than expected. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

function uploadRequest(path, formData, method = "POST") {
  return fetchWithTimeout(path, { method, body: formData });
}

// Tenants only ever upload maintenance attachments — folder is fixed
// backend-side too (see portal.js's own /upload-signature), so there's
// nothing to parameterize here.
function getUploadSignature() {
  return request("/upload-signature", { method: "POST" });
}

export function getPortalMaintenance() {
  return request("/maintenance");
}

// Same "intercept the existing FormData" shape used throughout this
// conversion — Repairs.jsx is unchanged; the attachment (if any) now goes
// straight to Cloudinary from here, and the rest of this request (still
// JSON) keeps the same 90s abort protection the old multipart POST had,
// since ticket creation still awaits a slow AI reply synchronously.
export async function createPortalMaintenance(formData) {
  const file = formData.get("attachment");
  let attachmentFields = {};
  if (file) {
    const maxSize = file.type?.startsWith("video/") ? CHAT_VIDEO_MAX_SIZE : IMAGE_DOC_MAX_SIZE;
    const uploaded = await uploadFileDirectToCloudinary(file, getUploadSignature, maxSize);
    attachmentFields = {
      attachment_url: uploaded.url,
      attachment_cloudinary_public_id: uploaded.publicId,
      attachment_cloudinary_resource_type: uploaded.resourceType,
      attachment_file_name: uploaded.fileName,
      attachment_bytes: uploaded.bytes,
    };
  }
  return fetchWithTimeout("/maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      priority: formData.get("priority"),
      entry_permission: formData.get("entry_permission"),
      entry_date: formData.get("entry_date") || undefined,
      ...attachmentFields,
    }),
  });
}

export function getPortalMaintenanceDetail(id) {
  return request(`/maintenance/${id}`);
}

export async function addPortalMaintenanceComment(id, formData) {
  const file = formData.get("attachment");
  let attachmentFields = {};
  if (file) {
    const maxSize = file.type?.startsWith("video/") ? CHAT_VIDEO_MAX_SIZE : IMAGE_DOC_MAX_SIZE;
    const uploaded = await uploadFileDirectToCloudinary(file, getUploadSignature, maxSize);
    attachmentFields = {
      attachment_url: uploaded.url,
      attachment_cloudinary_public_id: uploaded.publicId,
      attachment_cloudinary_resource_type: uploaded.resourceType,
      attachment_file_name: uploaded.fileName,
      attachment_bytes: uploaded.bytes,
    };
  }
  return fetchWithTimeout(`/maintenance/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: formData.get("body") || undefined, ...attachmentFields }),
  });
}

export function flagPortalMaintenanceEmergency(id) {
  return request(`/maintenance/${id}/emergency`, { method: "POST" });
}

export function respondToPortalReschedule(id, decision) {
  return request(`/maintenance/${id}/reschedule/respond`, { method: "POST", body: JSON.stringify({ decision }) });
}

export function answerPortalRescheduleEntryPermission(id, entryPermission, entryDate) {
  return request(`/maintenance/${id}/reschedule/entry-permission`, {
    method: "POST",
    body: JSON.stringify({ entry_permission: entryPermission, entry_date: entryDate }),
  });
}

export function getPortalMessages() {
  return request("/messages");
}

export function sendPortalMessage(body) {
  return request("/messages", { method: "POST", body: JSON.stringify({ body }) });
}

// Returns null until a manager has finalized one — a draft never appears
// here at all.
export function getPortalInspection() {
  return request("/inspection");
}

export function signPortalInspection(signedName) {
  return request("/inspection/sign", { method: "POST", body: JSON.stringify({ signed_name: signedName }) });
}

// A draft lease never appears here — only a manager-sent one "exists" as
// far as the tenant is concerned, same as inspections above.
export function getPortalLeases() {
  return request("/leases");
}

// signature_image is optional — FormData either way (uploadRequest, not
// the JSON-only request()) since a typed-only signature still goes through
// the same multipart endpoint, just with no file field attached.
export function signPortalLease(id, signedName, signatureImageBlob) {
  const formData = new FormData();
  formData.append("signed_name", signedName);
  if (signatureImageBlob) formData.append("signature_image", signatureImageBlob, "signature.png");
  return uploadRequest(`/leases/${id}/sign`, formData);
}
