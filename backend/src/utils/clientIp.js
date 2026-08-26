// Production requests reach this app through two proxy hops (Vercel edge,
// then Railway's edge — see index.js's vercel.json/rewrite note), but
// `app.set("trust proxy", 1)` only trusts one hop back, tuned specifically
// for X-Forwarded-Proto/secure-cookie detection (see that comment) and
// deliberately left alone here rather than risk regressing session
// behavior for this feature's sake. Under-trusting by one hop means
// Express's own req.ip resolves to an intermediate proxy address that
// rotates across edge nodes, not the real visitor — confirmed in
// production testing, where a single browser session's requests recorded
// as two different alternating IPs. X-Forwarded-For is append-only left to
// right (each hop adds its own address to the end), so the leftmost entry
// is always the original client regardless of how many hops follow — this
// sidesteps the trust-proxy hop-count mismatch entirely instead of
// touching that global, session-critical setting.
export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim() !== "") {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress;
}
