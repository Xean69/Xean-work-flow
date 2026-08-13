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
