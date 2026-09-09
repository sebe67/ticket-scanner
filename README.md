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
4. **Country lookup**: airport IATA codes resolve to countries via a bundled starter
   table (`src/airportLookup.ts`) — see limitations.

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

// Image input: Blob, HTMLImageElement, HTMLCanvasElement, or ImageBitmap.
const result = await scanTicket(imageBlob);

// PDF input: raw bytes.
const pdfBytes = await pdfFile.arrayBuffer();
const result2 = await scanTicket(pdfBytes);

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

`npm run smoke` is an automated check, not a manual demo: it drives real headless
Chromium (via Playwright) through an actual round trip of the barcode subsystem —
encodes a test BCBP payload to a genuine PDF417 image, decodes it back, parses it, and
resolves country/date — exercising the real `zxing-wasm` WASM runtime rather than just
the pure-logic unit tests in `tests/`. It deliberately doesn't exercise the OCR fallback
path, since that needs a real network fetch of the model weights; run `npm run demo`
with a real ticket for that instead. Run `npm run smoke` after any change that touches
`src/barcode.ts`, `src/bcbp.ts`, `src/dateParsing.ts`, or `src/airportLookup.ts`.

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
- **A ticket printing city names instead of IATA codes gets no route at all.** The first
  real test (a generic boarding-pass mockup showing "MOSCOW"/"NEW YORK") printed city
  names, not 3-letter codes — `src/textExtraction.ts`'s route matcher only recognizes
  codes, so it correctly found nothing rather than guessing a country from an
  unfamiliar city name (locale spelling and same-named cities in different countries
  make that unreliable, per the original lessons-learned doc). Left as a known gap
  rather than fixed, since real airline-issued boarding passes almost always print IATA
  codes (for gate-agent/system use) — worth adding a city-name lookup only if real
  tickets from your actual users turn out to omit codes too.
- **A ticket date with no year at all is now handled** (fixed in 0.4.0, from that same
  real test — see `CHANGELOG.md`): `parseFreeTextDate` used to require an explicit year
  and silently returned nothing for e.g. "17SEP"; it now infers the nearest year to "now"
  the same way `resolveBcbpJulianDate` already did for BCBP's yearless day-of-year.
- **Airport-to-country table is a curated starter set** (`src/airportLookup.ts`),
  covering Philippine airports plus the international destinations most commonly booked
  out of the Philippines — not a complete IATA dataset. An unknown code resolves to
  `null` (no value beats a wrong one), but expect gaps on less-common routes; swap in a
  maintained dataset (e.g. an OurAirports CSV import) once that matters.
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
