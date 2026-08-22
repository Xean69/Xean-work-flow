import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import {
  parseTenantBody,
  requirePassword,
  parseFirstPaymentBody,
  parseOccupantBody,
  parseEvictionEventBody,
  parseTenantNotesBody,
  parseChargeBody,
} from "../utils/validate.js";
import { hashPassword } from "../utils/auth.js";
import { currentPeriod } from "../utils/period.js";
import { ensureChargesForTenant, getBalanceDue, getPeriodStatus, deriveChargeStatus, allocatePayment } from "../utils/ledger.js";

const router = Router();

const URGENT_DAYS = 14;
const RENEWAL_DAYS = 60;

// Status is never stored — it's derived from lease_end every time it's
// requested, so it can't ever go stale the way a saved value would.
function computeStatus(leaseEnd) {
  const end = new Date(leaseEnd);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((end - today) / 86400000);
  if (daysLeft <= URGENT_DAYS) return "urgent_renewal";
  if (daysLeft <= RENEWAL_DAYS) return "renewal_due";
  return "active";
}

// pg returns DATE columns as JS Date objects (UTC midnight for that
// calendar date) — read via toISOString rather than local getters, which
// could roll a date near a month boundary into the wrong month depending
// on the server's timezone.
function periodOf(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return d.toISOString().slice(0, 7);
}

// Keeps units.status in sync with whether the unit currently has a tenant
// — but only called where occupancy itself actually changes (a tenant was
// added, removed, or moved to a different unit), never on a same-unit
// edit. Now that status has real lifecycle values beyond vacant/occupied
// (Turnover, Rent Ready, Notices...), unconditionally forcing it back to
// plain occupied/vacant on every tenant save would silently wipe out a
// manually-set status like "Notices" the next time someone just fixed a
// phone number.
async function syncUnitStatus(unitId) {
  const { rows } = await pool.query("SELECT 1 FROM tenants WHERE unit_id = $1 LIMIT 1", [
    unitId,
  ]);
  await pool.query("UPDATE units SET status = $1 WHERE id = $2", [
    rows.length ? "occupied" : "vacant",
    unitId,
  ]);
}

// A tenant's unit_id must belong to a property in the admin's own business
// — otherwise a request could attach a tenant to (or move one into) another
// business's unit by guessing its id. Returns nothing; throws 400 if the
// unit isn't found in this business.
async function assertUnitInBusiness(unitId, businessId) {
  const { rows } = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = $1 AND p.business_id = $2`,
    [unitId, businessId]
  );
  if (!rows[0]) throw new ApiError(400, "unit_id does not belong to a property in your business");
}

// Every addon a tenant selects must belong to their own unit's property —
// otherwise a request could bill a tenant for another property's addon by
// guessing its id. No-op on an empty list.
async function assertAddonsInProperty(addonIds, unitId, businessId) {
  if (addonIds.length === 0) return;
  const { rows } = await pool.query(
    `SELECT pa.id FROM property_addons pa
     JOIN units u ON u.property_id = pa.property_id
     WHERE u.id = $1 AND pa.business_id = $2 AND pa.id = ANY($3::int[])`,
    [unitId, businessId, addonIds]
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = addonIds.filter((id) => !found.has(id));
  if (missing.length) {
    throw new ApiError(400, `addon_id ${missing[0]} does not belong to this unit's property`);
  }
}

// Replaces a tenant's full addon set — simpler and safer than diffing
// against what's already there, since the manager always submits the
// complete intended selection (checkboxes + quantities), not a delta.
async function replaceTenantAddons(client, tenantId, addons) {
  await client.query("DELETE FROM tenant_addons WHERE tenant_id = $1", [tenantId]);
  for (const addon of addons) {
    await client.query("INSERT INTO tenant_addons (tenant_id, addon_id, quantity) VALUES ($1, $2, $3)", [
      tenantId,
      addon.addon_id,
      addon.quantity,
    ]);
  }
}

// GET /api/tenants - one row per unit across the whole portfolio: the
// unit's most recent tenant if it has one, or vacant if it doesn't.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         u.id AS unit_id,
         u.unit_number,
         u.rent_amount AS unit_rent_amount,
         p.id AS property_id,
         p.name AS property_name,
         t.id AS tenant_id,
         t.full_name,
         t.email,
         t.phone,
         t.lease_start,
         t.lease_end,
         t.rent_amount,
         t.deposit_amount,
         t.first_period_rent_amount,
         (t.password_hash IS NOT NULL) AS has_login,
         COALESCE(ta.addon_total, 0) AS addon_total,
         ta.addons,
         insp.id AS inspection_id,
         insp.status AS inspection_row_status,
         insp.signed_at AS inspection_signed_at
       FROM units u
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT *
         FROM tenants t2
         WHERE t2.unit_id = u.id
         ORDER BY t2.lease_end DESC, t2.created_at DESC
         LIMIT 1
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT
           SUM(ta2.quantity * pa.monthly_price) AS addon_total,
           json_agg(
             json_build_object(
               'id', ta2.id,
               'addon_id', pa.id,
               'name', pa.name,
               'quantity', ta2.quantity,
               'unit_price', pa.monthly_price,
               'subtotal', ta2.quantity * pa.monthly_price
             )
             ORDER BY pa.name
           ) AS addons
         FROM tenant_addons ta2
         JOIN property_addons pa ON pa.id = ta2.addon_id
         WHERE ta2.tenant_id = t.id
       ) ta ON true
       LEFT JOIN move_in_inspections insp ON insp.tenant_id = t.id
       WHERE p.business_id = $1
       ORDER BY p.name, u.unit_number`,
      [req.businessId]
    );

    // One batch query for every tenant's current-period ledger status,
    // rather than a query per row — same "This month" meaning the old
    // rentAmount+addonTotal formula produced, now sourced from real charge
    // rows instead of live math.
    const { rows: statusRows } = await pool.query(
      `SELECT
         c.tenant_id,
         SUM(c.amount) AS total_charged,
         COALESCE(SUM(alloc.allocated), 0) AS total_allocated
       FROM ledger_charges c
       JOIN tenants t ON t.id = c.tenant_id
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS allocated FROM payment_allocations WHERE charge_id = c.id
       ) alloc ON true
       WHERE t.business_id = $1 AND c.period = $2
       GROUP BY c.tenant_id`,
      [req.businessId, currentPeriod()]
    );
    const statusByTenant = new Map(statusRows.map((r) => [r.tenant_id, r]));

    res.json(
      rows.map((row) => {
        let inspectionStatus = "none";
        if (row.inspection_row_status === "draft") inspectionStatus = "draft";
        else if (row.inspection_row_status === "finalized") {
          inspectionStatus = row.inspection_signed_at ? "signed" : "pending_signature";
        }
        const { inspection_row_status, ...rest } = row;
        const periodStatus = statusByTenant.get(row.tenant_id);
        return {
          ...rest,
          addons: row.addons || [],
          status: row.tenant_id ? computeStatus(row.lease_end) : "vacant",
          payment_status: row.tenant_id
            ? deriveChargeStatus(periodStatus?.total_charged, periodStatus?.total_allocated)
            : null,
          inspection_status: row.tenant_id ? inspectionStatus : null,
        };
      })
    );
  })
);

// GET /api/tenants/:id - single-tenant detail for the Tenant Profile page.
// Simpler than the list query above: that one starts from every unit and
// finds each one's most recent tenant; this starts from the tenant itself,
// so there's no "most recent per unit" LATERAL needed.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         t.id AS tenant_id,
         t.unit_id,
         t.full_name,
         t.email,
         t.phone,
         t.lease_start,
         t.lease_end,
         t.rent_amount,
         t.deposit_amount,
         t.first_period_rent_amount,
         t.manager_notes,
         (t.password_hash IS NOT NULL) AS has_login,
         u.unit_number,
         u.rent_amount AS unit_rent_amount,
         p.id AS property_id,
         p.name AS property_name,
         COALESCE(ta.addon_total, 0) AS addon_total,
         COALESCE(ta.addons, '[]') AS addons,
         insp.id AS inspection_id,
         insp.status AS inspection_row_status,
         insp.signed_at AS inspection_signed_at
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(ta2.quantity * pa.monthly_price) AS addon_total,
           json_agg(
             json_build_object(
               'id', ta2.id,
               'addon_id', pa.id,
               'name', pa.name,
               'quantity', ta2.quantity,
               'unit_price', pa.monthly_price,
               'subtotal', ta2.quantity * pa.monthly_price
             )
             ORDER BY pa.name
           ) AS addons
         FROM tenant_addons ta2
         JOIN property_addons pa ON pa.id = ta2.addon_id
         WHERE ta2.tenant_id = t.id
       ) ta ON true
       LEFT JOIN move_in_inspections insp ON insp.tenant_id = t.id
       WHERE t.id = $1 AND t.business_id = $2`,
      [req.params.id, req.businessId]
    );
    const row = rows[0];
    if (!row) throw new ApiError(404, "Tenant not found");

    const [{ rows: occupants }, { rows: evictionEvents }, periodStatus, balanceDue] = await Promise.all([
      pool.query("SELECT * FROM tenant_occupants WHERE tenant_id = $1 ORDER BY created_at", [row.tenant_id]),
      pool.query("SELECT * FROM eviction_events WHERE tenant_id = $1 ORDER BY date_issued DESC, created_at DESC", [
        row.tenant_id,
      ]),
      getPeriodStatus(row.tenant_id, currentPeriod()),
      getBalanceDue(row.tenant_id),
    ]);

    let inspectionStatus = "none";
    if (row.inspection_row_status === "draft") inspectionStatus = "draft";
    else if (row.inspection_row_status === "finalized") {
      inspectionStatus = row.inspection_signed_at ? "signed" : "pending_signature";
    }
    const { inspection_row_status, ...rest } = row;

    res.json({
      ...rest,
      status: computeStatus(row.lease_end),
      payment_status: periodStatus.status,
      balance_due: balanceDue,
      inspection_status: inspectionStatus,
      occupants,
      eviction_events: evictionEvents,
    });
  })
);

// GET /api/tenants/:id/ledger - every charge and payment, oldest first,
// with a running balance. The Rent History section's real data source —
// charges and payments are two different tables, merged and sorted here
// rather than in the frontend so the running-balance math only exists once.
router.get(
  "/:id/ledger",
  asyncHandler(async (req, res) => {
    const { rows: tenantRows } = await pool.query("SELECT id FROM tenants WHERE id = $1 AND business_id = $2", [
      req.params.id,
      req.businessId,
    ]);
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const { rows: charges } = await pool.query(
      `SELECT
         c.id, c.charge_type, c.description, c.amount, c.due_date, c.period, c.created_at,
         COALESCE(alloc.allocated, 0) AS allocated
       FROM ledger_charges c
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS allocated FROM payment_allocations WHERE charge_id = c.id
       ) alloc ON true
       WHERE c.tenant_id = $1
       ORDER BY c.due_date ASC, c.id ASC`,
      [req.params.id]
    );
    const { rows: payments } = await pool.query(
      "SELECT id, amount, payment_date, method, notes FROM rent_payments WHERE tenant_id = $1 ORDER BY payment_date ASC, id ASC",
      [req.params.id]
    );

    const entries = [
      ...charges.map((c) => ({
        type: "charge",
        id: c.id,
        date: c.due_date,
        charge_type: c.charge_type,
        description: c.description,
        amount: Number(c.amount),
        allocated: Number(c.allocated),
        status: deriveChargeStatus(c.amount, c.allocated),
        created_at: c.created_at,
      })),
      ...payments.map((p) => ({
        type: "payment",
        id: p.id,
        date: p.payment_date,
        method: p.method,
        notes: p.notes,
        amount: Number(p.amount),
        created_at: p.created_at,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.created_at) - new Date(b.created_at));

    let balance = 0;
    for (const entry of entries) {
      balance += entry.type === "charge" ? entry.amount : -entry.amount;
      entry.running_balance = Math.round(balance * 100) / 100;
    }

    res.json(entries);
  })
);

// The manager-facing "Create charge" form. recurring=true also creates a
// recurring_charges definition so the same monthly job that generates rent
// and addon charges picks this up every period going forward — this first
// instance is created immediately rather than waiting for that job to run.
router.post(
  "/:id/charges",
  asyncHandler(async (req, res) => {
    const { rows: tenantRows } = await pool.query("SELECT id FROM tenants WHERE id = $1 AND business_id = $2", [
      req.params.id,
      req.businessId,
    ]);
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const data = parseChargeBody(req.body);

    // period is only meaningful (and only ever set) for charges the dedup
    // index needs to reason about — a recurring definition's own monthly
    // instances. A one-time manual charge gets period = null: two
    // independently-created one-off charges of the same type in the same
    // month are not duplicates and must both be allowed to exist.
    let sourceRecurringChargeId = null;
    let period = null;
    if (data.recurring) {
      const { rows: rcRows } = await pool.query(
        `INSERT INTO recurring_charges (tenant_id, description, amount, charge_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.params.id, data.description, data.amount, data.charge_type]
      );
      sourceRecurringChargeId = rcRows[0].id;
      period = periodOf(data.due_date);
    }

    const { rows } = await pool.query(
      `INSERT INTO ledger_charges (tenant_id, charge_type, description, amount, due_date, period, source_recurring_charge_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.params.id, data.charge_type, data.description, data.amount, data.due_date, period, sourceRecurringChargeId]
    );
    res.status(201).json(rows[0]);
  })
);

// Separate from the main tenant edit so updating a memo doesn't require
// resubmitting lease/rent/addons — manager-only by construction (never
// selected on portal.js's tenant-facing /me route).
router.put(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const data = parseTenantNotesBody(req.body);
    const { rows } = await pool.query(
      "UPDATE tenants SET manager_notes = $1 WHERE id = $2 AND business_id = $3 RETURNING id, manager_notes",
      [data.manager_notes, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    res.json(rows[0]);
  })
);

router.post(
  "/:id/occupants",
  asyncHandler(async (req, res) => {
    const { rows: tenantRows } = await pool.query(
      "SELECT id FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const data = parseOccupantBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO tenant_occupants (tenant_id, full_name, relationship, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, data.full_name, data.relationship, data.notes]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  "/:id/eviction-events",
  asyncHandler(async (req, res) => {
    const { rows: tenantRows } = await pool.query(
      "SELECT id FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!tenantRows[0]) throw new ApiError(404, "Tenant not found");

    const data = parseEvictionEventBody(req.body);
    const { rows } = await pool.query(
      `INSERT INTO eviction_events (tenant_id, notice_type, stage, date_issued, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, data.notice_type, data.stage, data.date_issued, data.notes]
    );
    res.status(201).json(rows[0]);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parseTenantBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);
    await assertAddonsInProperty(
      data.addons.map((a) => a.addon_id),
      data.unit_id,
      req.businessId
    );

    // Optional: "record this as the tenant's first rent payment", checked
    // during creation on the Tenants page. Validated up front so a bad
    // payment body fails before the tenant row is ever inserted.
    const firstPayment = req.body.first_payment ? parseFirstPaymentBody(req.body.first_payment) : null;

    const client = await pool.connect();
    let tenant;
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO tenants (business_id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount, first_period_rent_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount, first_period_rent_amount, created_at`,
        [
          req.businessId,
          data.unit_id,
          data.full_name,
          data.email,
          data.phone,
          data.lease_start,
          data.lease_end,
          data.rent_amount,
          data.deposit_amount,
          data.first_period_rent_amount,
        ]
      );
      tenant = rows[0];

      await replaceTenantAddons(client, tenant.id, data.addons);

      // Generates this tenant's own first-period rent + addon charges right
      // now, in the same transaction — otherwise their ledger would sit
      // empty until the next scheduled run generates everyone else's.
      await ensureChargesForTenant(client, tenant.id, periodOf(data.lease_start), tenant);

      if (firstPayment) {
        const { rows: paymentRows } = await client.query(
          `INSERT INTO rent_payments (business_id, tenant_id, amount, payment_date, method, period_covered, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            req.businessId,
            tenant.id,
            firstPayment.amount,
            firstPayment.payment_date,
            firstPayment.method,
            data.lease_start.slice(0, 7),
            req.adminId,
          ]
        );
        await allocatePayment(client, paymentRows[0].id, tenant.id, firstPayment.amount);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await syncUnitStatus(data.unit_id);
    res.status(201).json(tenant);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      "SELECT unit_id FROM tenants WHERE id = $1 AND business_id = $2",
      [req.params.id, req.businessId]
    );
    if (!existingRows[0]) throw new ApiError(404, "Tenant not found");
    const previousUnitId = existingRows[0].unit_id;

    const data = parseTenantBody(req.body);
    await assertUnitInBusiness(data.unit_id, req.businessId);
    await assertAddonsInProperty(
      data.addons.map((a) => a.addon_id),
      data.unit_id,
      req.businessId
    );

    const client = await pool.connect();
    let tenant;
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `UPDATE tenants
         SET unit_id = $1, full_name = $2, email = $3, phone = $4, lease_start = $5, lease_end = $6, rent_amount = $7, deposit_amount = $8, updated_at = now()
         WHERE id = $9 AND business_id = $10
         RETURNING id, unit_id, full_name, email, phone, lease_start, lease_end, rent_amount, deposit_amount, created_at`,
        [
          data.unit_id,
          data.full_name,
          data.email,
          data.phone,
          data.lease_start,
          data.lease_end,
          data.rent_amount,
          data.deposit_amount,
          req.params.id,
          req.businessId,
        ]
      );
      tenant = rows[0];

      await replaceTenantAddons(client, req.params.id, data.addons);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Only re-sync when occupancy actually moved — the new unit definitely
    // gained a tenant (force to occupied), and the old one definitely lost
    // one (force to vacant). A same-unit edit (e.g. fixing a phone number)
    // leaves the unit's status alone, whatever a manager last set it to.
    if (previousUnitId !== data.unit_id) {
      await syncUnitStatus(data.unit_id);
      await syncUnitStatus(previousUnitId);
    }

    res.json(tenant);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM tenants WHERE id = $1 AND business_id = $2 RETURNING unit_id",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    await syncUnitStatus(rows[0].unit_id);
    res.status(204).end();
  })
);

// Lets the property manager set or reset a tenant's portal login. There's
// no invite/self-signup flow yet — this is the manual stand-in for it.
router.put(
  "/:id/password",
  asyncHandler(async (req, res) => {
    const password = requirePassword(req.body.password);
    const { rows } = await pool.query(
      "UPDATE tenants SET password_hash = $1 WHERE id = $2 AND business_id = $3 RETURNING id",
      [await hashPassword(password), req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Tenant not found");
    res.status(204).end();
  })
);

export default router;
