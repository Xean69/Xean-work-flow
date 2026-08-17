import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const FEED_LIMIT = 18;
// How many rows each category contributes before the combined list gets
// trimmed to FEED_LIMIT — bounds the work per category without needing to
// know in advance which ones will actually make the final cut.
const PER_CATEGORY_LIMIT = 20;

// Each category is its own SELECT producing (ts, dot, text), unioned
// together below. `roles` is which roles get this category at all — an
// accountant's business_id is the same as everyone else's on their team,
// so the boundary that matters here is category, not row-level business
// scoping (every branch already filters WHERE business_id = $1).
const CATEGORIES = [
  {
    // One event per tenant row: "added" if it's never been touched since
    // creation (updated_at still equals created_at), "updated" once it
    // has been — see schema.sql's note on why updated_at exists at all.
    roles: ["owner", "manager"],
    sql: `
      SELECT
        t.updated_at AS ts,
        'blue' AS dot,
        CASE WHEN t.updated_at > t.created_at
          THEN 'Tenant updated: ' || t.full_name || ' — ' || p.name || ' ' || u.unit_number
          ELSE 'New tenant added: ' || t.full_name || ' — ' || p.name || ' ' || u.unit_number
        END AS text
      FROM tenants t
      JOIN units u ON u.id = t.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE t.business_id = $1
      ORDER BY t.updated_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    roles: ["owner", "manager"],
    sql: `
      SELECT
        m.created_at AS ts,
        'amber' AS dot,
        'New maintenance request: ' || m.title || ' — ' || p.name || ' ' || u.unit_number AS text
      FROM maintenance_requests m
      JOIN units u ON u.id = m.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE m.business_id = $1
      ORDER BY m.created_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    // Separate from "created" above since resolved_at is the one status
    // transition this table actually timestamps (see routes/
    // maintenance.js) — there's no generic updated_at to detect every
    // possible status change with.
    roles: ["owner", "manager"],
    sql: `
      SELECT
        m.resolved_at AS ts,
        'green' AS dot,
        'Maintenance resolved: ' || m.title || ' — ' || p.name || ' ' || u.unit_number AS text
      FROM maintenance_requests m
      JOIN units u ON u.id = m.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE m.business_id = $1 AND m.resolved_at IS NOT NULL
      ORDER BY m.resolved_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    roles: ["owner", "manager", "accountant"],
    sql: `
      SELECT
        d.uploaded_at AS ts,
        'blue' AS dot,
        'Document uploaded: ' || d.file_name || COALESCE(' — ' || p.name, '') AS text
      FROM documents d
      LEFT JOIN properties p ON p.id = d.property_id
      WHERE d.business_id = $1
      ORDER BY d.uploaded_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    roles: ["owner", "manager", "accountant"],
    sql: `
      SELECT
        e.created_at AS ts,
        'blue' AS dot,
        'Expense logged: $' || to_char(e.amount, 'FM999,999,990.00') || ' — ' || e.vendor_name
          || COALESCE(' (' || p.name || ')', '') AS text
      FROM expenses e
      LEFT JOIN properties p ON p.id = e.property_id
      WHERE e.business_id = $1
      ORDER BY e.created_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    // Only rows whose turnover_status has actually moved since creation
    // (see stays.js's PUT handler) — a freshly booked stay hasn't "changed"
    // turnover yet, it's just sitting at its initial state.
    roles: ["owner", "manager"],
    sql: `
      SELECT
        s.updated_at AS ts,
        CASE WHEN s.turnover_status = 'checkin_ready' THEN 'green' ELSE 'blue' END AS dot,
        'Turnover updated: ' || s.guest_name || ' — ' || p.name || ' ' || u.unit_number || ' → ' ||
          CASE s.turnover_status
            WHEN 'checkout_done' THEN 'checkout done'
            WHEN 'inspection_done' THEN 'inspection done'
            WHEN 'cleaning_done' THEN 'cleaning done'
            WHEN 'checkin_ready' THEN 'ready for check-in'
          END AS text
      FROM stays s
      JOIN units u ON u.id = s.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE s.business_id = $1 AND s.updated_at > s.created_at
      ORDER BY s.updated_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
  {
    // A renewal is a new str_licenses row (see routes/strLicenses.js), so
    // created_at alone already distinguishes "first issued" from every
    // later renewal without needing an updated_at here too.
    roles: ["owner", "manager"],
    sql: `
      SELECT
        l.created_at AS ts,
        'green' AS dot,
        'STR license renewed: ' || l.license_number || ' — ' || p.name AS text
      FROM str_licenses l
      JOIN properties p ON p.id = l.property_id
      WHERE l.business_id = $1
      ORDER BY l.created_at DESC
      LIMIT ${PER_CATEGORY_LIMIT}
    `,
  },
];

// GET /api/activity - a combined, chronologically-sorted feed across the
// business's data, scoped both by business_id (every branch) and by which
// categories the requesting role is allowed to see at all (an accountant
// only gets documents/expenses — never even queries the rest).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const allowed = CATEGORIES.filter((c) => c.roles.includes(req.role));
    const combinedSql = `
      SELECT * FROM (
        ${allowed.map((c) => `(${c.sql})`).join(" UNION ALL ")}
      ) combined
      ORDER BY ts DESC
      LIMIT ${FEED_LIMIT}
    `;
    const { rows } = await pool.query(combinedSql, [req.businessId]);
    res.json(rows.map((r) => ({ text: r.text, dot: r.dot, timestamp: r.ts })));
  })
);

export default router;
