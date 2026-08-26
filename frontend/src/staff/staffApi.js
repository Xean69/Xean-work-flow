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

export function login(email, password) {
  return request("/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout() {
  return request("/logout", { method: "POST" });
}

export function getMe() {
  return request("/me");
}

export function getMyTickets() {
  return request("/maintenance");
}

export function getTicketDetail(id) {
  return request(`/maintenance/${id}`);
}

export function updateTicketStatus(id, status) {
  return request(`/maintenance/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}
