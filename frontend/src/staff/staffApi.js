// A separate, dedicated API client for the maintenance staff portal — a
// third session type alongside the manager dashboard's client.js and the
// tenant portal's portalApi.js, hitting its own auth-guarded routes.
const BASE_URL = "/api/staff";

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

// No Content-Type header here — the browser sets the multipart boundary
// itself for FormData, same reasoning as portalApi.js's own uploadRequest.
async function uploadRequest(path, formData) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: formData, credentials: "same-origin" });
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

export function getMe() {
  return request("/me");
}

export function setMyStatus(away, awayNote) {
  return request("/me/status", { method: "PATCH", body: JSON.stringify({ away, away_note: awayNote }) });
}

export function updateStaffPushPreference(notifyOther) {
  return request("/me/push-preference", { method: "PATCH", body: JSON.stringify({ notify_other: notifyOther }) });
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

export function addTicketComment(id, formData) {
  return uploadRequest(`/maintenance/${id}/comments`, formData);
}

export function proposeTicketReschedule(id, data) {
  return request(`/maintenance/${id}/reschedules`, { method: "POST", body: JSON.stringify(data) });
}

export function getMyMessages() {
  return request("/messages");
}

export function sendStaffMessage(formData) {
  return uploadRequest("/messages", formData);
}
