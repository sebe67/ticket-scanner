# Regression fixtures

This directory holds the project's regression suite, built entirely from **real**
reported tickets — not hand-written "looks realistic" examples. That distinction
matters: a synthetic fixture only ever proves the code handles the case you imagined,
and ticket layouts are effectively unbounded across airlines/OTAs, so the cases that
actually break this pipeline are, almost by definition, ones nobody imagined in advance.
`tests/fixtures.test.ts` loads every `*.fixture.json` here and runs it on every `npm
test` — this is the thing that catches a fix for one format silently breaking a
different one, before a user does.

The directory starts empty (aside from this README) and grows one real report at a
time — see `2026-09-09-yearless-date-not-extracted.fixture.json` for the first one.

## When to add one

Whenever a real ticket produces a wrong or missing field:

1. **Reproduce it first**, with the exact data from that run — don't hand-transcribe
   what you think the OCR/barcode said. Re-run `scanTicket` on the same input with
   `includeDebugInfo: true`:

   ```ts
   const result = await scanTicket(input, { includeDebugInfo: true });
   console.log(JSON.stringify(result.debug, null, 2));
   console.log(result.provenance.engineVersion);
   ```

   `result.debug` is an array (one entry per page) of `{ lines, barcodes }` — the exact
   `RecognizedTextLine[]` and decoded barcode payloads the pipeline saw. That's your
   fixture's raw material.

2. **Pick the fixture kind** based on which stage actually produced the wrong answer:
   - The barcode decoded but a field came out wrong → a `"barcode"` fixture around
     `result.debug[i].barcodes[j].text`.
   - No barcode, or the barcode didn't cover the field, and OCR-based extraction got it
     wrong → an `"ocrLines"` fixture around `result.debug[i].lines`.

   If the underlying OCR recognition itself was wrong (the text came out as garbage,
   not a plausible-but-wrong value), that's a model/image-quality issue, not something a
   fixture here can fix — per the lessons learned from the prior ID-scanning project,
   don't write a fixture chasing a genuine recognition failure.

3. **Write the fixture file** as `fixtures/YYYY-MM-DD-short-description.fixture.json`,
   shaped per `tests/fixtureTypes.ts` (`OcrLinesFixture` or `BarcodeFixture`). Fill in
   `expected` with only the fields this report actually concerned — don't assert fields
   that weren't part of the bug. See the templates below.

4. **Run `npm test`.** The new fixture should fail — that's the reproduction. Fix the
   underlying code in `src/textExtraction.ts` (or `src/bcbp.ts`/`src/dateParsing.ts` for
   a barcode fixture), and re-run until every fixture passes, including the older ones —
   a fix for this report must not silently break a previously-fixed one.

5. **Bump `ENGINE_VERSION`** in `src/index.ts` (and `package.json`'s `version`) when the
   fix ships, so a future report can be tied back to the exact code that produced it.

## Templates

### `"ocrLines"` — extraction from recognized text got a field wrong

```json
{
  "kind": "ocrLines",
  "description": "Route not detected when the airport codes are separated by an em dash instead of a hyphen",
  "reportedEngineVersion": "ticket-scanner/bcbp+ppocrv5-mobile-onnxruntime-web@0.2.0",
  "lines": [
    { "text": "Flight PR421", "confidence": 0.98, "boundingBox": [10, 10, 120, 30] },
    { "text": "MNL — NRT", "confidence": 0.95, "boundingBox": [10, 40, 120, 60] }
  ],
  "expected": {
    "originAirport": "MNL",
    "destinationAirport": "NRT"
  }
}
```

Add `referenceDate` (same meaning as in the `"barcode"` example below) whenever the
fixture asserts `departureDate`/`returnDate` and the ticket's printed date has no year
at all (e.g. "17SEP") — `parseFreeTextDate` infers the year from "now" in that case,
same as `resolveBcbpJulianDate` does for BCBP, so the fixture needs a pinned instant to
stay deterministic. Not needed when the date already includes an explicit year.

### `"barcode"` — a decoded BCBP payload resolved to the wrong field

```json
{
  "kind": "barcode",
  "description": "Departure date resolved to the wrong year for a ticket scanned right at New Year",
  "reportedEngineVersion": "ticket-scanner/bcbp+ppocrv5-mobile-onnxruntime-web@0.2.0",
  "barcodeText": "M1DELACRUZ/JUAN       EABC123 MNLNRTPR 421 0050123A00231000",
  "referenceDate": "2026-12-30T08:00:00Z",
  "expected": {
    "fromAirport": "MNL",
    "toAirport": "NRT",
    "departureDate": "2027-01-05"
  }
}
```

(Both examples above are illustrative only — they are not real reports, and there are
no matching `.fixture.json` files for them in this directory. Don't copy them in as if
they were; write a fixture only from an actual reported ticket.)
