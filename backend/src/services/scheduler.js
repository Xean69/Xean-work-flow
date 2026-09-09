import pool from "../db.js";
import { ensureAllTenantsLedgers } from "../utils/ledger.js";
import { getDomainStatus } from "./vercelDomains.js";
import { runDatabaseBackup } from "./backup.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for a once-a-month job

// No cron dependency — a plain hourly re-check is simpler than it looks and
// more robust than a single precisely-timed fire: it also catches up
// automatically after any downtime or redeploy, including one that happens
// to land on the last day of the month (in whichever business's timezone —
// see ensureAllTenantsLedgers, which now does both the safety-net backfill
// and the last-day-of-month advance billing per tenant, each resolved in
// that tenant's own business's timezone rather than the server's).
export function startLedgerScheduler() {
  runCheck();
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

async function runCheck() {
  try {
    await ensureAllTenantsLedgers();
  } catch (err) {
    console.error("Ledger sweep failed:", err);
  }
}

const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly re-check, same reasoning as the ledger scheduler above
const BACKUP_FRESHNESS_HOURS = 20; // "has today's backup already happened" -- see runBackupCheck

// Same hourly-re-check shape as startLedgerScheduler: rather than a single
// timer fired once a day (which drifts or gets skipped entirely across a
// redeploy that happens to land at exactly the wrong moment), this checks
// every hour whether a successful backup has landed recently and only
// actually runs one if not. Backed by backup_runs (a real DB row, not
// in-memory state), so it survives restarts and never double-runs or
// silently stops after a deploy.
export function startBackupScheduler() {
  runBackupCheck();
  setInterval(runBackupCheck, BACKUP_CHECK_INTERVAL_MS);
}

async function runBackupCheck() {
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM backup_runs WHERE status = 'success' AND finished_at > now() - ($1 || ' hours')::interval",
      [BACKUP_FRESHNESS_HOURS]
    );
    if (rows.length > 0) return; // already backed up recently -- nothing to do this tick
    await runDatabaseBackup();
  } catch (err) {
    console.error("Backup check failed:", err);
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
