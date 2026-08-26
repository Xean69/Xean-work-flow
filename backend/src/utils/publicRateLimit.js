import { ApiError } from "./errors.js";

// A tiny in-memory limiter for the one part of the app with no session and
// no other throttle — every other route is either behind auth or is itself
// a login attempt. In-memory is fine here the same way the session store's
// own comment reasons about this being a single-server app: one Railway
// instance, no need for a shared store like Redis. Resets on every deploy
// or restart, which is an acceptable tradeoff at this scale — this is
// "basic" spam protection, not a hardened defense (a bot that rotates IPs
// still gets through; see routes/contact.js's own note on residual risk).
//
// Keyed by whatever the caller passes as the bucket key (req.ip), not by
// route, so a bot can't dodge the limit by spreading requests across the
// three contact endpoints instead of hammering one.
const buckets = new Map();

// Without this, every unique IP that ever hits a rate-limited route stays
// in the map forever, even long after its timestamps have all aged out —
// a slow, unbounded leak over enough uptime. Sweeping hourly keeps memory
// bounded to recently-active callers without needing a TTL cache library.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    if (timestamps.every((t) => now - t > 60 * 60 * 1000)) buckets.delete(key);
  }
}, 60 * 60 * 1000).unref();

export function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      return next(new ApiError(429, "Too many requests — please try again later."));
    }

    timestamps.push(now);
    buckets.set(key, timestamps);
    next();
  };
}
