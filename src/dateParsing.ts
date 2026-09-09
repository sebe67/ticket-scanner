function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** True calendar-date validity check (rejects e.g. day 31 for April, or Feb 29 outside a leap year). */
function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * BCBP encodes a flight date as a 3-digit day-of-year (1-366) with no year at all — the
 * format simply doesn't carry one. The standard way real-world BCBP validators recover a
 * year is to pick whichever of {referenceYear-1, referenceYear, referenceYear+1} places
 * that day-of-year closest to "now": a boarding pass is scanned within about a year of
 * the flight, either shortly before travel or as a kept souvenir shortly after, never
 * across a multi-year gap.
 */
export function resolveBcbpJulianDate(dayOfYear: number, referenceDate: Date = new Date()): string | null {
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;

  const refYear = referenceDate.getUTCFullYear();
  let best: { date: Date; diffMs: number } | null = null;

  for (const year of [refYear - 1, refYear, refYear + 1]) {
    const jan1 = Date.UTC(year, 0, 1);
    const candidate = new Date(jan1 + (dayOfYear - 1) * 86400000);
    // day-of-year 366 only exists for leap years; reject it landing in January of the next year.
    if (candidate.getUTCFullYear() !== year) continue;

    const diffMs = Math.abs(candidate.getTime() - referenceDate.getTime());
    if (!best || diffMs < best.diffMs) best = { date: candidate, diffMs };
  }

  if (!best) return null;
  return toIsoDate(best.date.getUTCFullYear(), best.date.getUTCMonth() + 1, best.date.getUTCDate());
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function fullYear(y: number): number {
  if (y >= 100) return y;
  // Two-digit year on a travel document: assume the 2000s (no ticket in this system predates it).
  return 2000 + y;
}

/**
 * Parses one free-text date out of OCR'd ticket text into ISO YYYY-MM-DD, or null if no
 * recognizable, calendar-valid date is present. Tries the formats actually seen on
 * e-tickets/itineraries: "12 SEP 2026", "SEP 12, 2026", "2026-09-12", "09/12/2026" and
 * "12/09/2026" (the numeric-slash case is inherently ambiguous between
 * month-first/day-first; both orderings are tried and only kept if exactly one parses to
 * a valid calendar date, otherwise it's rejected as ambiguous rather than guessed).
 */
export function parseFreeTextDate(text: string): string | null {
  const t = text.trim();

  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso.map(Number) as unknown as [number, number, number, number];
    return isValidCalendarDate(y, m, d) ? toIsoDate(y, m, d) : null;
  }

  const dayMonthYear = t.match(/\b(\d{1,2})[\s-]?([A-Za-z]{3,9})[\s,.-]+(\d{2,4})\b/);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = MONTHS[dayMonthYear[2].toLowerCase()];
    const year = fullYear(Number(dayMonthYear[3]));
    if (month && isValidCalendarDate(year, month, day)) return toIsoDate(year, month, day);
  }

  const monthDayYear = t.match(/\b([A-Za-z]{3,9})[\s.-]+(\d{1,2})[\s,.-]+(\d{2,4})\b/);
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1].toLowerCase()];
    const day = Number(monthDayYear[2]);
    const year = fullYear(Number(monthDayYear[3]));
    if (month && isValidCalendarDate(year, month, day)) return toIsoDate(year, month, day);
  }

  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = fullYear(Number(slash[3]));
    const asMonthFirst = isValidCalendarDate(year, a, b);
    const asDayFirst = isValidCalendarDate(year, b, a);
    // Only trust it when the two readings agree, or exactly one of them is even possible
    // (e.g. "14" can't be a month, so day-first is unambiguous) — otherwise it's a
    // genuinely ambiguous date and no value beats a possibly-wrong one.
    if (asMonthFirst && asDayFirst && a === b) return toIsoDate(year, a, b);
    if (asMonthFirst && !asDayFirst) return toIsoDate(year, a, b);
    if (asDayFirst && !asMonthFirst) return toIsoDate(year, b, a);
    return null;
  }

  return null;
}
