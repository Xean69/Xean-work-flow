import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import pool from "../db.js";
import { getClientIp } from "../utils/clientIp.js";
import { generateDeviceToken, hashDeviceToken } from "../utils/deviceToken.js";

// ownerColumn is always a hardcoded literal from trusted route code
// ("admin_id" | "tenant_id" | "staff_id"), never derived from a request —
// same guard, same reasoning as services/pushSubscriptions.js.
const OWNER_COLUMNS = ["admin_id", "tenant_id", "staff_id"];

function assertOwnerColumn(ownerColumn) {
  if (!OWNER_COLUMNS.includes(ownerColumn)) {
    throw new Error(`Invalid known_devices owner column: ${ownerColumn}`);
  }
}

const DEVICE_COOKIE_NAME = "xean_device_id";
// ~400 days — Chrome's own cap on how long it will honor a cookie's
// Max-Age, so this is effectively "as long as a browser will let a cookie
// live," not an arbitrary shorter number that would make an infrequent
// user look "new" again just from time passing.
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

// No cookie-parser dependency for this one cookie — express-session
// already parses its own session cookie internally, but doesn't expose a
// generic req.cookies for anything else, and pulling in a whole
// dependency to read one cookie name back out of a header is more than
// this needs.
function readDeviceCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const prefix = `${DEVICE_COOKIE_NAME}=`;
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function writeDeviceCookie(res, token) {
  res.cookie(DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    // Same rule as index.js's session cookie: a Secure cookie is silently
    // dropped over the plain HTTP local dev runs on.
    secure: process.env.RAILWAY_ENVIRONMENT === "production",
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

// "Chrome on Windows", "Safari on iPhone" — prefers the device model
// (populated for phones/tablets) over the bare OS name, and drops
// ua-parser-js's "Mobile " browser-name prefix so a phone reads "Safari
// on iPhone" rather than "Mobile Safari on iPhone".
function describeDevice(userAgent) {
  if (!userAgent) return "Unknown device";
  const { browser, os, device } = UAParser(userAgent);
  const browserName = (browser.name || "Unknown browser").replace(/^Mobile\s+/, "");
  const platform = device.model || os.name || "Unknown device";
  return `${browserName} on ${platform}`;
}

// City-level, from a bundled offline database (geoip-lite) rather than a
// live third-party API — no per-request network call on the login path,
// no API key, no rate limit, and no ToS question about a commercial app
// calling a "free for non-commercial use" geolocation service. Genuinely
// approximate (IP geolocation always is) — the email this feeds says so
// explicitly. Returns null for private/local/unallocated IPs (e.g. local
// dev, or a proxy that never forwarded a real client IP), which callers
// render as "unavailable" rather than a misleading empty string.
function describeLocation(ip) {
  const geo = ip ? geoip.lookup(ip) : null;
  if (!geo) return null;
  return [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || null;
}

// Called once, right after password verification, in each of the three
// login routes. Reads (or issues) this browser's long-lived device
// cookie, checks it against this specific account's known devices, and
// records/updates that row — synchronous, fast (one cookie write, one
// query), and done before the login response is sent since writing the
// cookie has to happen before headers go out. The caller decides whether
// to actually send the alert email based on the returned `isNewDevice`,
// and does that send *without* awaiting it — network calls to the email
// provider have no business delaying the login response.
//
// Never throws: a bug here should never turn into a broken login. Worst
// case on failure is a missed alert for that one login, not a 500.
export async function recordDeviceLogin({ req, res, ownerColumn, ownerId }) {
  try {
    assertOwnerColumn(ownerColumn);

    let token = readDeviceCookie(req);
    if (!token) token = generateDeviceToken();
    writeDeviceCookie(res, token); // refresh the expiry on every login, known or not

    const tokenHash = hashDeviceToken(token);
    const userAgent = req.headers["user-agent"] || "";
    const ip = getClientIp(req);

    const { rows: existing } = await pool.query(
      `SELECT id FROM known_devices WHERE ${ownerColumn} = $1 AND device_token_hash = $2`,
      [ownerId, tokenHash]
    );

    if (existing[0]) {
      await pool.query("UPDATE known_devices SET last_seen_at = now(), ip_address = $1, user_agent = $2 WHERE id = $3", [
        ip,
        userAgent,
        existing[0].id,
      ]);
      return { isNewDevice: false };
    }

    await pool.query(
      `INSERT INTO known_devices (${ownerColumn}, device_token_hash, user_agent, ip_address) VALUES ($1, $2, $3, $4)`,
      [ownerId, tokenHash, userAgent, ip]
    );

    return {
      isNewDevice: true,
      deviceLabel: describeDevice(userAgent),
      location: describeLocation(ip),
    };
  } catch (err) {
    console.error("recordDeviceLogin failed:", err);
    return { isNewDevice: false };
  }
}
