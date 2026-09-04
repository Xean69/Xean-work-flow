import pool from "../db.js";
import { ApiError } from "../utils/errors.js";

// Shared by the manager and staff "propose a reschedule" routes — the only
// place other than a bug fix where genuinely identical logic is called from
// two different routers, so a dedicated helper is worth it here even though
// most small logic in this codebase stays duplicated per-route.
//
// Locks the ticket row first so two near-simultaneous proposals (manager and
// staff both acting within the same second) can't each see "no pending
// proposal" and insert one — the second call's INSERT would still hit
// idx_maintenance_reschedules_one_pending if this lock weren't here, but
// failing with a clean "someone just proposed a date" retry is better than
// depending on that being the ONLY thing standing between us and a race.
export async function proposeReschedule({
  requestId,
  businessId,
  proposedBy,
  staffId,
  proposedDate,
  proposedTimeWindow,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: ticketRows } = await client.query(
      `SELECT id FROM maintenance_requests
       WHERE id = $1 AND business_id = $2 AND status IN ('new', 'in_progress')
       FOR UPDATE`,
      [requestId, businessId]
    );
    if (!ticketRows[0]) throw new ApiError(404, "Ticket not found");

    // Superseding, not erroring — a manager or staff member changing their
    // mind about a date before the tenant has responded shouldn't be a dead
    // end; the old proposal just becomes visible history instead.
    await client.query(
      "UPDATE maintenance_reschedules SET status = 'cancelled' WHERE request_id = $1 AND status = 'pending'",
      [requestId]
    );

    const { rows } = await client.query(
      `INSERT INTO maintenance_reschedules
         (business_id, request_id, proposed_by, staff_id, proposed_date, proposed_time_window)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, requestId, proposedBy, staffId, proposedDate, proposedTimeWindow]
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Guard idiom copied from the lease-sign route (`... AND signed_at IS
// NULL`) — the WHERE clause is what makes this safe to call twice (a
// double-click, a retried request) without double-processing.
//
// Approving bumps the ticket's SLA clock to the *proposed date itself*, not
// to now() — a visit booked 10 days out shouldn't start racking up warning
// days before the technician has even had a chance to show up. Declining
// touches nothing else: nothing was actually agreed, so the ticket keeps
// escalating on whatever clock it already had.
export async function respondToReschedule({ requestId, tenantId, decision }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE maintenance_reschedules
       SET status = $1, responded_at = now()
       WHERE request_id = $2
         AND status = 'pending'
         AND responded_at IS NULL
         AND EXISTS (SELECT 1 FROM maintenance_requests WHERE id = $2 AND tenant_id = $3)
       RETURNING *`,
      [decision, requestId, tenantId]
    );
    if (!rows[0]) throw new ApiError(404, "No pending reschedule proposal found");

    if (decision === "approved") {
      await client.query(
        "UPDATE maintenance_requests SET sla_clock_started_at = $1::timestamptz WHERE id = $2",
        [rows[0].proposed_date, requestId]
      );
    }

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The follow-up step after approval — re-asks the same entry_permission
// question the ticket was created with, but scoped to this one reschedule
// row so the previous answer (on an earlier reschedule, or the original
// report) stays visible in history instead of being overwritten silently.
// maintenance_requests.entry_permission/entry_date — the "current" value
// every existing view (staff ticket detail, portal, manager card) already
// reads — gets updated too, deliberately, so nothing else in the app needs
// to change to show the latest answer.
export async function answerRescheduleEntryPermission({ requestId, tenantId, entryPermission, entryDate }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE maintenance_reschedules
       SET entry_permission = $1, entry_date = $2
       WHERE request_id = $3
         AND status = 'approved'
         AND entry_permission IS NULL
         AND EXISTS (SELECT 1 FROM maintenance_requests WHERE id = $3 AND tenant_id = $4)
       RETURNING *`,
      [entryPermission, entryDate, requestId, tenantId]
    );
    if (!rows[0]) throw new ApiError(404, "No approved reschedule awaiting an entry-permission answer");

    await client.query(
      "UPDATE maintenance_requests SET entry_permission = $1, entry_date = $2 WHERE id = $3",
      [entryPermission, entryDate, requestId]
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
