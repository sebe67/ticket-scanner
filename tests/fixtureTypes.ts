import type { RecognizedTextLine } from "../src/types.js";

/**
 * A regression fixture captured from a real reported ticket, per fixtures/README.md.
 * Two capture modes because the OCR-text path and the barcode path are tested against
 * different pure functions (`extractFieldsFromOcrLines` vs. `parseBcbp` +
 * `resolveBcbpJulianDate`) — a fixture only ever exercises the one that was actually
 * wrong in the report.
 */
export type TicketFixture = OcrLinesFixture | BarcodeFixture;

export interface OcrLinesFixture {
  kind: "ocrLines";
  /** What was wrong and what this fixture locks in — written for a future reader, not just the reporter. */
  description: string;
  /** `TicketScanResult.provenance.engineVersion` from the run that produced this report, for traceability. */
  reportedEngineVersion?: string;
  /** Exactly the `RecognizedTextLine[]` for one page, captured via `scanTicket(input, { includeDebugInfo: true })`. */
  lines: RecognizedTextLine[];
  /** Only the fields this fixture is actually asserting — omit any field the report didn't concern. */
  expected: {
    originAirport?: string;
    destinationAirport?: string;
    departureDate?: string;
    returnDate?: string;
    adults?: number;
    children?: number;
  };
}

export interface BarcodeFixture {
  kind: "barcode";
  description: string;
  reportedEngineVersion?: string;
  /** The raw decoded barcode payload text, captured via `scanTicket(input, { includeDebugInfo: true })`. */
  barcodeText: string;
  /**
   * ISO instant the ticket was actually scanned/reported at. Required whenever
   * `expected.departureDate` is set: BCBP's day-of-year has no year, so
   * `resolveBcbpJulianDate` infers one from "now" — pinning this instant is what makes
   * the fixture reproduce the same answer no matter when the test suite runs.
   */
  referenceDate?: string;
  expected: {
    fromAirport?: string;
    toAirport?: string;
    /** Only checked if `referenceDate` is also set. */
    departureDate?: string;
  };
}
