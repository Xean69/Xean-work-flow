// A separate, dedicated API client for the tenant portal — kept apart from
// src/api/client.js (the property manager's client) since these are two
// genuinely different sessions/experiences hitting different auth-guarded
// routes.
// See src/api/client.js — relative, proxied same-site in both dev and prod.
const BASE_URL = "/api/portal";

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

export function login(email, password) {
  return request("/login", { method: "POST", body: JSON.stringify({ email, password }) });
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

// Bypasses the JSON-only request() helper: file uploads use FormData, and
// the browser needs to set its own multipart Content-Type header (with the
// boundary) rather than the one request() hardcodes.
async function uploadRequest(path, formData, method = "POST") {
  const res = await fetch(`${BASE_URL}${path}`, { method, body: formData, credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function getPortalMaintenance() {
  return request("/maintenance");
}

export function createPortalMaintenance(formData) {
  return uploadRequest("/maintenance", formData);
}

export function getPortalMaintenanceDetail(id) {
  return request(`/maintenance/${id}`);
}

export function addPortalMaintenanceComment(id, formData) {
  return uploadRequest(`/maintenance/${id}/comments`, formData);
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
