# Changelog

`package.json`'s `version` and `src/index.ts`'s `ENGINE_VERSION` are bumped together on
every change that touches runtime behavior, so a bug report against a running instance
can always be tied back to the exact code that produced it (`ENGINE_VERSION` is exported
and appears in every `TicketScanResult.provenance`, and in the demo's version badge).

## 0.6.0

- **Fixed a real double-softmax bug in OCR confidence** (`src/recognize.ts`). The
  deployed `rec_model.onnx`'s exported graph already applies softmax internally — its
  raw output is a per-class probability distribution (confirmed empirically: every
  timestep's ~18,385 values are non-negative and sum to ~1.0), not raw logits. The
  previous code assumed raw logits and ran softmax on the output a second time, which
  silently flattens an already-normalized distribution and produces a confidence value
  that's tiny (~0.0001) regardless of how confident the model actually is. **This
  retracts and corrects 0.5.0's README note**, which (wrongly) attributed the low values
  to the large character vocabulary alone. Fixed by using the model's own top-class
  value directly. Verified against the real model on a real image: recognized text is
  unchanged (the argmax was always correct), confidence went from ~0.0001 to 0.89–0.99.
- **Replaced the hand-curated, Philippines-centric airport table with a generated,
  comprehensive one.** `src/airportData.ts` is now generated (`node
  scripts/generate-airport-data.mjs`) from OurAirports' public-domain dataset
  (~9,056 IATA-coded airports worldwide, every country) instead of ~150 hand-picked
  entries. Real testing had already found the old table's scope was too narrow (South
  Africa was entirely missing in 0.5.0) — this replaces the whole approach rather than
  adding countries one report at a time indefinitely, per the README's own
  previously-stated intent to do this "once that matters."

  **Side effect worth knowing about:** with ~9,000 real codes instead of ~150, plenty of
  ordinary English words are now real airport codes somewhere in the world (e.g. "THE"
  is Teresina, Brazil), which widens route-matching's false-positive surface versus the
  old narrow table. Accepted as the tradeoff for real global coverage, consistent with
  the lessons-learned doc's warning about short/generic-word collisions — a real false
  positive from this is exactly what the fixtures/ workflow exists to catch.

## 0.5.0

Three fixes from a real Booking.com flight-confirmation screenshot report (JNB<->CPT
round trip, zero fields extracted):

- **Route matching now handles "City (CODE) to City (CODE)"** — a very common OTA
  phrasing (Booking.com, and likely others) where the two IATA codes aren't adjacent to
  each other (a city name sits between them), so the existing "CODE - CODE"/"CODE to
  CODE" pattern couldn't see them. Added a second path that looks for exactly two
  parenthesized 3-letter codes anywhere in a line.
- **Added South Africa's three major airports** (`JNB`, `CPT`, `DUR`) to
  `airportLookup.ts` — the starter table was Philippines-centric and had no African
  airports at all, so even with the route pattern fixed, the codes wouldn't have
  resolved to a country.
- **The two-unlabeled-dates fallback now uses document order, not resolved-value
  order**, to decide which date is departure vs. return. Each date's year is inferred
  independently (see 0.4.0's yearless-date fix) — usually fine, but two dates that are
  actually a year apart in real time (e.g. Dec 31 and Jan 2, a New Year's-spanning trip)
  can, in a narrow scanning-time window, both round to the *same* calendar year, making
  the second-listed date resolve to an earlier value than the first. Sorting by value
  would then swap departure and return; document order doesn't, since the outbound leg
  is listed before the return leg on essentially every real itinerary/OTA confirmation
  (confirmed again by this exact report). See the comment in `src/textExtraction.ts` and
  the regression test using the narrow real window this can occur in
  (`tests/textExtraction.test.ts`).

Adds a second real regression fixture
(`fixtures/2026-09-09-booking-confirmation-parenthesized-codes.fixture.json`) covering
all three fixes together, from the exact reported OCR lines.

## 0.4.0

- Fixed `parseFreeTextDate` rejecting a date with no year at all (e.g. "17SEP") —
  common on boarding-pass mockups/templates that omit the year. It now infers the
  nearest year to "now" the same way `resolveBcbpJulianDate` already had to for BCBP's
  yearless day-of-year. `extractFieldsFromOcrLines`/`findDateNear` now take an optional
  `referenceDate` so this stays deterministic and fixture-testable.
- Added the first real regression fixture (`fixtures/2026-09-09-yearless-date-not-extracted.fixture.json`),
  captured from an actual first-run report.
- **Known gap surfaced by the same report, not yet fixed:** a ticket printing city names
  ("MOSCOW", "NEW YORK") instead of IATA codes gets no route at all — the extractor only
  recognizes 3-letter codes. Left unresolved rather than guessed (no value beats a wrong
  one); real airline-issued boarding passes almost always print IATA codes, so this may
  matter less in practice than it did for the generic mockup that surfaced it.

## 0.3.1

- Fixed the demo's `<script>` tag: it referenced its bundle by a relative path
  (`./dist/bundle.js`), which the dev server's URL-to-file mapping (`/` -> serves
  `demo/index.html`'s content, but the browser's actual document location stays `/`)
  resolved to the wrong URL (`/dist/bundle.js`, 404) — so the whole demo silently never
  ran, including the Scan button's click handler. Now an absolute path
  (`/demo/dist/bundle.js`). Caught from a real user's first test run.
- No scanning behavior changed — `ENGINE_VERSION` bumps anyway, per this changelog's own
  "bump together" rule, so the version badge always matches what's actually running.

## 0.3.0

- Added `demo/` — a local, real-browser demo (`npm run demo`) that lets you upload an
  actual ticket image/PDF and see the extracted JSON.
- Added `scripts/smoke-test.mjs` (`npm run smoke`) — an automated, real-browser
  (headless Chromium) check of the barcode subsystem: encode a BCBP payload to a real
  PDF417 image, decode it back, parse it, resolve country/date, all through the actual
  `zxing-wasm` WASM runtime rather than just the pure-logic unit tests.
- `ENGINE_VERSION` is now exported from the package (previously internal-only).

## 0.2.0

- Added the `fixtures/` regression-fixture workflow and `ScanTicketOptions.includeDebugInfo`.
- Fixed the default OCR model bucket: the unversioned path had moved to `v1.1/`, and the
  keys file there is actually named `ppocrv5_dict.txt`, not `ppocr_keys_v1.txt` — caught
  by loading the real models and checking the rec model's output class count against the
  dict's line count, not by trusting the filename.
- Pinned `onnxruntime-web`/`pdfjs-dist`/`zxing-wasm` to exact versions instead of ranges,
  to keep each hosted wasm/worker build from silently drifting out of sync with the JS
  bindings.
- Restructured `TicketScanResult.provenance` from a single object (which only hashed
  page 0) into a `pages` array, one entry per page.

  **Note on this version number:** the model-hosting fix, version pinning, and
  provenance restructuring above landed in a second commit that didn't bump the version
  — exactly the kind of gap this changelog discipline exists to prevent. Both commits
  are tagged `v0.2.0`; treat any report against a "0.2.0" build as needing all of the
  above regardless of which commit it was actually running.

## 0.1.0

- Initial release: barcode-first (IATA BCBP via PDF417/Aztec/QR, `zxing-wasm`) with
  on-device OCR fallback (PaddleOCR PP-OCRv5 via `onnxruntime-web`, reused from the
  `id-ocr-web` project) for `originCountry`, `destinationCountry`, `departureDate`,
  `returnDate`, `adults`, `children`, and a derived `tripType`.
- PDF input support via `pdfjs-dist` page rasterization.
- Unit tests for BCBP parsing, date parsing, airport lookup, and OCR-text field
  extraction.
