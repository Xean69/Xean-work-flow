import { ApiError } from "./errors.js";

// "YYYY-MM" for the current calendar month — the same shape
// rent_payments.period_covered and <input type="month"> both use, so a
// payment's period can be compared directly against this with no parsing.
export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// "YYYY-MM" -> the calendar-day range that month spans, for a date-overlap
// or BETWEEN query.
export function parsePeriod(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new ApiError(400, "period must be in YYYY-MM format");
  }
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) throw new ApiError(400, "period must be between 01 and 12");

  const start = `${value}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this one
  const end = `${value}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: value };
}
