// Relative — in local dev this is proxied to localhost by vite.config.js;
// in production, Vercel proxies it straight through to the Railway backend
// (see vercel.json) rather than calling it as a separate origin. Either
// way, this API is always same-site with whatever's calling it.
const BASE_URL = "/api";

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
  return request("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function signup(businessName, email, password) {
  return request("/admin/signup", {
    method: "POST",
    body: JSON.stringify({ business_name: businessName, email, password }),
  });
}

export function logout() {
  return request("/admin/logout", { method: "POST" });
}

export function forgotPassword(email) {
  return request("/admin/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token, password) {
  return request("/admin/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

export function getMe() {
  return request("/admin/me");
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

export function setTenantPassword(id, password) {
  return request(`/tenants/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) });
}

export function getRentPayments(tenantId) {
  return request(`/rent-payments?tenant_id=${tenantId}`);
}

export function createRentPayment(data) {
  return request("/rent-payments", { method: "POST", body: JSON.stringify(data) });
}

export function updateRentPayment(id, data) {
  return request(`/rent-payments/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteRentPayment(id) {
  return request(`/rent-payments/${id}`, { method: "DELETE" });
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

export function getMaintenanceRequest(id) {
  return request(`/maintenance/${id}`);
}

export function addMaintenanceComment(id, body) {
  return request(`/maintenance/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

export function getDocuments() {
  return request("/documents");
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

export function uploadDocument(formData) {
  return uploadRequest("/documents", formData);
}

export function deleteDocument(id) {
  return request(`/documents/${id}`, { method: "DELETE" });
}

export function getDocumentUrl(id) {
  return `${BASE_URL}/documents/${id}/download`;
}

export function extractDocument(id) {
  return request(`/documents/${id}/extract`, { method: "POST" });
}

export function updateExtractedData(id, data) {
  return request(`/documents/${id}/extracted-data`, { method: "PUT", body: JSON.stringify(data) });
}

export function getStays() {
  return request("/stays");
}

export function createStay(data) {
  return request("/stays", { method: "POST", body: JSON.stringify(data) });
}

export function updateStay(id, data) {
  return request(`/stays/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteStay(id) {
  return request(`/stays/${id}`, { method: "DELETE" });
}

export function getScheduledMessages() {
  return request("/scheduled-messages");
}

export function updateScheduledMessage(id, data) {
  return request(`/scheduled-messages/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function getExpenses() {
  return request("/expenses");
}

export function createExpense(formData) {
  return uploadRequest("/expenses", formData);
}

export function updateExpense(id, formData) {
  return uploadRequest(`/expenses/${id}`, formData, "PUT");
}

export function deleteExpense(id) {
  return request(`/expenses/${id}`, { method: "DELETE" });
}

export function getExpenseReceiptUrl(id) {
  return `${BASE_URL}/expenses/${id}/receipt`;
}

export function getMessageThreads() {
  return request("/messages/threads");
}

export function getMessageThread(tenantId) {
  return request(`/messages/${tenantId}`);
}

export function sendManagerMessage(tenantId, body) {
  return request(`/messages/${tenantId}`, { method: "POST", body: JSON.stringify({ body }) });
}

export function createGuideSection(propertyId, data) {
  return request(`/properties/${propertyId}/guide`, { method: "POST", body: JSON.stringify(data) });
}

export function updateGuideSection(id, data) {
  return request(`/guide-sections/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteGuideSection(id) {
  return request(`/guide-sections/${id}`, { method: "DELETE" });
}

export function previewPropertyImport(formData) {
  return uploadRequest("/import/properties/preview", formData);
}

export function commitPropertyImport(rows) {
  return request("/import/properties/commit", { method: "POST", body: JSON.stringify({ rows }) });
}

export function previewTenantImport(formData) {
  return uploadRequest("/import/tenants/preview", formData);
}

export function commitTenantImport(rows) {
  return request("/import/tenants/commit", { method: "POST", body: JSON.stringify({ rows }) });
}

export function getTeam() {
  return request("/team");
}

export function inviteTeamMember(email, role) {
  return request("/team", { method: "POST", body: JSON.stringify({ email, role }) });
}

export function updateTeamMemberRole(id, role) {
  return request(`/team/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) });
}

export function removeTeamMember(id) {
  return request(`/team/${id}`, { method: "DELETE" });
}

export function getOwnerStatements(month) {
  return request(`/owner-statements?month=${encodeURIComponent(month)}`);
}

export function getStrLicenses() {
  return request("/str-licenses");
}

export function createStrLicense(data) {
  return request("/str-licenses", { method: "POST", body: JSON.stringify(data) });
}

export function updateStrLicense(id, data) {
  return request(`/str-licenses/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteStrLicense(id) {
  return request(`/str-licenses/${id}`, { method: "DELETE" });
}

export function getRecentActivity() {
  return request("/activity");
}

export function updateDocumentStatus(id, status) {
  return request(`/documents/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
}

export function getComplianceChecks() {
  return request("/compliance-checks");
}

export function createComplianceCheck(data) {
  return request("/compliance-checks", { method: "POST", body: JSON.stringify(data) });
}

export function updateComplianceCheck(id, data) {
  return request(`/compliance-checks/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateComplianceCheckStatus(id, status) {
  return request(`/compliance-checks/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
}

export function deleteComplianceCheck(id) {
  return request(`/compliance-checks/${id}`, { method: "DELETE" });
}

export function getInsights() {
  return request("/insights");
}

export function generateInsights() {
  return request("/insights/generate", { method: "POST" });
}

export function dismissInsight(id) {
  return request(`/insights/${id}/dismiss`, { method: "PUT" });
}

export function createInspection(tenantId) {
  return request("/move-in-inspections", { method: "POST", body: JSON.stringify({ tenant_id: tenantId }) });
}

export function getInspectionByTenant(tenantId) {
  return request(`/move-in-inspections/by-tenant/${tenantId}`);
}

export function addInspectionRoom(inspectionId, name) {
  return request(`/move-in-inspections/${inspectionId}/rooms`, { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteInspectionRoom(inspectionId, roomId) {
  return request(`/move-in-inspections/${inspectionId}/rooms/${roomId}`, { method: "DELETE" });
}

export function addInspectionItem(inspectionId, roomId, label) {
  return request(`/move-in-inspections/${inspectionId}/rooms/${roomId}/items`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function updateInspectionItem(inspectionId, itemId, data) {
  return request(`/move-in-inspections/${inspectionId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteInspectionItem(inspectionId, itemId) {
  return request(`/move-in-inspections/${inspectionId}/items/${itemId}`, { method: "DELETE" });
}

export function uploadInspectionPhoto(inspectionId, itemId, formData) {
  return uploadRequest(`/move-in-inspections/${inspectionId}/items/${itemId}/photos`, formData);
}

export function deleteInspectionPhoto(inspectionId, photoId) {
  return request(`/move-in-inspections/${inspectionId}/photos/${photoId}`, { method: "DELETE" });
}

export function finalizeInspection(inspectionId) {
  return request(`/move-in-inspections/${inspectionId}/finalize`, { method: "PUT" });
}
