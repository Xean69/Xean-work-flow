import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseTenantBody, requirePassword, parseFirstPaymentBody } from "../utils/validate.js";
import { hashPassword } from "../utils/auth.js";
import { currentPeriod } from "../utils/period.js";

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

// Same derive-don't-store approach as computeStatus: paid >= rent covers
// $0 rent as trivially "paid" with no special-casing needed. During a
// tenant's first period, "rent" here is their prorated first_period_rent_
// amount when one was set (see schema.sql) — every period after that,
// firstPeriodAmount is always null and this falls back to the flat rate.
// addonTotal (sum of quantity * monthly_price across the tenant's applied
// property_addons) is added on top unconditionally — addons are always
// flat monthly, never prorated, regardless of which period this is.
function computePaymentStatus(rentAmount, paidAmount, firstPeriodAmount, addonTotal = 0) {
  const rent = firstPeriodAmount != null ? Number(firstPeriodAmount) : Number(rentAmount) || 0;
  const total = rent + (Number(addonTotal) || 0);
  const paid = Number(paidAmount) || 0;
  if (paid >= total) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
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
         COALESCE(rp.paid_amount, 0) AS current_period_paid,
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
         SELECT SUM(amount) AS paid_amount
         FROM rent_payments rp2
         WHERE rp2.tenant_id = t.id AND rp2.period_covered = $2
       ) rp ON true
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
      [req.businessId, currentPeriod()]
    );

    res.json(
      rows.map((row) => {
        let inspectionStatus = "none";
        if (row.inspection_row_status === "draft") inspectionStatus = "draft";
        else if (row.inspection_row_status === "finalized") {
          inspectionStatus = row.inspection_signed_at ? "signed" : "pending_signature";
        }
        const { inspection_row_status, ...rest } = row;
        const isFirstPeriod = row.tenant_id && row.lease_start && periodOf(row.lease_start) === currentPeriod();
        return {
          ...rest,
          addons: row.addons || [],
          status: row.tenant_id ? computeStatus(row.lease_end) : "vacant",
          payment_status: row.tenant_id
            ? computePaymentStatus(
                row.rent_amount,
                row.current_period_paid,
                isFirstPeriod ? row.first_period_rent_amount : null,
                row.addon_total
              )
            : null,
          inspection_status: row.tenant_id ? inspectionStatus : null,
        };
      })
    );
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

      if (firstPayment) {
        await client.query(
          `INSERT INTO rent_payments (business_id, tenant_id, amount, payment_date, method, period_covered, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
