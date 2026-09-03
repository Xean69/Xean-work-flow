// Thin wrapper around Vercel's REST API for attaching a business's
// <subdomain>.xean.ca hostname to this one Vercel project (see
// routes/websites.js's subdomain routes and services/scheduler.js's
// verification poller — the only two callers). Requires VERCEL_API_TOKEN,
// VERCEL_PROJECT_ID, and (only if the Vercel account is a Team, not
// personal) VERCEL_TEAM_ID as Railway env vars — none of this ever runs
// without them configured.
const VERCEL_API_BASE = "https://api.vercel.com";

function projectPath(suffix = "") {
  const { VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env;
  const query = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : "";
  return `${VERCEL_API_BASE}/v10/projects/${VERCEL_PROJECT_ID}/domains${suffix}${query}`;
}

async function vercelRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Vercel API request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

// Attaches the hostname to the project. Vercel returns verified: false for
// a brand-new subdomain until its DNS resolves — that's expected here, not
// an error; the caller stores custom_domain_verified = false and the
// background poller (services/scheduler.js) picks up the eventual true.
export async function addDomain(hostname) {
  return vercelRequest(projectPath(), {
    method: "POST",
    body: JSON.stringify({ name: hostname }),
  });
}

// Used by both the manager-triggered "Check status" route and the
// background poller — a plain GET reflects Vercel's current view of the
// domain (verified once its CNAME resolves and Vercel issues the cert) with
// no side effects, unlike the POST .../verify challenge-check endpoint
// which isn't needed here since a xean.ca subdomain never requires a TXT
// ownership challenge (Xean already owns the parent domain).
export async function getDomainStatus(hostname) {
  return vercelRequest(projectPath(`/${encodeURIComponent(hostname)}`), { method: "GET" });
}

// Best-effort, like deleteFromCloudinary in utils/upload.js — a failed
// detach here should never block a manager turning their subdomain off in
// the app; it just leaves a stale (harmless, unresolvable) domain attached
// on the Vercel side for manual cleanup later.
export async function removeDomain(hostname) {
  try {
    await vercelRequest(projectPath(`/${encodeURIComponent(hostname)}`), { method: "DELETE" });
  } catch (err) {
    console.error(`Failed to remove Vercel domain ${hostname}:`, err);
  }
}
