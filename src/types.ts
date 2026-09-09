/** One recognized text line, in original-image pixel coordinates. */
export interface RecognizedTextLine {
  text: string;
  confidence: number;
  boundingBox: [number, number, number, number];
}

export type FieldSource = "barcode" | "ocr" | "derived";

export interface TicketField<T> {
  value: T;
  confidence: number;
  source: FieldSource;
}

/**
 * The exact field set requested for the insurance-eligibility use case — deliberately
 * not a general "digitize the whole ticket" schema. A field is omitted entirely (not
 * present as a key) when nothing found a value for it: "no value is better than a wrong
 * value" — a downstream eligibility check must never silently treat a guess as a fact.
 */
export interface TicketFields {
  /** Full country name (e.g. "Philippines"), resolved from the departure airport's IATA code. */
  originCountry?: TicketField<string>;
  /** Full country name, resolved from the arrival airport's IATA code. */
  destinationCountry?: TicketField<string>;
  /** ISO 8601 date (YYYY-MM-DD). */
  departureDate?: TicketField<string>;
  /** ISO 8601 date (YYYY-MM-DD). Present only for a round-trip itinerary. */
  returnDate?: TicketField<string>;
  adults?: TicketField<number>;
  children?: TicketField<number>;
  /**
   * Derived by comparing originCountry/destinationCountry once both are known — not
   * read from an on-ticket label. Absent if either country is unresolved.
   */
  tripType?: TicketField<"DOMESTIC" | "INTERNATIONAL">;
}

export interface TicketScanProvenance {
  inputKind: "image" | "pdf";
  barcodeFound: boolean;
  barcodeFormat?: string;
  imageHash: string;
  engineVersion: string;
  /** Full OCR text, newline-joined in reading order — kept for debugging/regression fixtures, not returned to callers who don't ask for it. */
  rawOcrText?: string;
}

/** A decoded barcode/QR symbol, before (or in place of) a successful BCBP parse. */
export interface DecodedBarcode {
  text: string;
  format: string;
}

/**
 * The exact raw material a regression fixture needs to reproduce a real report without
 * re-running the OCR/barcode models: every recognized text line and every decoded
 * barcode symbol from one page, in the shape `extractFieldsFromOcrLines`/`parseBcbp`
 * consume directly. See fixtures/README.md for the capture workflow.
 */
export interface TicketScanPageDebugInfo {
  lines: RecognizedTextLine[];
  barcodes: DecodedBarcode[];
}

export interface TicketScanResult {
  fields: TicketFields;
  provenance: TicketScanProvenance;
  /** Present only when `ScanTicketOptions.includeDebugInfo` is set — one entry per page. */
  debug?: TicketScanPageDebugInfo[];
}
