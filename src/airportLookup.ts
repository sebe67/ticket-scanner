import { AIRPORT_DATA } from "./airportData.js";

export interface AirportInfo {
  city: string;
  /** Full country name, matching the strings used elsewhere in this package (e.g. "Philippines"). */
  country: string;
}

/** Looks up an IATA airport code's city/country. Returns null for an unrecognized code — never a guess. */
export function lookupAirport(iataCode: string): AirportInfo | null {
  const code = iataCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return AIRPORT_DATA[code] ?? null;
}
