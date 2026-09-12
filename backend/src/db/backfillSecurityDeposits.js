import "dotenv/config";
import pool from "../db.js";
import { ensureSecurityDepositCharge } from "../utils/ledger.js";

// One-off, safe-to-rerun backfill: existing tenants had a deposit_amount on
// their profile long before deposits became a real ledger charge. This
// creates the missing "Security Deposit" charge for each of them, dated to
// their own lease_start, using ensureSecurityDepositCharge — the exact
// same function tenant creation now calls, so a tenant already carrying
// one (created after this feature shipped, or from a previous run of this
// same script) is left untouched rather than double-charged.
try {
  const { rows: tenants } = await pool.query(
    "SELECT id, full_name, deposit_amount, lease_start FROM tenants WHERE deposit_amount > 0 ORDER BY id"
  );

  console.log(`Checking ${tenants.length} tenant(s) with a deposit amount on file...\n`);

  let created = 0;
  let skipped = 0;
  for (const tenant of tenants) {
    const charge = await ensureSecurityDepositCharge(pool, tenant.id, tenant.deposit_amount, tenant.lease_start);
    if (charge) {
      created++;
      console.log(`  Created: tenant #${tenant.id} (${tenant.full_name}) — $${tenant.deposit_amount}`);
    } else {
      skipped++;
    }
  }

  console.log(`\nDone. ${created} deposit charge(s) created, ${skipped} already had one and were skipped.`);
} catch (err) {
  console.error("Backfill failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
