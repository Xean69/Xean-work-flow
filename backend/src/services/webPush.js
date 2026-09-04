import webpush from "web-push";
import pool from "../db.js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:hrsupport@xean.ca",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// The one place that ever calls webpush.sendNotification — never throws,
// same reasoning as email.js's sendEmail: a failed push can never block
// the action that triggered it. A 404/410 response is the push service's
// way of saying "this endpoint will never accept another message" (the
// browser unsubscribed, or the subscription simply expired), so that
// subscription row is deleted here rather than left to fail forever —
// mandatory and OTHER-category sends share this exact cleanup, they can
// never diverge in how a stale subscription gets pruned.
//
// Only 'web_push' rows are sendable today; 'apns'/'fcm' rows (once native
// push exists) are silently skipped here rather than erroring — this
// function's job is web push specifically, not routing by platform.
async function sendPushToSubscriptions(rows, payload) {
  const body = JSON.stringify(payload);
  await Promise.all(
    rows
      .filter((row) => row.platform === "web_push")
      .map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body
          );
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [row.id]);
            return;
          }
          console.error(`Push to subscription ${row.id} failed:`, err.statusCode || err);
        }
      })
  );
}

// role IN ('owner','manager') mirrors email.js's getManagerRecipients
// exactly — accountants get no maintenance emails today and shouldn't
// start getting maintenance pushes either. mandatory:true skips the
// push_notify_other check entirely; excludeAdminId keeps the specific
// acting admin from pushing themselves about their own action.
export async function pushToBusinessAdmins(businessId, payload, { mandatory = false, excludeAdminId = null } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN admins a ON a.id = ps.admin_id
       WHERE a.business_id = $1 AND a.role IN ('owner', 'manager')
         AND ($2::int IS NULL OR a.id != $2)
         AND ($3::boolean OR a.push_notify_other = true)`,
      [businessId, excludeAdminId, mandatory]
    );
    await sendPushToSubscriptions(rows, payload);
  } catch (err) {
    console.error("pushToBusinessAdmins failed:", err);
  }
}

export async function pushToTenant(tenantId, payload, { mandatory = false } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN tenants t ON t.id = ps.tenant_id
       WHERE t.id = $1 AND ($2::boolean OR t.push_notify_other = true)`,
      [tenantId, mandatory]
    );
    await sendPushToSubscriptions(rows, payload);
  } catch (err) {
    console.error("pushToTenant failed:", err);
  }
}

// A ticket has at most one assigned staff member, so this is always a
// single-recipient send — staffId null (unassigned) is a normal, silent
// no-op, not an error.
export async function pushToStaff(staffId, payload, { mandatory = false, excludeStaffId = null } = {}) {
  if (!staffId) return;
  try {
    const { rows } = await pool.query(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN maintenance_staff s ON s.id = ps.staff_id
       WHERE s.id = $1
         AND ($2::int IS NULL OR s.id != $2)
         AND ($3::boolean OR s.push_notify_other = true)`,
      [staffId, excludeStaffId, mandatory]
    );
    await sendPushToSubscriptions(rows, payload);
  } catch (err) {
    console.error("pushToStaff failed:", err);
  }
}
