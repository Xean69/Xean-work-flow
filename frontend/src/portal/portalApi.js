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

export function getPortalDocuments() {
  return request("/documents");
}

export function getPortalDocumentUrl(id) {
  return `${BASE_URL}/documents/${id}/download`;
}

export function getPortalMaintenance() {
  return request("/maintenance");
}

export function createPortalMaintenance(data) {
  return request("/maintenance", { method: "POST", body: JSON.stringify(data) });
}

export function getPortalMaintenanceDetail(id) {
  return request(`/maintenance/${id}`);
}

export function addPortalMaintenanceComment(id, body) {
  return request(`/maintenance/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
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
