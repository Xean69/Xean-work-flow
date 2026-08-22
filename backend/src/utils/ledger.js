import pool from "../db.js";
import { parsePeriod } from "./period.js";

// pg returns DATE columns as JS Date objects (UTC midnight) — read via
// toISOString rather than local getters, same reasoning as tenants.js's
// own periodOf, duplicated here since this module has no other overlap
// with that file.
function periodOf(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return d.toISOString().slice(0, 7);
}

async function insertChargeIfMissing(client, {
  tenantId,
  chargeType,
  description,
  amount,
  dueDate,
  period,
  sourceAddonId = null,
  sourceRecurringChargeId = null,
}) {
  await client.query(
    `INSERT INTO ledger_charges (tenant_id, charge_type, description, amount, due_date, period, source_addon_id, source_recurring_charge_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, charge_type, period, COALESCE(source_addon_id, -1), COALESCE(source_recurring_charge_id, -1))
     DO NOTHING`,
    [tenantId, chargeType, description, amount, dueDate, period, sourceAddonId, sourceRecurringChargeId]
  );
}

// Generates this tenant's rent + addon + active-recurring-charge rows for
// one period — idempotent via idx_ledger_charges_dedup (ON CONFLICT DO
// NOTHING), so it's safe to call this more than once for the same period
// without ever double-charging. Used both by the portfolio-wide sweep below
// and directly at tenant-creation time, so a brand new tenant's first
// period isn't left empty until the next scheduled run.
export async function ensureChargesForTenant(client, tenantId, period, tenantRow = null) {
  const { start } = parsePeriod(period);
  const tenant =
    tenantRow ||
    (
      await client.query(
        "SELECT id, rent_amount, first_period_rent_amount, lease_start FROM tenants WHERE id = $1",
        [tenantId]
      )
    ).rows[0];
  if (!tenant) return;

  const isFirstPeriod = periodOf(tenant.lease_start) === period;
  const rentAmount =
    isFirstPeriod && tenant.first_period_rent_amount != null ? tenant.first_period_rent_amount : tenant.rent_amount;

  await insertChargeIfMissing(client, {
    tenantId,
    chargeType: "rent",
    description: "Rent",
    amount: rentAmount,
    dueDate: start,
    period,
  });

  const { rows: addons } = await client.query(
    `SELECT pa.id AS addon_id, pa.name, ta.quantity, pa.monthly_price
     FROM tenant_addons ta JOIN property_addons pa ON pa.id = ta.addon_id
     WHERE ta.tenant_id = $1`,
    [tenantId]
  );
  for (const addon of addons) {
    await insertChargeIfMissing(client, {
      tenantId,
      chargeType: "addon",
      description: addon.name,
      amount: addon.quantity * addon.monthly_price,
      dueDate: start,
      period,
      sourceAddonId: addon.addon_id,
    });
  }

  const { rows: recurring } = await client.query(
    "SELECT id, description, amount, charge_type FROM recurring_charges WHERE tenant_id = $1 AND active = true",
    [tenantId]
  );
  for (const rc of recurring) {
    await insertChargeIfMissing(client, {
      tenantId,
      chargeType: rc.charge_type,
      description: rc.description,
      amount: rc.amount,
      dueDate: start,
      period,
      sourceRecurringChargeId: rc.id,
    });
  }
}

// Portfolio-wide sweep for one period, across every business — what the
// scheduler calls. Scoped to tenants whose lease actually covers the
// period, same "currently under lease" definition used elsewhere.
export async function ensureChargesForPeriod(period) {
  const { start, end } = parsePeriod(period);
  const { rows: tenants } = await pool.query(
    `SELECT id, rent_amount, first_period_rent_amount, lease_start
     FROM tenants
     WHERE lease_start <= $2 AND lease_end >= $1`,
    [start, end]
  );
  for (const tenant of tenants) {
    await ensureChargesForTenant(pool, tenant.id, period, tenant);
  }
}

// Same "$0 owed is trivially paid" reasoning the old rentAmount+addonTotal
// formula used — now applied to real charge totals instead of a live
// calculation, so it naturally covers late fees/custom charges too.
export function deriveChargeStatus(totalAmount, totalAllocated) {
  const charged = Number(totalAmount) || 0;
  const allocated = Number(totalAllocated) || 0;
  if (charged <= 0) return "paid";
  if (allocated >= charged) return "paid";
  if (allocated <= 0) return "unpaid";
  return "partial";
}

// This period's charges vs. what's been allocated against them — what
// drives the Tenants list "This month" badge and the portal's own status,
// same period-scoped meaning computePaymentStatus used to have.
export async function getPeriodStatus(tenantId, period) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(c.amount), 0) AS total_charged,
       COALESCE(SUM(alloc.allocated), 0) AS total_allocated
     FROM ledger_charges c
     LEFT JOIN LATERAL (
       SELECT SUM(amount) AS allocated FROM payment_allocations WHERE charge_id = c.id
     ) alloc ON true
     WHERE c.tenant_id = $1 AND c.period = $2`,
    [tenantId, period]
  );
  const { total_charged, total_allocated } = rows[0];
  return {
    total_charged: Number(total_charged),
    total_allocated: Number(total_allocated),
    status: deriveChargeStatus(total_charged, total_allocated),
  };
}

// The ledger-wide "Balance due" — every unpaid/partial charge ever, not
// just this period's. This is what a real ledger balance means; carrying
// arrears forward is the whole point, unlike the period-scoped status above.
export async function getBalanceDue(tenantId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(c.amount - COALESCE(alloc.allocated, 0)), 0) AS balance_due
     FROM ledger_charges c
     LEFT JOIN LATERAL (
       SELECT SUM(amount) AS allocated FROM payment_allocations WHERE charge_id = c.id
     ) alloc ON true
     WHERE c.tenant_id = $1`,
    [tenantId]
  );
  return Math.max(0, Number(rows[0].balance_due));
}

// Applies a payment's amount against this tenant's outstanding charges,
// oldest due_date first. Any leftover once every charge is fully covered
// is left unapplied — a credit visible in the ledger, not auto-pulled into
// a future charge (the simplest, most auditable option, confirmed for this
// feature rather than assumed).
export async function allocatePayment(client, paymentId, tenantId, amount) {
  const { rows: outstanding } = await client.query(
    `SELECT c.id, c.amount - COALESCE(SUM(pa.amount), 0) AS remaining
     FROM ledger_charges c
     LEFT JOIN payment_allocations pa ON pa.charge_id = c.id
     WHERE c.tenant_id = $1
     GROUP BY c.id, c.amount, c.due_date
     HAVING c.amount - COALESCE(SUM(pa.amount), 0) > 0
     ORDER BY c.due_date ASC, c.id ASC`,
    [tenantId]
  );

  let remaining = Number(amount);
  for (const charge of outstanding) {
    if (remaining <= 0) break;
    const toApply = Math.round(Math.min(remaining, Number(charge.remaining)) * 100) / 100;
    if (toApply <= 0) continue;
    await client.query("INSERT INTO payment_allocations (payment_id, charge_id, amount) VALUES ($1, $2, $3)", [
      paymentId,
      charge.id,
      toApply,
    ]);
    remaining = Math.round((remaining - toApply) * 100) / 100;
  }
}

// Used when a payment is edited (amount changed) or deleted — removes its
// existing allocations so they can be recomputed fresh rather than left
// stale. Deleting the payment itself already cascades this via the FK;
// this is for the edit path, where the payment row survives.
export async function clearAllocationsForPayment(client, paymentId) {
  await client.query("DELETE FROM payment_allocations WHERE payment_id = $1", [paymentId]);
}
