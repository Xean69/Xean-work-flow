import pool from "../db.js";

// ownerColumn is always a hardcoded literal from trusted route code
// ("admin_id" | "tenant_id" | "staff_id"), never derived from a request —
// column names can't be parameterized in pg, so this guards against a
// typo'd call site rather than injection from outside.
const OWNER_COLUMNS = ["admin_id", "tenant_id", "staff_id"];

function assertOwnerColumn(ownerColumn) {
  if (!OWNER_COLUMNS.includes(ownerColumn)) {
    throw new Error(`Invalid push subscription owner column: ${ownerColumn}`);
  }
}

// Upserts on (endpoint, ownerColumn) — the composite partial unique index
// schema.sql defines per owner column, matched exactly here as the
// ON CONFLICT target — so the same browser subscribing under two different
// identities (e.g. an owner who's also assigned as staff) correctly ends
// up with two rows, one per identity, instead of one overwriting the other.
export async function upsertSubscription({ businessId, ownerColumn, ownerId, subscription }) {
  assertOwnerColumn(ownerColumn);
  await pool.query(
    `INSERT INTO push_subscriptions (business_id, ${ownerColumn}, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint, ${ownerColumn}) WHERE endpoint IS NOT NULL AND ${ownerColumn} IS NOT NULL
     DO UPDATE SET last_seen_at = now(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [businessId, ownerId, subscription.endpoint, subscription.keys?.p256dh, subscription.keys?.auth]
  );
}

export async function deleteSubscription({ ownerColumn, ownerId, endpoint }) {
  assertOwnerColumn(ownerColumn);
  await pool.query(`DELETE FROM push_subscriptions WHERE ${ownerColumn} = $1 AND endpoint = $2`, [
    ownerId,
    endpoint,
  ]);
}
