# Changelog

`package.json`'s `version` and `src/index.ts`'s `ENGINE_VERSION` are bumped together on
every change that touches runtime behavior, so a bug report against a running instance
can always be tied back to the exact code that produced it (`ENGINE_VERSION` is exported
and appears in every `TicketScanResult.provenance`, and in the demo's version badge).

## 0.14.0

- **Direct image uploads now honor a photo's EXIF orientation** (`src/imageUtils.ts`).
  `toCanvas` calls `createImageBitmap(blob)` for any non-PDF input, and until now did
  so with no options — `imageOrientation` then falls back to a default that ignores a
  photo's EXIF rotation tag, and that default has actually differed across browser
  versions. Every real ticket tested against this project so far has been a screenshot
  or a PDF, neither of which carries camera EXIF metadata, so this was never
  exercised — but a real phone photo of a paper boarding pass commonly *is* stored
  sideways at the pixel level with an EXIF tag saying how to display it upright, and
  without correcting for that it would get OCR'd and barcode-scanned in its raw,
  possibly-rotated orientation. Fixed by passing `{ imageOrientation: "from-image" }`,
  matching how a plain `<img>` tag already displays such a photo.
  (PDF pages were never affected — `rasterizePdf`'s viewport already respects each
  page's own declared rotation by construction, since `rotation` isn't overridden.)
  **Not verified against a real EXIF-rotated photo** — this environment has no network
  access to fetch a reference test image and no EXIF-writing dependency to construct
  one, so this is applying the well-documented, standard fix rather than a
  reproduce-then-fix from a real report. If you test this with an actual phone photo
  taken directly in portrait (not a pre-rotated screenshot) and it's still wrong,
  that's a real report — send it over.

## 0.13.0

- **A single overnight long-haul leg could get wrongly assigned a `returnDate`
  that's actually just its own arrival day** (`src/textExtraction.ts`), fixed from a
  real Singapore Airlines report (one-way SIN to LHR). Departing SIN 23:25 and landing
  LHR 05:55 crosses midnight, so the ticket prints two different calendar dates (02 Jan
  departure, 03 Jan arrival) for one single flight — the same shape ("exactly two
  unlabeled dates") the fallback expects for a genuine departure+return pair, so it
  guessed wrong. What actually distinguishes the two: a real round trip's return leg
  reverses the route in its own text (see the JNB↔CPT fixture: `"Cape Town (CPT) to
  Johannesburg (JNB)"`), while this ticket only ever mentions SIN→LHR once; and this
  leg's destination has a same-line local time *earlier* in the day than its origin's —
  exactly what crossing midnight means. `returnDate` is now suppressed only when all
  three signals agree: the two dates are exactly one day apart, and both the resolved
  origin and destination have a recorded same-line time, and the destination's time is
  earlier than the origin's. A genuine round trip that happens to be a quick one-night
  trip (its own separate, non-overnight legs) is unaffected — see the new "still
  assigns a returnDate" unit test.

Adds a seventh real regression fixture
(`fixtures/2026-09-10-singapore-airlines-overnight-leg-wrongly-treated-as-return.fixture.json`).

## 0.12.0

- **Route matching's two "code isn't adjacent to the other code" fallbacks
  (code-near-time from 0.9.0, bare-code-line from 0.10.0) are now one combined pass
  instead of two separate ones** (`src/textExtraction.ts`), fixed from a real Singapore
  Airlines boarding pass. Both legs are printed the same way on that ticket (a code
  next to its own local time) — this isn't two different document layouts. The OCR's
  text-box detection just grouped the two legs inconsistently: `"SIN"` and `"20:50"`
  came back as one line, while `"MNL"` and `"17:05"` came back as two separate lines.
  Each pattern previously ran as its own complete pass over the whole document and only
  ever found its *one* matching code — the code-near-time pass found only `SIN`, the
  bare-code-line pass found only `MNL` — so neither pass's "exactly two distinct codes"
  threshold was ever satisfied, even though the two codes together were sitting right
  there. Now both patterns are checked per line and merged into one candidate list,
  which catches this regardless of which way OCR happened to split things, still
  bounded by the same "exactly two distinct codes, or
  don't guess" rule as before.

Adds a sixth real regression fixture
(`fixtures/2026-09-10-singapore-airlines-mixed-bare-code-and-code-near-time.fixture.json`).

## 0.11.0

- **The barcode subsystem's Aztec and QRCode paths are now actually exercised, not
  just declared.** Every real ticket tested against this project so far has used a
  printed PDF417 barcode (paper boarding passes); `decodeBarcodes` (`src/barcode.ts`)
  has requested all three formats (`PDF417`, `Aztec`, `QRCode`) since the very first
  version, matching the architecture decision to support both paper and mobile/wallet
  boarding passes, but Aztec/QRCode had never actually been round-tripped against a
  real image — only PDF417 had, in `npm run smoke`.
  - `npm run smoke` (`scripts/smoke-test.mjs`/`smoke-test-entry.ts`) now runs its full
    encode -> decode -> BCBP parse -> country/date resolution round trip for all three
    formats, not just PDF417. All three pass.
  - `npm run generate-sample:aztec` / `npm run generate-sample:qr`
    (`scripts/generate-sample-ticket.mjs`/`generate-sample-entry.ts`) generate a
    "mobile boarding pass" sample image — same synthetic, clearly-labeled BCBP data as
    `npm run generate-sample`'s existing PDF417 one, just encoded as a square
    Aztec/QRCode symbol instead, for exercising the demo against something closer to a
    real phone-wallet screenshot.
- No scanning behavior changed for the existing PDF417 path — this only adds test
  coverage for the two formats that were already declared-supported but untested.
  `ENGINE_VERSION` bumps anyway, per this changelog's own "bump together" rule.

## 0.10.0

- **Route matching now handles a fourth real layout: airport codes split across
  separate OCR lines with no time, label, or adjacency to anchor on**
  (`src/textExtraction.ts`), from a real Asiana Airlines "Boarding Pass Exchange
  Coupon." Its FROM/TO section is a wide table; the OCR emitted each cell as its own
  line in an inconsistent scan order — `"MNL"`, a misrecognized arrow glyph between the
  codes (came back as the unrelated character `"ナ"`), then `"ICN"` — never on the same
  line as each other and never paired with a time on the same line either (the times
  are separate lines too). None of the three existing route patterns require less than
  "both codes on one line," so none could see this. Added a fourth pattern, tried only
  when the other three find nothing: a line whose *entire* trimmed text is nothing but
  a 3-letter code that resolves to a real airport. Deliberately the narrowest of the
  four patterns (no time/label/parens to anchor on) — a line with literally nothing
  else on it is a strong enough signal on its own, and it's still bounded by the same
  "exactly two distinct codes, or don't guess" rule as the others.

Adds a fifth real regression fixture
(`fixtures/2026-09-10-asiana-boarding-pass-exchange-coupon-bare-code-lines.fixture.json`).

## 0.9.0

- **Route matching now handles a third real layout: "CODE- clock time" on its own
  line, once per leg** (`src/textExtraction.ts`), from the same real CheapOair
  booking confirmation as 0.8.0. That ticket prints `"YVR- 02:20 pm"` for the
  departure leg and, several lines later, `"YCG-03:31pm"` for the arrival leg — the
  two codes are never on the same line, adjacent, or parenthesized, so neither of the
  two existing route patterns could see them. Added a third pattern that looks for a
  3-letter code immediately followed by a clock time (`H:MM`/`HH:MM`, optional am/pm)
  anywhere in the document; if exactly two distinct table-known airport codes turn up
  this way, the first in document order is origin and the second destination — same
  "document order, no value beats a wrong one" approach already used for the
  unlabeled-date fallback. Only runs when the other two route patterns found nothing.
- Extends the 0.8.0 CheapOair fixture to also assert the now-correct
  `originAirport`/`destinationAirport` (`YVR`/`YCG`), since it's the same report.

## 0.8.0

Fixed a real CheapOair booking-confirmation report: a one-way domestic flight (no
return leg at all) came back with a wrong `departureDate` (`2026-03-20`) *and* a
spurious `returnDate` (`2019-03-20`) — both wrong, and a return date that shouldn't
exist at all.

- **`findFreeTextDateMatch`'s `monthDayYear` pattern now accepts zero separators
  between month and day** (`src/dateParsing.ts`), mirroring 0.7.0's fix to
  `dayMonthYear`'s day-year separator. This ticket's same physical date was OCR'd twice
  with inconsistent spacing: `"Wed, Mar20,2019"` (no separator, printed once as the
  departure header) and `"Wed, Mar 20, 2019"` (spaced, printed again next to the arrival
  details, since it's a same-day flight). The spaced line already resolved correctly
  (`2019-03-20`); the zero-separator line failed `monthDayYear`'s separator requirement
  and fell through to the yearless-date fallback, inferring a year near "now"
  (`2026-03-20`) instead of using the real, explicit `2019` printed right there. Because
  the two lines then resolved to *different* string values, the ambiguous-date-pool
  fallback treated them as two distinct dates instead of deduplicating them as the same
  one — assigning the wrong first date as departure and the wrong second date as a
  return that doesn't exist on this one-way ticket. With the separator loosened, both
  lines now resolve to the identical `2019-03-20`, collapse into a single deduplicated
  date, and the fallback's single-date branch correctly assigns only a `departureDate`.
- **`fixtures/` and the fixture test loader now support asserting a field is absent**,
  not just asserting its value (`tests/fixtureTypes.ts`, `tests/fixtures.test.ts`) — set
  `expected.departureDate`/`returnDate` to `null` (as opposed to omitting the key, which
  asserts nothing). Needed for this fixture: the actual defect was as much "a returnDate
  appeared that shouldn't have" as it was "departureDate had the wrong value," and the
  fixture format previously had no way to lock in the first half of that.

This scanner intentionally does not validate that a departure date is in the future, or
otherwise judge dates for plausibility — it passes through whatever's actually printed.
Whether/how to reject a ticket based on date plausibility is left to the downstream
eligibility-matching service.

Adds a fourth real regression fixture
(`fixtures/2026-09-10-cheapoair-zero-separator-monthdayyear-and-duplicate-date.fixture.json`).

## 0.7.0

Two compounding fixes from a real Philippine Airlines e-ticket PDF report: barcode
scanning correctly produced `departureDate`, but `returnDate` was missing entirely even
though `05Jun2026` was clearly printed on the page (the barcode only ever encodes the
outbound leg, so `returnDate` always has to come from the OCR fallback).

- **`findFreeTextDateMatch`'s day-month-year pattern now accepts zero separators before
  the year** (`src/dateParsing.ts`) — this airline prints dates like `01Jun2026` with no
  separator at all between the month and the year. The old pattern required at least one
  separator character there, so this fell through to the yearless-date fallback and
  discarded the real, explicit printed year. (`monthDayYear`'s separator was left
  unchanged — not demonstrated by any real report yet.)
- **The unlabeled-date fallback now skips a date match with a colon earlier in the same
  line**, rather than giving up entirely once it sees more than two unique dates
  (`src/textExtraction.ts`). This e-ticket's page also carries an issuance date
  (`Date: 08May2026`) and a fare-validity date (`NVA (3): 31Jul2026`, printed twice) —
  four unique dates in total, which used to trip the "3+ unlabeled dates is too
  ambiguous, don't guess" rule and threw away the real, extractable return date along
  with the noise. Both metadata dates here are "Label: date" formatted; a colon before
  the match is a general signal of that, without needing airline-specific knowledge.
  `parseFreeTextDate` was refactored into `findFreeTextDateMatch`, which reports the
  match's position in the string alongside its resolved value, so this distinction can be
  made without re-scanning the line. (The first attempt at this fix — matching only when
  the date was the entire trimmed line — broke the existing Booking.com fixture, whose
  real flight-date lines are compound, e.g. "Thu 10 Apr· 05:55 - ...". The
  colon-position check handles both correctly.)

Adds a third real regression fixture
(`fixtures/2026-09-09-real-eticket-compact-dates-and-metadata-dates.fixture.json`)
covering both fixes together, from the exact reported OCR lines.

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
