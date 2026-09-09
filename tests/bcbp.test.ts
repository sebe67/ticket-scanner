import assert from "node:assert/strict";
import test from "node:test";
import { parseBcbp } from "../src/bcbp.js";

/** Builds a spec-conformant 60-char BCBP mandatory header from named fields, so field widths can't drift out of sync with the parser by hand-counting characters. */
function buildBcbpHeader(fields: {
  numberOfLegs?: string;
  passengerName?: string;
  eTicketIndicator?: string;
  pnr?: string;
  from?: string;
  to?: string;
  carrier?: string;
  flightNumber?: string;
  julianDay?: string;
  compartment?: string;
  seat?: string;
  checkInSequence?: string;
  passengerStatus?: string;
  variableFieldSize?: string;
}): string {
  return (
    "M" +
    (fields.numberOfLegs ?? "1") +
    (fields.passengerName ?? "DELACRUZ/JUAN").padEnd(20) +
    (fields.eTicketIndicator ?? "E") +
    (fields.pnr ?? "ABC123").padEnd(7) +
    (fields.from ?? "MNL").padEnd(3) +
    (fields.to ?? "NRT").padEnd(3) +
    (fields.carrier ?? "PR").padEnd(3) +
    (fields.flightNumber ?? "421").padEnd(5) +
    (fields.julianDay ?? "250").padStart(3, "0") +
    (fields.compartment ?? "Y") +
    (fields.seat ?? "012A").padEnd(4) +
    (fields.checkInSequence ?? "0023").padEnd(5) +
    (fields.passengerStatus ?? "1") +
    (fields.variableFieldSize ?? "00")
  );
}

test("parses a real-shaped M1 boarding pass header", () => {
  const header = buildBcbpHeader({});
  assert.equal(header.length, 60);

  const parsed = parseBcbp(header);
  assert.ok(parsed);
  assert.equal(parsed!.formatCode, "M");
  assert.equal(parsed!.numberOfLegs, 1);
  assert.equal(parsed!.passengerName, "DELACRUZ/JUAN");
  assert.equal(parsed!.electronicTicketIndicator, "E");
  assert.equal(parsed!.firstLeg.operatingCarrierPnr, "ABC123");
  assert.equal(parsed!.firstLeg.fromAirport, "MNL");
  assert.equal(parsed!.firstLeg.toAirport, "NRT");
  assert.equal(parsed!.firstLeg.operatingCarrier, "PR");
  assert.equal(parsed!.firstLeg.flightNumber, "421");
  assert.equal(parsed!.firstLeg.julianDayOfYear, 250);
  assert.equal(parsed!.firstLeg.compartmentCode, "Y");
  assert.equal(parsed!.firstLeg.seatNumber, "012A");
  assert.equal(parsed!.firstLeg.checkInSequence, "0023");
  assert.equal(parsed!.firstLeg.passengerStatus, "1");
});

test("rejects a payload shorter than the mandatory header", () => {
  assert.equal(parseBcbp("M1TOO SHORT"), null);
});

test("rejects a non-'M' format code", () => {
  const header = "S" + buildBcbpHeader({}).slice(1);
  assert.equal(parseBcbp(header), null);
});

test("rejects an out-of-range Julian day", () => {
  const header = buildBcbpHeader({ julianDay: "999" });
  assert.equal(parseBcbp(header), null);
});

test("rejects airport codes that aren't 3 letters (fused/corrupted OCR-adjacent data)", () => {
  const header = buildBcbpHeader({ from: "M1L" });
  assert.equal(parseBcbp(header), null);
});
