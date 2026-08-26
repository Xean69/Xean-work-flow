// Separate from client.js (the authenticated dashboard API) the same way
// staffApi.js/portalApi.js are their own files for their own session
// types — these three calls hit the one part of the backend with no
// session at all (see backend/src/routes/contact.js).
const BASE_URL = "/api/contact";

async function request(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function submitContactInquiry(body) {
  return request("/inquiry", body);
}

export function submitContactChat(body) {
  return request("/chat", body);
}

export function submitDemoRequest(body) {
  return request("/demo", body);
}
