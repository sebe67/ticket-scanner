/**
 * Parses the mandatory, fixed-offset portion of an IATA BCBP (Bar Coded Boarding Pass,
 * IATA Resolution 792) payload — the same text format regardless of which symbology
 * (PDF417, Aztec, QR) carries it. Only the "unique mandatory" 60-character header is
 * parsed: passenger name, e-ticket indicator, and the first flight leg's operating
 * carrier PNR, from/to airport, carrier, flight number, and Julian (day-of-year) date.
 *
 * Known limitation: BCBP supports additional legs beyond the first via variable-length
 * "conditional" data whose exact layout depends on which optional fields the issuer
 * chose to include — correctly skipping over it requires parsing those conditional
 * fields too, which this v1 parser doesn't attempt. A connecting itinerary encoded in
 * one barcode will only yield its first leg here; add conditional-field parsing (guided
 * by a real multi-leg barcode payload, per the reproduce-from-real-data workflow) if
 * that turns out to matter in practice.
 */
export interface BcbpLeg {
  operatingCarrierPnr: string;
  fromAirport: string;
  toAirport: string;
  operatingCarrier: string;
  flightNumber: string;
  /** Day of year (1-366), per the BCBP spec — the format carries no year at all. */
  julianDayOfYear: number;
  compartmentCode: string;
  seatNumber: string;
  checkInSequence: string;
  passengerStatus: string;
}

export interface BcbpData {
  formatCode: string;
  numberOfLegs: number;
  passengerName: string;
  electronicTicketIndicator: string;
  firstLeg: BcbpLeg;
}

const MANDATORY_HEADER_LENGTH = 60;

export function parseBcbp(raw: string): BcbpData | null {
  const text = raw.replace(/\r?\n$/, "");
  if (text.length < MANDATORY_HEADER_LENGTH) return null;

  const formatCode = text[0];
  if (formatCode !== "M") return null; // "M" is the only format code in real-world use

  const numberOfLegs = Number(text[1]);
  if (!Number.isInteger(numberOfLegs) || numberOfLegs < 1 || numberOfLegs > 9) return null;

  const passengerName = text.slice(2, 22).trim();
  const electronicTicketIndicator = text[22];

  const operatingCarrierPnr = text.slice(23, 30).trim();
  const fromAirport = text.slice(30, 33).trim().toUpperCase();
  const toAirport = text.slice(33, 36).trim().toUpperCase();
  const operatingCarrier = text.slice(36, 39).trim();
  const flightNumber = text.slice(39, 44).trim();
  const julianDayOfYear = Number(text.slice(44, 47));
  const compartmentCode = text[47];
  const seatNumber = text.slice(48, 52).trim();
  const checkInSequence = text.slice(52, 57).trim();
  const passengerStatus = text[57];

  if (!/^[A-Z]{3}$/.test(fromAirport) || !/^[A-Z]{3}$/.test(toAirport)) return null;
  if (!Number.isInteger(julianDayOfYear) || julianDayOfYear < 1 || julianDayOfYear > 366) return null;

  return {
    formatCode,
    numberOfLegs,
    passengerName,
    electronicTicketIndicator,
    firstLeg: {
      operatingCarrierPnr,
      fromAirport,
      toAirport,
      operatingCarrier,
      flightNumber,
      julianDayOfYear,
      compartmentCode,
      seatNumber,
      checkInSequence,
      passengerStatus,
    },
  };
}
