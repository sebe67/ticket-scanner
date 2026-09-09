# Changelog

`package.json`'s `version` and `src/index.ts`'s `ENGINE_VERSION` are bumped together on
every change that touches runtime behavior, so a bug report against a running instance
can always be tied back to the exact code that produced it (`ENGINE_VERSION` is exported
and appears in every `TicketScanResult.provenance`, and in the demo's version badge).

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
