import pool from "../db.js";
import { ensureChargesForPeriod } from "../utils/ledger.js";
import { currentPeriod } from "../utils/period.js";
import { getDomainStatus } from "./vercelDomains.js";

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

const SUBDOMAIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Picks up a <subdomain>.xean.ca going from "pending" to "active" once its
// manually-added CNAME (see notifyHrOfSubdomainActivationRequest in
// services/email.js) has propagated and Vercel has issued its certificate —
// this is what lets a manager see their subdomain activate on its own,
// with no polling from the frontend and no manual "check status" click
// required (that route exists too, in routes/websites.js, purely for
// immediate feedback right after activating).
export function startSubdomainVerificationScheduler() {
  setInterval(runSubdomainCheck, SUBDOMAIN_CHECK_INTERVAL_MS);
}

async function runSubdomainCheck() {
  try {
    const { rows } = await pool.query(
      "SELECT business_id, custom_domain FROM business_websites WHERE custom_domain IS NOT NULL AND custom_domain_verified = false"
    );
    for (const row of rows) {
      try {
        const status = await getDomainStatus(row.custom_domain);
        if (status.verified) {
          await pool.query("UPDATE business_websites SET custom_domain_verified = true WHERE business_id = $1", [
            row.business_id,
          ]);
        }
      } catch (err) {
        console.error(`Subdomain verification check failed for ${row.custom_domain}:`, err);
      }
    }
  } catch (err) {
    console.error("Subdomain verification sweep failed:", err);
  }
}
