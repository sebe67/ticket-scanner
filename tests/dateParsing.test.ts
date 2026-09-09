import assert from "node:assert/strict";
import test from "node:test";
import { parseFreeTextDate, resolveBcbpJulianDate } from "../src/dateParsing.js";

test("resolveBcbpJulianDate picks the year closest to the reference date", () => {
  // Day 250 of a non-leap year is Sep 7. Reference date right before it in the same year.
  const reference = new Date(Date.UTC(2026, 7, 15)); // Aug 15 2026
  assert.equal(resolveBcbpJulianDate(250, reference), "2026-09-07");
});

test("resolveBcbpJulianDate rolls forward into next year when closer", () => {
  // Reference late Dec 2026; day 5 of the year is much closer to Jan 2027 than Jan 2026.
  const reference = new Date(Date.UTC(2026, 11, 28)); // Dec 28 2026
  assert.equal(resolveBcbpJulianDate(5, reference), "2027-01-05");
});

test("resolveBcbpJulianDate rejects out-of-range day numbers", () => {
  assert.equal(resolveBcbpJulianDate(0), null);
  assert.equal(resolveBcbpJulianDate(367), null);
});

test("parseFreeTextDate handles ISO dates", () => {
  assert.equal(parseFreeTextDate("Departure: 2026-09-12"), "2026-09-12");
});

test("parseFreeTextDate handles 'DD MMM YYYY'", () => {
  assert.equal(parseFreeTextDate("12 SEP 2026"), "2026-09-12");
  assert.equal(parseFreeTextDate("12-Sep-2026"), "2026-09-12");
});

test("parseFreeTextDate handles 'MMM DD, YYYY'", () => {
  assert.equal(parseFreeTextDate("Sep 12, 2026"), "2026-09-12");
});

test("parseFreeTextDate rejects a calendar-invalid date rather than guessing", () => {
  assert.equal(parseFreeTextDate("31 FEB 2026"), null);
});

test("parseFreeTextDate resolves an unambiguous slash date (day > 12)", () => {
  assert.equal(parseFreeTextDate("14/09/2026"), "2026-09-14");
});

test("parseFreeTextDate rejects a genuinely ambiguous slash date rather than guessing an order", () => {
  // Both 09/10/2026 (Sep 10) and 10/09/2026-reading (Oct 9) are calendar-valid; no way to tell which was meant.
  assert.equal(parseFreeTextDate("09/10/2026"), null);
});

test("parseFreeTextDate returns null when no date is present", () => {
  assert.equal(parseFreeTextDate("BOARDING PASS"), null);
});
