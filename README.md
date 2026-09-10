# ticket-scanner

Client-side (browser) plane-ticket scanner for an insurance-eligibility flow: scan a
photo/screenshot or PDF of a plane ticket, get back just the fields that eligibility
logic needs, as JSON. Runs entirely on-device (WASM) — no image ever leaves the
browser. The only network calls are the initial (cached) downloads of the OCR model
and barcode-decoder wasm assets.

## What it extracts

```ts
interface TicketFields {
  originCountry?: TicketField<string>;       // e.g. "Philippines"
  destinationCountry?: TicketField<string>;
  departureDate?: TicketField<string>;        // ISO 8601, YYYY-MM-DD
  returnDate?: TicketField<string>;           // present only for a round trip
  adults?: TicketField<number>;
  children?: TicketField<number>;
  tripType?: TicketField<"DOMESTIC" | "INTERNATIONAL">; // derived, not read off the ticket
}
```

Deliberately not a general "digitize the whole ticket" schema — seat, gate, class, PNR
etc. are out of scope because nothing downstream needs them. A field is simply absent
(not present as a key) when nothing found a trustworthy value for it: **no value is
better than a wrong value** for something feeding an eligibility check.

Each present field carries `{ value, confidence, source }`, where `source` is
`"barcode"` (from a decoded IATA BCBP boarding-pass barcode — exact, deterministic),
`"ocr"` (label/regex-matched from recognized text), or `"derived"` (computed from other
resolved fields, currently just `tripType`).

Scope note: `destinationCountry` assumes a direct, single-country trip (no multi-city /
layover-as-destination itineraries) — see "Known limitations" below.

`TicketScanResult.provenance.pages` carries one entry per page (a single image input is
always exactly one page) with that page's image hash, whether a barcode was found on
it, and its raw OCR text — kept per-page rather than flattened across a whole PDF, since
each page is a genuinely different image and flattening would lose which page a value
came from. There's no strict contract to match on the output shape — no schema was
predefined on the consuming side — but this follows the same field-object and
per-document-unit-provenance pattern the `id-ocr-web` project's schema already proved
out with its consumer (`{ value, confidence, source }` per field; a provenance entry
per unit of input rather than one flattened blob), rather than reinventing the shape
from scratch. It stops short of also carrying a per-field bounding box the way that
project's `OcrField` does — nothing currently needs it, and it would take real plumbing
through `textExtraction.ts`'s regex matches — but it's a reasonable next addition if a
consumer ever does.

## How it works

1. **Barcode/QR first.** Airline boarding passes almost always carry the passenger's
   flight data in a PDF417 (sometimes Aztec or QR) barcode, standardized by IATA as BCBP
   (Bar Coded Boarding Pass, Resolution 792) — a fixed text format with origin/destination
   airport, flight date, PNR, etc. already structured. Decoding it (`zxing-wasm`) is
   exact and near-instant, with none of OCR's recognition noise, so it's tried first.
2. **OCR fallback.** Runs unconditionally afterward (via the same PaddleOCR PP-OCRv5
   mobile detection/recognition pipeline as the `id-ocr-web` project, over
   `onnxruntime-web`) to fill in whatever the barcode doesn't cover — a boarding pass
   never carries return date or passenger counts, and a plain booking-confirmation/
   itinerary document has no barcode at all. Where both a barcode and OCR produce a
   value for the same field, the barcode's wins (higher confidence).
3. **PDF input** is rasterized page-by-page (`pdfjs-dist`) before the same pipeline runs
   on each page; per-field results across pages are merged by confidence.
4. **Country lookup**: airport IATA codes resolve to countries via `src/airportData.ts`,
   ~9,056 airports generated from OurAirports' public-domain dataset (`node
   scripts/generate-airport-data.mjs` to refresh) — see limitations.

## Usage

```ts
import {
  configureOrtWasmPaths,
  configureZxingWasmPath,
  configurePdfWorker,
  scanTicket,
} from "ticket-scanner";

// Once at app startup — point each library at wherever you host its wasm/worker assets
// (they ship in the respective package's node_modules, or use a CDN build).
configureOrtWasmPaths("/onnxruntime-wasm/");
configureZxingWasmPath("/zxing-wasm/");
configurePdfWorker("/pdfjs-dist/pdf.worker.min.mjs");

// Hand it whatever a file input/drag-and-drop gave you, whether the user uploaded a
// screenshot (JPEG/PNG/WEBP/whatever the browser's own image decoder supports) or a
// PDF e-ticket — scanTicket tells them apart itself from the File's own type, no
// branching needed on your end.
const result = await scanTicket(uploadedFile);

// Also accepts an HTMLImageElement/HTMLCanvasElement/ImageBitmap directly, or a PDF's
// raw bytes as ArrayBuffer/Uint8Array if you've already read the file yourself.
const result2 = await scanTicket(someCanvas);

console.log(result.fields);
// { originCountry: { value: "Philippines", confidence: 0.97, source: "barcode" }, ... }
```

Hand `result.fields` straight to your teammate's eligibility service as JSON; nothing
else in this package needs to reach a network boundary.

## Regression fixtures

`fixtures/` holds the growing regression suite — built entirely from real reported
tickets, not synthetic examples, per the lessons learned from the prior ID-scanning
project. It starts empty. When a real ticket produces a wrong or missing field, capture
it with `scanTicket(input, { includeDebugInfo: true })` (see `fixtures/README.md` for
the full workflow) and add a fixture; `npm test` runs every fixture on every change, so
a fix for one report can't silently break a previously-fixed one.

## Demo and smoke test

`npm run demo` builds the library and starts a local server at `http://localhost:8787/`
with a page that lets you upload a real ticket photo/screenshot/PDF and see the
extracted JSON — run it on any machine with normal internet access (it needs to reach
the OCR model bucket; see Setup). It serves onnxruntime-web/zxing-wasm/pdfjs-dist's
wasm/worker assets straight out of `node_modules`, so there's no CDN dependency.

No real ticket handy? `npm run generate-sample` writes
`sample-tickets/boarding-pass-sample.png` — a synthetic (clearly-labeled, not-a-real-
airline) boarding pass with a genuine, scannable PDF417 barcode encoding valid BCBP
data, plus the same IATA codes printed as plain text. Upload it to the demo to exercise
the full barcode-first path; there's already a generated copy checked in, and the flight
date is always "7 days from today" so it never goes stale. The generator's output was
verified against the real decode/parse/lookup pipeline before being committed (round-trips
back to `MNL`/`NRT`/Philippines/Japan correctly).

`npm run generate-sample:aztec` / `npm run generate-sample:qr` generate the same
document but as a "mobile boarding pass" — square Aztec/QRCode barcodes instead of
PDF417, the way a phone-wallet boarding pass is typically encoded, since a real one of
those hadn't been tested against at all before 0.11.0.

`npm run smoke` is an automated check, not a manual demo: it drives real headless
Chromium (via Playwright) through an actual round trip of the barcode subsystem for
all three formats `decodeBarcodes` reads (PDF417, Aztec, QRCode) — encodes a test BCBP
payload, decodes it back, parses it, and resolves country/date — exercising the real
`zxing-wasm` WASM runtime rather than just the pure-logic unit tests in `tests/`. It
deliberately doesn't exercise the OCR fallback path, since that needs a real network
fetch of the model weights; run `npm run demo` with a real ticket for that instead. Run
`npm run smoke` after any change that touches `src/barcode.ts`, `src/bcbp.ts`,
`src/dateParsing.ts`, or `src/airportLookup.ts`.

## Setup

1. Host the three OCR model assets (`det_model.onnx`, `rec_model.onnx`, and the keys
   file — currently named `ppocrv5_dict.txt` at the bucket path this defaults to, see
   `src/config.ts`) publicly-readable, and pass a `modelConfig` (see
   `defaultModelConfig`) pointing at your own copy — see "model hosting" under Known
   limitations for why the built-in default shouldn't be relied on long-term, and
   verify your own copy the same way this project's default was verified (below)
   rather than trusting filenames.
2. Host `onnxruntime-web`'s `.wasm` binaries, `zxing-wasm`'s `zxing_reader.wasm`, and
   `pdfjs-dist`'s worker script wherever your app serves static assets, and call the
   three `configure*` functions once at startup (see Usage above). **The hosted wasm
   binary/worker for each must be from the exact same npm version as this package's
   pinned dependency** (`package.json` intentionally pins exact versions, not ranges,
   for this reason) — a version mismatch between JS bindings and wasm binary produces
   opaque errors at load time rather than a clear message. This bit the sibling
   id-ocr-web project's own onnxruntime-web integration; see the comment on
   `configureOrtWasmPaths` in `src/index.ts`.
3. `npm install && npm run build`.
4. `npm test` runs the pure-logic unit tests (BCBP parsing, date parsing, airport
   lookup, OCR-text field extraction) under plain Node — no browser required for these.

### Verifying a model/dict pair before trusting it

Don't trust a bucket's filenames as proof of what's actually in it — another lesson
from the sibling project, where a previously-deployed model was mislabeled by
generation and only caught by inspecting the graph directly. The same check applies
here: load both ONNX models and confirm the rec model's real output class count equals
the keys file's non-empty line count + 2 (CTC blank + trailing space, see
`buildCharset` in `src/recognize.ts`). This was done for the current default
(`storage.googleapis.com/idscan_ocr/v1.1/`) while wiring it up: `rec_model.onnx`'s
output shape is `[1, T, 18385]` against `ppocrv5_dict.txt`'s 18383 lines — a genuine
match. Re-run the same check if you point `modelConfig` at your own hosted copy, or if
the default bucket's contents change again (they already have once, from an
unversioned layout with a `ppocr_keys_v1.txt` file to the current `v1.1/` layout with
`ppocrv5_dict.txt` — a bucket's current contents are not a stable contract).

## Known limitations / next steps

- **A real camera photo's EXIF orientation is untested against a real example** (fixed
  in 0.14.0, but not verified against a real photo — flagged proactively, not from a
  bug report). `toCanvas` (`src/imageUtils.ts`) now passes
  `{ imageOrientation: "from-image" }` to `createImageBitmap`, so a photo stored
  sideways at the pixel level (with an EXIF tag saying how to display it upright) gets
  corrected the same way a plain `<img>` tag already displays it — before this, the
  option was left at its default, which ignores that tag, and that default has
  actually differed across browser versions. Every real ticket tested so far has been
  a screenshot or a PDF, neither of which carries camera EXIF metadata, so this path
  was never actually exercised. This environment couldn't verify the fix against a
  real EXIF-rotated photo (no network access to fetch a reference test image, no
  EXIF-writing dependency to construct one) — if you test this with an actual phone
  photo taken directly in portrait and it's still wrong, that's a real, fixture-worthy
  report.
- **Both the barcode subsystem and the OCR fallback have now run for real.** The barcode
  subsystem is verified end-to-end in a real browser via `npm run smoke` (encode ->
  decode -> BCBP parse -> country/date resolution, through the actual `zxing-wasm` WASM
  runtime). The OCR fallback couldn't be exercised the same way in the sandboxed
  environment this was originally developed in (its headless Chromium couldn't complete
  an HTTPS request to the model bucket at all — confirmed, and not something worth
  routing around per that environment's own documented policy), but a real user's `npm
  run demo` run against a real boarding-pass mockup did complete the full pipeline
  (model fetch, WASM inference, OCR-text extraction) with no crash — see the next two
  bullets for what that run actually surfaced.
- **A ticket printing city names instead of IATA codes, with no codes anywhere, still
  gets no route.** The first real test (a generic boarding-pass mockup showing
  "MOSCOW"/"NEW YORK") printed only city names, nowhere on the document — no code to
  find at all. Left as a known gap rather than fixed with a city-name lookup, since real
  airline-issued boarding passes and real OTA confirmations (see the next two bullets)
  do print IATA codes, just not always adjacent to each other.
- **Route matching now also handles "City (CODE) to City (CODE)"** (fixed in 0.5.0, from
  a real Booking.com confirmation screenshot): the two codes there aren't adjacent (a
  city name sits between them), so the original "CODE - CODE"/"CODE to CODE" pattern
  couldn't see them. `src/textExtraction.ts` now also looks for exactly two
  parenthesized 3-letter codes anywhere in a line.
- **A ticket date with no year at all is now handled** (fixed in 0.4.0, from a real
  test — see `CHANGELOG.md`): `parseFreeTextDate` used to require an explicit year
  and silently returned nothing for e.g. "17SEP"; it now infers the nearest year to "now"
  the same way `resolveBcbpJulianDate` already did for BCBP's yearless day-of-year. Note
  this inference is inherently approximate for a ticket scanned many months from its
  travel date (it picks whichever candidate year is *nearest in time* to the scan, with
  no notion of "this is probably a future booking vs. a kept souvenir") — accepted as a
  known tradeoff, same as it already was for BCBP.
- **Airport-to-country table is now a comprehensive, generated dataset** (fixed in
  0.6.0): `src/airportData.ts` covers ~9,056 IATA-coded airports worldwide, generated
  from OurAirports' public-domain data (`node scripts/generate-airport-data.mjs` to
  refresh) — not the ~150-entry Philippines-centric hand-curated table from earlier
  versions, which real testing had already found gaps in (South Africa was entirely
  absent). An unknown code still resolves to `null`, never a guess. The tradeoff: with
  ~9,000 real codes, plenty of ordinary English words are real airport codes somewhere
  (e.g. "THE" is Teresina, Brazil), which widens route-matching's false-positive surface
  versus the old narrow table — accepted per the lessons-learned doc's own warning about
  short/generic-word collisions; a real false positive from this is exactly what
  `fixtures/` exists to catch.
- **The two-unlabeled-dates fallback picks departure/return by document order, not by
  which resolved date is chronologically earlier** (changed in 0.5.0) — deliberate, to
  avoid a narrow but real failure mode where two independently-year-inferred dates that
  are actually about a year apart (e.g. a New Year's-spanning trip) can round to the
  same calendar year depending on scan timing, making the second-listed date resolve
  "earlier" than the first. See the comment above `datesInOrder` in
  `src/textExtraction.ts`.
- **A single overnight leg's own arrival day was wrongly assigned as `returnDate`**
  (fixed in 0.13.0, from a real Singapore Airlines one-way SIN→LHR report): a
  long-haul flight that crosses midnight prints two different calendar dates for one
  flight, the same shape the fallback expects for a genuine departure+return pair. Now
  suppressed only when all three signals agree: the two dates are exactly one day
  apart, the resolved origin and destination both have a recorded same-line local
  time, and the destination's time is earlier in the day than the origin's (i.e.
  crossing midnight) — a real round trip that happens to be a quick one-night trip is
  unaffected, since its own legs won't share that exact combination.
- **Per-line OCR confidence was previously wrong — fixed in 0.6.0.** An earlier version
  of this doc claimed the ~0.0001-range confidence values were just large-vocabulary
  softmax deflation and "not a bug." That explanation was wrong: it was a real
  double-softmax bug (`src/recognize.ts`) — `rec_model.onnx`'s exported graph already
  applies softmax internally, so its output is already a per-class probability
  distribution, and the old code ran softmax on it a second time. Confirmed by
  inspecting the real model's raw output (every timestep's values are non-negative and
  sum to ~1.0) and by re-running OCR on a real image before and after the fix:
  recognized text was unchanged, confidence went from ~0.0001 to 0.89–0.99.
  `RecognizedTextLine.confidence` is now the model's own top-class probability directly.
  It still isn't used to gate or filter anything in `src/textExtraction.ts` (every
  per-field confidence there is a fixed constant), but it's now a value worth trusting
  if you build something that wants one.
- **Dates with zero separators, and a metadata-vs-flight-date distinction, are now
  handled** (fixed in 0.7.0, from a real Philippine Airlines e-ticket PDF: barcode
  scanning worked, but `returnDate` was missing even though the date was clearly on the
  page). Two compounding issues: (1) this airline prints dates like `01Jun2026` with no
  separator at all between month and year — `findFreeTextDateMatch`'s day-month-year
  pattern now accepts that (`monthDayYear`'s separator requirement is unchanged, since no
  real report has demonstrated that gap yet); (2) the same e-ticket page also has an
  issuance date and a fare-validity date alongside the two real flight dates — four
  unique dates, which used to trip the "3+ unlabeled dates is too ambiguous" rule and
  threw away the real return date along with the noise. The unlabeled-date fallback now
  excludes a date match that has a colon earlier in the same line (a general signal of
  "Label: date" metadata, not the bare flight-date table cells) instead of bailing out
  entirely. See the comment above `datesInOrder` in `src/textExtraction.ts`.
- **A duplicate date OCR'd with inconsistent spacing could resolve to two different
  values and get treated as departure+return instead of deduplicated** (fixed in 0.8.0,
  from a real CheapOair one-way booking confirmation). The same physical date was
  printed twice on the ticket (once as a departure header, once next to arrival details,
  since it's a same-day flight) and OCR'd with different spacing: `"Mar20,2019"` (no
  separator) vs. `"Mar 20, 2019"` (spaced). `monthDayYear` required a separator between
  month and day, so the unspaced line fell through to the yearless-date fallback and
  guessed a year near "now" instead of using its own explicit, correctly-printed year —
  producing a *different* string than the spaced line's correct value, which meant the
  two couldn't dedupe and got assigned as departure/return on a ticket that's actually
  one-way. The separator is now optional there too (same fix shape as 0.7.0's
  `dayMonthYear` change for PAL's `"01Jun2026"`). Also worth noting explicitly: this
  scanner does not validate that a departure date is in the future or otherwise judge
  date plausibility — it passes through whatever's printed, and rejecting an
  implausible date is left to the downstream eligibility-matching service.
- **Route matching now also handles "CODE- clock time" printed once per leg, on
  separate lines** (fixed in 0.9.0, same real CheapOair report as the entry above):
  `"YVR- 02:20 pm"` for departure, `"YCG-03:31pm"` for arrival, several lines apart,
  never adjacent and never parenthesized. `src/textExtraction.ts` now also looks for a
  3-letter code directly followed by a clock time anywhere in the document, and — only
  when the other two route patterns found nothing — takes the first two distinct
  table-known codes found this way, in document order, as origin/destination.
- **Route matching now also handles airport codes split across separate OCR lines
  with nothing to anchor on** (fixed in 0.10.0, from a real Asiana "Boarding Pass
  Exchange Coupon"): its wide FROM/TO table got OCR'd as `"MNL"`, a garbled arrow
  glyph, then `"ICN"`, each its own line — not adjacent, not parenthesized, and not
  paired with a time either. `src/textExtraction.ts` now also treats a line whose
  entire trimmed text is nothing but a 3-letter table-known code as a candidate,
  tried only when the other three route patterns find nothing, and only acted on when
  exactly two distinct such codes turn up in the whole document.
- **The code-near-time and bare-code-line fallbacks (0.9.0, 0.10.0) are now one
  combined pass instead of two separate ones** (fixed in 0.12.0, from a real Singapore
  Airlines boarding pass). Both legs on that ticket are printed the same way (a code
  next to its own local time) — it's not two different document layouts, just OCR's
  text-box detection grouping the two legs inconsistently: `"SIN"`/`"20:50"` came back
  as one line, `"MNL"`/`"17:05"` as two separate ones. Running each pattern as its own
  complete pass over the whole document meant each only ever found its one matching
  code, so neither pass's "exactly two" threshold was ever met even with both codes
  present. Both patterns are now checked per line into one merged candidate list, which
  doesn't care which way OCR happened to split a given leg's code and time.
- **Multi-leg BCBP barcodes only yield their first leg.** BCBP encodes additional legs
  (e.g. a connecting flight) via variable-length conditional data this v1 parser doesn't
  walk — see the comment in `src/bcbp.ts`. A round trip is virtually always two separate
  boarding passes/barcodes in practice, so this mainly affects true multi-leg
  connections, not the origin/destination/departure-date extraction this project needs.
- **The OCR-text field extractor (`src/textExtraction.ts`) is a starting point, not a
  general ticket parser.** Ticket layouts are effectively unbounded across issuers (every
  airline, every OTA, every itinerary template) — per the lessons learned from the prior
  ID-scanning project, this should grow from real bug reports and their exact OCR output
  (reproduced in a disposable script, fixed, added to the regression suite), not be
  pre-built to handle every format speculatively. Its current heuristics (route =
  two table-known airport codes joined by a separator; dates = nearest calendar-valid
  date to a "departure"/"return" label, or chronological order when exactly one or two
  unlabeled dates exist; passenger counts = "N adult(s)"/"N child(ren)" regexes) are
  deliberately conservative — no value beats a wrong one — so expect real-world misses on
  formats not yet seen, not wrong values.
- **Default OCR model bucket is inherited from the earlier `id-ocr-web` project**
  (`storage.googleapis.com/idscan_ocr/v1.1/`) — convenient since it's already public,
  but it's infrastructure this repo doesn't own, and its layout has already changed
  shape once (see "Verifying a model/dict pair" above). Host your own copy for a
  production deployment (see Setup above) so this package has no runtime dependency
  outside its control.
- **No production hosting yet for the onnxruntime-web/zxing-wasm/pdfjs-dist wasm and
  worker assets.** The sibling id-ocr-web project only ever used a jsdelivr CDN link for
  onnxruntime-web's wasm, explicitly flagged there as demo-only; no equivalent path was
  ever set up for zxing-wasm or pdfjs-dist. Whoever wires this into the real app needs
  to host all three (see Setup above) — and keep each pinned to the exact npm version
  in `package.json` when doing so.
- **No batching** in the OCR pass — each detected text line runs through the recognition
  model one at a time, same as the prior project. Fine for a single ticket; worth
  batching if latency becomes a concern.
