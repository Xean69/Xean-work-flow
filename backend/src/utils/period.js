import { ApiError } from "./errors.js";

// Reads a moment's wall-clock year/month/day AS OBSERVED in an arbitrary
// IANA timezone — the building block every function below is based on.
// 'en-CA' is just a convenient locale whose numeric fields formatToParts
// labels the same way regardless of locale quirks; only the labeled parts
// are read, never a locale-dependent string shape. This is the standard,
// dependency-free way to ask "what date/time is it right now, in Chicago"
// without a timezone library — Node's built-in Intl already fully
// supports arbitrary IANA zones (the same mechanism the DATE-column display
// fix elsewhere in this app already relies on for the 'UTC' case
// specifically; this generalizes that to any zone).
function partsInTimezone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// "YYYY-MM" for the calendar month current *in the given timezone* right
// now — deliberately requires a real timezone argument every time (no
// implicit server-clock default) so a call site can never silently fall
// back to the wrong business's notion of "today" by omission. Pass a
// business's own businesses.timezone for anything business-scoped; there
// is no bare no-argument version of this on purpose.
export function currentPeriodInTimezone(timezone) {
  const { year, month } = partsInTimezone(timezone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

// True only on the last calendar day of the month, as observed in the
// given timezone — e.g. if it's already the 1st in Sydney but still the
// 30th in Los Angeles, this correctly disagrees between the two zones for
// the same real-world instant. Once the wall-clock date is read for a
// specific zone, "add one day and see if the month rolled over" is pure
// calendar arithmetic with no further timezone meaning attached to it —
// the same "day 0 of next month" trick parsePeriod already uses below.
export function isLastDayOfMonthInTimezone(timezone) {
  const { year, month, day } = partsInTimezone(timezone);
  return new Date(year, month - 1, day + 1).getDate() === 1;
}

// "YYYY-MM" -> the following month's "YYYY-MM" — used to bill the upcoming
// period a day in advance (see scheduler.js) and to walk forward one period
// at a time when backfilling a tenant's charge history.
export function nextPeriod(period) {
  const [year, month] = period.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
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
