import { writeBarcodeToImageFile } from "zxing-wasm/writer";
import { setZXingModuleOverrides as setReaderOverrides } from "zxing-wasm/reader";
import { setZXingModuleOverrides as setWriterOverrides } from "zxing-wasm/writer";
import { decodeBarcodes } from "../dist/barcode.js";
import { parseBcbp } from "../dist/bcbp.js";
import { lookupAirport } from "../dist/airportLookup.js";
import { resolveBcbpJulianDate } from "../dist/dateParsing.js";
import { toCanvas } from "../dist/imageUtils.js";

// Local node_modules, not a CDN — see the "host your own copy" note on
// configureOrtWasmPaths in src/index.ts and the demo's own setup in demo/main.ts.
setReaderOverrides({ locateFile: (p: string) => `/node_modules/zxing-wasm/dist/reader/${p}` });
setWriterOverrides({ locateFile: (p: string) => `/node_modules/zxing-wasm/dist/writer/${p}` });

/**
 * A real, offline (no network) round trip through the actual barcode subsystem in a
 * real browser: encode BCBP text to a genuine barcode PNG (zxing-wasm/writer) -> draw it
 * to a canvas -> decode it back (zxing-wasm/reader, the same code path scanTicket uses)
 * -> parse the decoded text as BCBP -> resolve country/date. This is everything
 * scanTicket's barcode-first path does, minus the OCR fallback — the OCR path needs the
 * real model weights fetched over the network, which this script deliberately doesn't
 * attempt (see scripts/smoke-test.mjs's header comment for why, and demo/ for how to
 * test the OCR path against a real ticket on a machine with normal internet access).
 *
 * `format` runs this against all three formats src/barcode.ts's decodeBarcodes reads
 * (PDF417 for paper boarding passes, Aztec/QRCode for mobile/wallet ones) — until this
 * was added, only PDF417 had ever actually been exercised end-to-end.
 */
(window as unknown as Record<string, unknown>).__runBarcodePipelineTest = async (bcbpText: string, format: "PDF417" | "Aztec" | "QRCode") => {
  const isSquareFormat = format !== "PDF417";
  const written = await writeBarcodeToImageFile(
    bcbpText,
    isSquareFormat ? { format, width: 300, height: 300, margin: 10 } : { format, width: 480, height: 160, margin: 10 }
  );
  if (!written.image) throw new Error(`writeBarcodeToImageFile failed: ${written.error}`);

  const canvas = await toCanvas(written.image);
  const decoded = await decodeBarcodes(canvas);
  const bcbpCandidate = decoded.find((d: { text: string }) => parseBcbp(d.text) !== null);
  const parsed = bcbpCandidate ? parseBcbp(bcbpCandidate.text) : null;

  return {
    decodedCount: decoded.length,
    decodedFormats: decoded.map((d: { format: string }) => d.format),
    matchedBarcodeText: bcbpCandidate?.text ?? null,
    parsed,
    originLookup: parsed ? lookupAirport(parsed.firstLeg.fromAirport) : null,
    destinationLookup: parsed ? lookupAirport(parsed.firstLeg.toAirport) : null,
    resolvedDepartureDate: parsed ? resolveBcbpJulianDate(parsed.firstLeg.julianDayOfYear) : null,
  };
};

(window as unknown as Record<string, unknown>).__ready = true;
