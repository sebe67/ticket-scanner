import assert from "node:assert/strict";
import test from "node:test";
import { deriveTripType, extractFieldsFromOcrLines } from "../src/textExtraction.js";
import type { RecognizedTextLine } from "../src/types.js";

function line(text: string): RecognizedTextLine {
  return { text, confidence: 0.95, boundingBox: [0, 0, 100, 20] };
}

test("extracts a route from a known airport-code pair with a dash separator", () => {
  const result = extractFieldsFromOcrLines([line("Flight PR421  MNL - NRT")]);
  assert.equal(result.originAirport, "MNL");
  assert.equal(result.destinationAirport, "NRT");
});

test("ignores a route-shaped line whose codes aren't real airports", () => {
  // "ZZZ - QQQ" looks like a route but neither triplet is a known IATA code. Note this
  // is a narrower net than it sounds: with the full ~9,000-code IATA dataset (added in
  // 0.6.0), plenty of ordinary English words are real airport codes somewhere in the
  // world (e.g. "THE" is Teresina, Brazil; "AND" is Anderson, US) — this project accepts
  // that broader false-positive surface as the tradeoff for real global coverage, per
  // the lessons-learned doc's own warning about short/generic-word collisions; a real
  // false positive from this is exactly the kind of thing the fixtures/ workflow exists
  // to catch and fix.
  const result = extractFieldsFromOcrLines([line("ZZZ - QQQ")]);
  assert.equal(result.originAirport, undefined);
  assert.equal(result.destinationAirport, undefined);
});

test("extracts a route from OTA-style 'City (CODE) to City (CODE)' phrasing", () => {
  // Real report: the two codes aren't adjacent (a city name sits between them), so the
  // direct "CODE - CODE" pattern alone can't see this — needs the parenthesized-code path.
  const result = extractFieldsFromOcrLines([line("Johannesburg (JNB) to Cape Town (CPT)")]);
  assert.equal(result.originAirport, "JNB");
  assert.equal(result.destinationAirport, "CPT");
});

test("does not treat a line with more than two parenthesized codes as a route", () => {
  const result = extractFieldsFromOcrLines([line("Connects via (JNB), (CPT), and (DUR)")]);
  assert.equal(result.originAirport, undefined);
  assert.equal(result.destinationAirport, undefined);
});

test("extracts a route from two separate 'CODE- clock time' lines (real CheapOair layout)", () => {
  // Real report: each leg's code sits on its own line next to that leg's own clock
  // time ("YVR- 02:20 pm", "YCG-03:31pm") — never adjacent to the other code, never
  // parenthesized, so neither pattern above sees them. Document order decides which is origin.
  const result = extractFieldsFromOcrLines([
    line("Vancouver, British Columbia"),
    line("YVR- 02:20 pm"),
    line("Castlegar, British Columbia"),
    line("YCG-03:31pm"),
  ]);
  assert.equal(result.originAirport, "YVR");
  assert.equal(result.destinationAirport, "YCG");
});

test("does not guess a route from 'CODE near clock time' when more than two distinct codes appear", () => {
  const result = extractFieldsFromOcrLines([line("MNL- 02:20 pm"), line("NRT-03:31pm"), line("SFO-04:00pm")]);
  assert.equal(result.originAirport, undefined);
  assert.equal(result.destinationAirport, undefined);
});

test("extracts a route from two bare-code lines (real Asiana boarding-pass-exchange coupon layout)", () => {
  // Real report: FROM/TO is a wide table whose cells OCR emits as separate lines in an
  // inconsistent scan order — "MNL", a misrecognized arrow glyph, then "ICN" — nowhere
  // near a time or on the same line as each other, so none of the other three route
  // patterns can see them. Only a line with nothing else on it but the code counts.
  const result = extractFieldsFromOcrLines([
    line("FROM"),
    line("TO"),
    line("MNL"),
    line("ナ"),
    line("ICN"),
    line("12:05"),
  ]);
  assert.equal(result.originAirport, "MNL");
  assert.equal(result.destinationAirport, "ICN");
});

test("does not guess a route from bare-code lines when more than two distinct codes appear", () => {
  const result = extractFieldsFromOcrLines([line("MNL"), line("NRT"), line("SFO")]);
  assert.equal(result.originAirport, undefined);
  assert.equal(result.destinationAirport, undefined);
});

test("extracts a route mixing a bare-code line and a code-near-time line (real Singapore Airlines layout)", () => {
  // Real report: both legs are printed the same way (code next to its own time) --
  // OCR's text-box detection just grouped them inconsistently, putting "SIN"/"20:50"
  // on one line (needs the code-near-time check) but "MNL"/"17:05" on two separate
  // lines (needs the bare-code check). The two patterns each ran as a full pass over
  // the whole document, so each only ever found its one matching code and never
  // reached the "exactly two" threshold on its own. They're now checked per line and
  // merged into one candidate list, which doesn't care which way OCR split things.
  const result = extractFieldsFromOcrLines([line("MNL"), line("17:05"), line("SIN 20:50")]);
  assert.equal(result.originAirport, "MNL");
  assert.equal(result.destinationAirport, "SIN");
});

test("extracts a labeled departure date from the following line", () => {
  const result = extractFieldsFromOcrLines([line("Departure"), line("12 SEP 2026")]);
  assert.equal(result.departureDate?.value, "2026-09-12");
  assert.equal(result.departureDate?.source, "ocr");
});

test("extracts labeled departure and return dates independently", () => {
  const result = extractFieldsFromOcrLines([
    line("Outbound: 12 SEP 2026"),
    line("Return: 20 SEP 2026"),
  ]);
  assert.equal(result.departureDate?.value, "2026-09-12");
  assert.equal(result.returnDate?.value, "2026-09-20");
});

test("falls back to document order (first seen = departure) for exactly two unlabeled dates, at lower confidence", () => {
  // Deliberately out of chronological order — document order should still win, per the
  // real-world convention that the outbound leg is listed before the return leg (and
  // because comparing independently-year-inferred dates can disagree with itself across
  // a New Year's boundary; see the comment in textExtraction.ts).
  const result = extractFieldsFromOcrLines([line("2026-09-20"), line("2026-09-12")]);
  assert.equal(result.departureDate?.value, "2026-09-20");
  assert.equal(result.returnDate?.value, "2026-09-12");
  assert.ok(result.departureDate!.confidence < 0.85);
});

test("keeps document order (not resolved-value order) for two unlabeled yearless dates spanning New Year's", () => {
  // A real risk with inferring each date's year independently: scanned from just the
  // right (narrow) point in the middle of the year, "31 DEC" and "2 JAN" can both round
  // to the *same* calendar year (each is closer to that year than to neighboring ones),
  // which makes Jan 2 chronologically *earlier* than Dec 31 within that single resolved
  // year — even though Dec 31 was clearly listed first (the outbound leg) and Jan 2
  // second (the return). Sorting by resolved value would then swap them; document order
  // doesn't, because it never compares the two resolved values against each other.
  const reference = new Date("2026-07-02T12:00:00Z");
  const result = extractFieldsFromOcrLines([line("31 DEC"), line("2 JAN")], reference);
  assert.equal(result.departureDate?.value, "2026-12-31");
  assert.equal(result.returnDate?.value, "2026-01-02");
});

test("does not guess when three or more unlabeled dates are present", () => {
  const result = extractFieldsFromOcrLines([line("2026-09-01"), line("2026-09-12"), line("2026-09-20")]);
  assert.equal(result.departureDate, undefined);
  assert.equal(result.returnDate, undefined);
});

test("does not treat an overnight leg's own arrival date as a returnDate (real Singapore Airlines SIN-LHR report)", () => {
  // Real report: a single one-way overnight long-haul leg (depart SIN 23:25, land LHR
  // 05:55 the next calendar day) has the same shape as a genuine round trip -- two
  // unlabeled dates, one day apart -- and used to be wrongly assigned a "returnDate"
  // that was actually just the outbound leg's own arrival day. What distinguishes this
  // from a real round trip: the route is only ever mentioned once (never reversed, see
  // the JNB<->CPT fixture for what a real return leg's text looks like) and the
  // destination's own local time is earlier in the day than the origin's -- exactly
  // what crossing midnight means.
  const result = extractFieldsFromOcrLines([
    line("02 Jan (Sat)"),
    line("03 Jan (Sun)"),
    line("SIN 23:25"),
    line("LHR 05:55"),
  ]);
  assert.equal(result.originAirport, "SIN");
  assert.equal(result.destinationAirport, "LHR");
  assert.equal(result.departureDate?.value, "2027-01-02");
  assert.equal(result.returnDate, undefined);
});

test("still assigns a returnDate for two dates one day apart when the route's times don't cross midnight", () => {
  // Guards against the overnight-leg fix above being too broad: it must require all
  // three signals together (one day apart, AND both codes have a recorded time, AND
  // destination time earlier than origin time) rather than triggering on "one day
  // apart" alone. Here MNL departs 09:00 and NRT arrives 11:00 -- ordinary daytime
  // times, destination later than origin, not an overnight crossing -- so even though
  // the two dates are one day apart, the second one is a genuine returnDate.
  const result = extractFieldsFromOcrLines([line("MNL 09:00"), line("NRT 11:00"), line("2026-09-12"), line("2026-09-13")]);
  assert.equal(result.originAirport, "MNL");
  assert.equal(result.destinationAirport, "NRT");
  assert.equal(result.departureDate?.value, "2026-09-12");
  assert.equal(result.returnDate?.value, "2026-09-13");
});

test("extracts adult and children counts", () => {
  const result = extractFieldsFromOcrLines([line("Passengers: 2 Adults, 1 Child")]);
  assert.equal(result.adults?.value, 2);
  assert.equal(result.children?.value, 1);
});

test("deriveTripType returns INTERNATIONAL for differing countries", () => {
  const tripType = deriveTripType({
    originCountry: { value: "Philippines", confidence: 0.9, source: "barcode" },
    destinationCountry: { value: "Japan", confidence: 0.9, source: "barcode" },
  });
  assert.equal(tripType?.value, "INTERNATIONAL");
});

test("deriveTripType returns DOMESTIC for matching countries", () => {
  const tripType = deriveTripType({
    originCountry: { value: "Philippines", confidence: 0.9, source: "ocr" },
    destinationCountry: { value: "Philippines", confidence: 0.7, source: "ocr" },
  });
  assert.equal(tripType?.value, "DOMESTIC");
});

test("deriveTripType is undefined when either country is unresolved", () => {
  assert.equal(deriveTripType({ originCountry: { value: "Philippines", confidence: 0.9, source: "barcode" } }), undefined);
});
