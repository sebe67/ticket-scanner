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
  // "THE - AND" looks like a route but neither triplet is a known IATA code.
  const result = extractFieldsFromOcrLines([line("THE - AND")]);
  assert.equal(result.originAirport, undefined);
  assert.equal(result.destinationAirport, undefined);
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

test("falls back to chronological order for exactly two unlabeled dates, at lower confidence", () => {
  const result = extractFieldsFromOcrLines([line("2026-09-20"), line("2026-09-12")]);
  assert.equal(result.departureDate?.value, "2026-09-12");
  assert.equal(result.returnDate?.value, "2026-09-20");
  assert.ok(result.departureDate!.confidence < 0.85);
});

test("does not guess when three or more unlabeled dates are present", () => {
  const result = extractFieldsFromOcrLines([line("2026-09-01"), line("2026-09-12"), line("2026-09-20")]);
  assert.equal(result.departureDate, undefined);
  assert.equal(result.returnDate, undefined);
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
