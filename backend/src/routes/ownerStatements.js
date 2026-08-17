import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";

const router = Router();

function currentMonthParam() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// "YYYY-MM" (what <input type="month"> sends) -> the calendar-day range
// that month actually spans, for a lease/expense-date overlap check.
function parseMonthParam(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) throw new ApiError(400, "month must be between 01 and 12");

  const start = `${value}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this one
  const end = `${value}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: value };
}

// GET /api/owner-statements?month=YYYY-MM
//
// Rent collected is a stand-in for real payment tracking (which doesn't
// exist yet): a tenant counts as having paid rent for the month if their
// lease overlaps it at all, no proration for a lease starting/ending
// mid-month. Expenses are real — summed straight from what's on file for
// that property and month. Everything is computed live from existing
// data on every request; nothing is stored, so there's no separate
// "generate" step.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const month = parseMonthParam(req.query.month || currentMonthParam());

    const { rows: properties } = await pool.query(
      "SELECT id, name FROM properties WHERE business_id = $1 ORDER BY name",
      [req.businessId]
    );

    // Two separate aggregate queries, merged below, rather than one query
    // joining units+tenants+expenses together — that join would fan out
    // (every tenant row paired with every expense row for the same
    // property) and double-count both sums.
    const { rows: rentRows } = await pool.query(
      `SELECT u.property_id, COALESCE(SUM(t.rent_amount), 0) AS rent_collected
       FROM tenants t
       JOIN units u ON u.id = t.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.business_id = $1
         AND t.lease_start <= $3
         AND t.lease_end >= $2
       GROUP BY u.property_id`,
      [req.businessId, month.start, month.end]
    );

    const { rows: expenseRows } = await pool.query(
      `SELECT property_id, COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY property_id`,
      [req.businessId, month.start, month.end]
    );

    const rentByProperty = new Map(rentRows.map((r) => [r.property_id, Number(r.rent_collected)]));
    const expensesByProperty = new Map();
    let unattributedExpenses = 0;
    for (const row of expenseRows) {
      if (row.property_id == null) unattributedExpenses += Number(row.total);
      else expensesByProperty.set(row.property_id, Number(row.total));
    }

    const propertyStatements = properties.map((p) => {
      const rentCollected = rentByProperty.get(p.id) ?? 0;
      const expenses = expensesByProperty.get(p.id) ?? 0;
      return {
        property_id: p.id,
        property_name: p.name,
        rent_collected: rentCollected,
        expenses,
        net_payout: rentCollected - expenses,
      };
    });

    const totalRent = propertyStatements.reduce((sum, p) => sum + p.rent_collected, 0);
    // Includes expenses logged without a property attached — a real cost
    // the business had that month, just not one any single property's
    // row can show.
    const totalExpenses = propertyStatements.reduce((sum, p) => sum + p.expenses, 0) + unattributedExpenses;

    res.json({
      period: month.label,
      totals: {
        rent_collected: totalRent,
        expenses: totalExpenses,
        net_payout: totalRent - totalExpenses,
      },
      unattributed_expenses: unattributedExpenses,
      properties: propertyStatements,
    });
  })
);

export default router;
