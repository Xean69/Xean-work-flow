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
