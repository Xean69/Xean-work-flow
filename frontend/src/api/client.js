const BASE_URL = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function getProperties() {
  return request("/properties");
}

export function getProperty(id) {
  return request(`/properties/${id}`);
}

export function createProperty(data) {
  return request("/properties", { method: "POST", body: JSON.stringify(data) });
}

export function updateProperty(id, data) {
  return request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteProperty(id) {
  return request(`/properties/${id}`, { method: "DELETE" });
}

export function createUnit(propertyId, data) {
  return request(`/properties/${propertyId}/units`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUnit(id, data) {
  return request(`/units/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteUnit(id) {
  return request(`/units/${id}`, { method: "DELETE" });
}

export function getTenants() {
  return request("/tenants");
}

export function createTenant(data) {
  return request("/tenants", { method: "POST", body: JSON.stringify(data) });
}

export function updateTenant(id, data) {
  return request(`/tenants/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteTenant(id) {
  return request(`/tenants/${id}`, { method: "DELETE" });
}

export function getMaintenanceRequests() {
  return request("/maintenance");
}

export function createMaintenanceRequest(data) {
  return request("/maintenance", { method: "POST", body: JSON.stringify(data) });
}

export function updateMaintenanceRequest(id, data) {
  return request(`/maintenance/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteMaintenanceRequest(id) {
  return request(`/maintenance/${id}`, { method: "DELETE" });
}

export function getDocuments() {
  return request("/documents");
}

// Bypasses the JSON-only request() helper: file uploads use FormData, and
// the browser needs to set its own multipart Content-Type header (with the
// boundary) rather than the one request() hardcodes.
export async function uploadDocument(formData) {
  const res = await fetch(`${BASE_URL}/documents`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function deleteDocument(id) {
  return request(`/documents/${id}`, { method: "DELETE" });
}

export function getDocumentUrl(id) {
  return `${BASE_URL}/documents/${id}/download`;
}
