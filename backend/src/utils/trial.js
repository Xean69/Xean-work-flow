const TRIAL_DAYS = 14;

// Same derive-at-read-time approach as lease status (tenants.js) and STR
// license status (strLicenses.js) — computed fresh from created_at on every
// request rather than stored, so it can never go stale independent of the
// date itself.
export function computeTrialStatus(createdAt) {
  const start = new Date(createdAt);
  const msElapsed = Date.now() - start.getTime();
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  return daysElapsed >= TRIAL_DAYS ? "expired" : "active";
}
