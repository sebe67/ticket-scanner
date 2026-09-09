import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { lookupAirport } from "../src/airportLookup.js";
import { parseBcbp } from "../src/bcbp.js";
import { resolveBcbpJulianDate } from "../src/dateParsing.js";
import { extractFieldsFromOcrLines } from "../src/textExtraction.js";
import type { TicketFixture } from "./fixtureTypes.js";

/**
 * The regression suite described in fixtures/README.md: every real bug report gets
 * captured as a fixture here and replayed on every run, forever. There are no synthetic
 * "looks realistic" fixtures in this file on purpose — only actual reported inputs earn
 * a place here, so this suite starts (and may stay, for a while) empty.
 */
const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

function loadFixtures(): { file: string; fixture: TicketFixture }[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".fixture.json"))
    .map((file) => ({ file, fixture: JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8")) as TicketFixture }));
}

const fixtures = loadFixtures();

test("fixtures/ is wired up and readable (fixtures are added as real bug reports come in)", () => {
  assert.ok(Array.isArray(fixtures));
});

for (const { file, fixture } of fixtures) {
  test(`fixture ${file}: ${fixture.description}`, () => {
    if (fixture.kind === "ocrLines") {
      const { expected } = fixture;
      if ((expected.departureDate !== undefined || expected.returnDate !== undefined) && !fixture.referenceDate) {
        throw new Error("a departureDate/returnDate assertion needs referenceDate pinned, or it can't be reproduced deterministically once the ticket's date lacks an explicit year");
      }
      const referenceDate = fixture.referenceDate ? new Date(fixture.referenceDate) : new Date();
      const result = extractFieldsFromOcrLines(fixture.lines, referenceDate);

      if (expected.originAirport !== undefined) assert.equal(result.originAirport, expected.originAirport);
      if (expected.destinationAirport !== undefined) assert.equal(result.destinationAirport, expected.destinationAirport);
      if (expected.departureDate !== undefined) assert.equal(result.departureDate?.value, expected.departureDate);
      if (expected.returnDate !== undefined) assert.equal(result.returnDate?.value, expected.returnDate);
      if (expected.adults !== undefined) assert.equal(result.adults?.value, expected.adults);
      if (expected.children !== undefined) assert.equal(result.children?.value, expected.children);
    } else {
      const parsed = parseBcbp(fixture.barcodeText);
      assert.ok(parsed, "expected the captured barcode text to parse as a valid BCBP header");
      const { expected } = fixture;

      if (expected.fromAirport !== undefined) {
        assert.equal(parsed!.firstLeg.fromAirport, expected.fromAirport);
        assert.ok(lookupAirport(parsed!.firstLeg.fromAirport), `${expected.fromAirport} should resolve in airportLookup.ts`);
      }
      if (expected.toAirport !== undefined) assert.equal(parsed!.firstLeg.toAirport, expected.toAirport);
      if (expected.departureDate !== undefined) {
        assert.ok(fixture.referenceDate, "a departureDate assertion needs referenceDate pinned, or it can't be reproduced deterministically");
        const resolved = resolveBcbpJulianDate(parsed!.firstLeg.julianDayOfYear, new Date(fixture.referenceDate!));
        assert.equal(resolved, expected.departureDate);
      }
    }
  });
}
