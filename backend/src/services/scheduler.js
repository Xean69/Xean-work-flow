import { ensureChargesForPeriod } from "../utils/ledger.js";
import { currentPeriod } from "../utils/period.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for a once-a-month job

// No cron dependency — a plain hourly re-check of the (idempotent) charge
// generator is simpler than it looks and more robust than a single
// precisely-timed fire: it also catches up automatically after any
// downtime or redeploy near the 1st, and the very first call at server
// startup is what bootstraps the current period for free the day this
// feature ships, with no separate backfill script needed.
export function startLedgerScheduler() {
  runCheck();
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

async function runCheck() {
  try {
    await ensureChargesForPeriod(currentPeriod());
  } catch (err) {
    console.error("Ledger charge generation failed:", err);
  }
}
