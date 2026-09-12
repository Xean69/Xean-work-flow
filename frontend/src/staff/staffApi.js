// A separate, dedicated API client for the maintenance staff portal — a
// third session type alongside the manager dashboard's client.js and the
// tenant portal's portalApi.js, hitting its own auth-guarded routes.
const BASE_URL = "/api/staff";

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

// The 90s abort timeout below is still needed even though neither route
// below sends a file body through this app's own API anymore (attachments
// now go straight to Cloudinary — see addTicketComment/sendStaffMessage) —
// posting a ticket comment still awaits a slow AI reply synchronously (see
// backend/src/services/maintenanceChat.js), so that request can still hang
// exactly as before; only the file bytes themselves moved out of it.
//
// 90s, not a smaller number: when a tenant's first AI reply itself times
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
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", credentials: "same-origin", ...options, signal: controller.signal });
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

// Staff upload into two different folders (ticket comments vs. messages to
// their manager) — unlike the tenant portal's single fixed one, so this
// takes folder as a parameter, validated again against its own allowlist
// backend-side (see staff.js's own /upload-signature).
function getUploadSignature(folder) {
  return request("/upload-signature", { method: "POST", body: JSON.stringify({ folder }) });
}

async function uploadAttachmentIfAny(formData, folder) {
  const file = formData.get("attachment");
  if (!file) return {};
  const maxSize = file.type?.startsWith("video/") ? CHAT_VIDEO_MAX_SIZE : IMAGE_DOC_MAX_SIZE;
  const uploaded = await uploadFileDirectToCloudinary(file, () => getUploadSignature(folder), maxSize);
  return {
    attachment_url: uploaded.url,
    attachment_cloudinary_public_id: uploaded.publicId,
    attachment_cloudinary_resource_type: uploaded.resourceType,
    attachment_file_name: uploaded.fileName,
    attachment_bytes: uploaded.bytes,
  };
}

// Best-effort IANA zone name from the browser itself — used only to seed
// this account's timezone the first time it's ever detected (see
// staff.js's login route, which only fills this in when the staff member
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

export function getMe() {
  return request("/me");
}

export function setMyStatus(away, awayNote) {
  return request("/me/status", { method: "PATCH", body: JSON.stringify({ away, away_note: awayNote }) });
}

export function updateStaffPushPreference(notifyOther) {
  return request("/me/push-preference", { method: "PATCH", body: JSON.stringify({ notify_other: notifyOther }) });
}

export function updateStaffTimezone(timezone) {
  return request("/me/timezone", { method: "PATCH", body: JSON.stringify({ timezone }) });
}

export function subscribeStaffToPush(subscription) {
  return request("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
}

export function unsubscribeStaffFromPush(endpoint) {
  return request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) });
}

export function getMyTickets() {
  return request("/maintenance");
}

export function getTicketDetail(id) {
  return request(`/maintenance/${id}`);
}

// completionNote is only sent along when resolving — the server rejects a
// resolve without one, but leaves every other transition (e.g. back to
// in_progress) alone.
export function updateTicketStatus(id, status, completionNote) {
  return request(`/maintenance/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, completion_note: completionNote }),
  });
}

// Same "intercept the existing FormData" shape used throughout this
// conversion — TicketDetail.jsx is unchanged.
export async function addTicketComment(id, formData) {
  const attachmentFields = await uploadAttachmentIfAny(formData, "xean/maintenance-chat");
  return fetchWithTimeout(`/maintenance/${id}/comments`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: formData.get("body") || undefined, ...attachmentFields }),
  });
}

export function proposeTicketReschedule(id, data) {
  return request(`/maintenance/${id}/reschedules`, { method: "POST", body: JSON.stringify(data) });
}

export function getMyMessages() {
  return request("/messages");
}

export async function sendStaffMessage(formData) {
  const attachmentFields = await uploadAttachmentIfAny(formData, "xean/staff-messages");
  return fetchWithTimeout("/messages", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: formData.get("body") || undefined, ...attachmentFields }),
  });
}
