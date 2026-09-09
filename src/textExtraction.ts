import { lookupAirport } from "./airportLookup.js";
import { parseFreeTextDate } from "./dateParsing.js";
import type { RecognizedTextLine, TicketField, TicketFields } from "./types.js";

/**
 * Free-text extraction for documents with no decodable barcode (booking
 * confirmations/itineraries, or a barcode-bearing boarding pass whose barcode didn't
 * decode). Ticket layouts are effectively unbounded across issuers — per the
 * lessons-learned doc, this is a starting-point regex/label matcher meant to be grown
 * from real bug reports and their exact OCR lines, not a general-purpose ticket parser.
 * Every extracted value is shape-validated (a route needs two table-known airport
 * codes, a date must be calendar-valid) — an unresolved field is left absent rather
 * than filled with a guess.
 */

const ROUTE_PATTERN = /\b([A-Z]{3})\b\s*(?:-|–|—|>|→|➔|\/|\bto\b)\s*\b([A-Z]{3})\b/i;

const DEPARTURE_LABEL = /\b(depart(?:ure|ing)?|outbound|onward)\b/i;
const RETURN_LABEL = /\b(return(?:ing)?|inbound|arriving back)\b/i;
const ADULTS_PATTERN = /\b(\d+)\s*(?:adults?|adt)\b/i;
const CHILDREN_PATTERN = /\b(\d+)\s*(?:child(?:ren)?|chd)\b/i;

function findDateNear(lines: RecognizedTextLine[], labelIndex: number, referenceDate: Date): string | null {
  for (let i = labelIndex; i < Math.min(lines.length, labelIndex + 3); i++) {
    const date = parseFreeTextDate(lines[i].text, referenceDate);
    if (date) return date;
  }
  return null;
}

export interface OcrExtractedFields {
  originAirport?: string;
  destinationAirport?: string;
  departureDate?: TicketField<string>;
  returnDate?: TicketField<string>;
  adults?: TicketField<number>;
  children?: TicketField<number>;
}

export function extractFieldsFromOcrLines(lines: RecognizedTextLine[], referenceDate: Date = new Date()): OcrExtractedFields {
  const result: OcrExtractedFields = {};

  // Route: first line whose two candidate 3-letter codes are both recognized airports.
  for (const line of lines) {
    const match = line.text.match(ROUTE_PATTERN);
    if (!match) continue;
    const from = lookupAirport(match[1]);
    const to = lookupAirport(match[2]);
    if (from && to) {
      result.originAirport = match[1].toUpperCase();
      result.destinationAirport = match[2].toUpperCase();
      break;
    }
  }

  // Labeled dates.
  let departureDate: string | null = null;
  let returnDate: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!departureDate && DEPARTURE_LABEL.test(lines[i].text)) departureDate = findDateNear(lines, i, referenceDate);
    if (!returnDate && RETURN_LABEL.test(lines[i].text)) returnDate = findDateNear(lines, i, referenceDate);
  }

  if (departureDate) {
    result.departureDate = { value: departureDate, confidence: 0.85, source: "ocr" };
  }
  if (returnDate) {
    result.returnDate = { value: returnDate, confidence: 0.85, source: "ocr" };
  }

  // Fallback when neither date carried an explicit label: if the document contains
  // exactly one or two distinct calendar-valid dates overall, assume chronological
  // order (earliest = departure, latest = return) at reduced confidence. Three or more
  // unlabeled dates is too ambiguous to guess from — left unresolved.
  if (!departureDate) {
    const uniqueDates = Array.from(new Set(lines.map((l) => parseFreeTextDate(l.text, referenceDate)).filter((d): d is string => d !== null))).sort();
    if (uniqueDates.length === 1) {
      result.departureDate = { value: uniqueDates[0], confidence: 0.6, source: "ocr" };
    } else if (uniqueDates.length === 2) {
      result.departureDate = { value: uniqueDates[0], confidence: 0.55, source: "ocr" };
      if (!returnDate) result.returnDate = { value: uniqueDates[1], confidence: 0.55, source: "ocr" };
    }
  }

  for (const line of lines) {
    const adultsMatch = line.text.match(ADULTS_PATTERN);
    if (adultsMatch && !result.adults) {
      result.adults = { value: Number(adultsMatch[1]), confidence: 0.8, source: "ocr" };
    }
    const childrenMatch = line.text.match(CHILDREN_PATTERN);
    if (childrenMatch && !result.children) {
      result.children = { value: Number(childrenMatch[1]), confidence: 0.8, source: "ocr" };
    }
  }

  return result;
}

/** Derives tripType by comparing resolved origin/destination countries — never read from an on-ticket label. */
export function deriveTripType(fields: TicketFields): TicketFields["tripType"] {
  const origin = fields.originCountry?.value;
  const destination = fields.destinationCountry?.value;
  if (!origin || !destination) return undefined;

  const value = origin.toLowerCase() === destination.toLowerCase() ? "DOMESTIC" : "INTERNATIONAL";
  const confidence = Math.min(fields.originCountry!.confidence, fields.destinationCountry!.confidence);
  return { value, confidence, source: "derived" };
}
