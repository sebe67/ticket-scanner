import * as ort from "onnxruntime-web";
import { lookupAirport } from "./airportLookup.js";
import { decodeBarcodes } from "./barcode.js";
import { parseBcbp } from "./bcbp.js";
import { defaultModelConfig, OcrModelConfig } from "./config.js";
import { resolveBcbpJulianDate } from "./dateParsing.js";
import { detectTextLines } from "./detect.js";
import { hashCanvas, ImageInput, toCanvas } from "./imageUtils.js";
import { fetchModelBytes, fetchTextAsset } from "./modelCache.js";
import { rasterizePdf } from "./pdf.js";
import { cropQuadToCanvas } from "./perspective.js";
import { buildCharset, RecCharset, recognizeLine } from "./recognize.js";
import { deriveTripType, extractFieldsFromOcrLines } from "./textExtraction.js";
import type {
  DecodedBarcode,
  RecognizedTextLine,
  TicketField,
  TicketFields,
  TicketScanPageDebugInfo,
  TicketScanPageProvenance,
  TicketScanProvenance,
  TicketScanResult,
} from "./types.js";

export const ENGINE_VERSION = "ticket-scanner/bcbp+ppocrv5-mobile-onnxruntime-web@0.8.0";
const REC_LINE_HEIGHT = 48;

/**
 * Point onnxruntime-web at wherever you host its .wasm binaries. Call once at app
 * startup.
 *
 * The hosted `.wasm` binary MUST be from the exact same `onnxruntime-web` version as
 * the JS bindings this package was built against (currently pinned to `1.29.0` in
 * `package.json` — deliberately an exact version, not a range, for this reason). A
 * version mismatch between the two throws opaque, hard-to-diagnose errors at model-load
 * time rather than a clear "version mismatch" message — this bit the sibling id-ocr-web
 * project during its own onnxruntime-web integration. If you bump `onnxruntime-web`
 * here, re-host the matching `.wasm` build at the same time. The same rule applies to
 * `configureZxingWasmPath` and `configurePdfWorker` below, for their own wasm/worker
 * assets.
 */
export function configureOrtWasmPaths(pathOrUrl: string): void {
  ort.env.wasm.wasmPaths = pathOrUrl;
}

export { configureZxingWasmPath } from "./barcode.js";
export { configurePdfWorker } from "./pdf.js";

let detSessionPromise: Promise<ort.InferenceSession> | undefined;
let recSessionPromise: Promise<ort.InferenceSession> | undefined;
let charsetPromise: Promise<RecCharset> | undefined;

/** Lazily loads (and memoizes) the det/rec sessions and charset for the life of the page. */
function getSessions(config: OcrModelConfig) {
  detSessionPromise ??= fetchModelBytes(config.detModelUrl).then((buf) =>
    ort.InferenceSession.create(buf, { executionProviders: ["wasm"] })
  );
  recSessionPromise ??= fetchModelBytes(config.recModelUrl).then((buf) =>
    ort.InferenceSession.create(buf, { executionProviders: ["wasm"] })
  );
  charsetPromise ??= fetchTextAsset(config.keysUrl).then(buildCharset);
  return { det: detSessionPromise, rec: recSessionPromise, charset: charsetPromise };
}

async function runOcrLines(canvas: HTMLCanvasElement, config: OcrModelConfig): Promise<RecognizedTextLine[]> {
  const { det, rec, charset } = getSessions(config);
  const [detSession, recSession, recCharset] = await Promise.all([det, rec, charset]);

  const detectedLines = await detectTextLines(detSession, canvas);
  const lines: RecognizedTextLine[] = [];
  for (const line of detectedLines) {
    const xs = line.corners.map((p) => p.x);
    const ys = line.corners.map((p) => p.y);
    const boundingBox: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

    const rectHeight = Math.max(1, Math.hypot(line.corners[3].x - line.corners[0].x, line.corners[3].y - line.corners[0].y));
    const rectWidth = Math.max(1, Math.hypot(line.corners[1].x - line.corners[0].x, line.corners[1].y - line.corners[0].y));
    const outWidth = Math.max(REC_LINE_HEIGHT, Math.round(REC_LINE_HEIGHT * (rectWidth / rectHeight)));

    const lineCanvas = cropQuadToCanvas(canvas, line.corners, outWidth, REC_LINE_HEIGHT);
    const recognized = await recognizeLine(recSession, lineCanvas, recCharset);
    if (!recognized.text) continue;
    lines.push({ text: recognized.text, confidence: recognized.confidence, boundingBox });
  }
  return lines;
}

const FIELD_KEYS: (keyof TicketFields)[] = [
  "originCountry",
  "destinationCountry",
  "departureDate",
  "returnDate",
  "adults",
  "children",
  "tripType",
];

/** Combines several partial field sets (barcode vs. OCR, or one per PDF page), keeping the higher-confidence value per field. */
function mergeTicketFields(...results: TicketFields[]): TicketFields {
  const merged: TicketFields = {};
  for (const fields of results) {
    for (const key of FIELD_KEYS) {
      const candidate = fields[key] as TicketField<unknown> | undefined;
      if (!candidate) continue;
      const existing = merged[key] as TicketField<unknown> | undefined;
      if (!existing || candidate.confidence > existing.confidence) {
        (merged as Record<string, unknown>)[key] = candidate;
      }
    }
  }
  return merged;
}

interface PageScanResult {
  fields: TicketFields;
  imageHash: string;
  barcodeFound: boolean;
  barcodeFormat?: string;
  rawOcrText: string;
  lines: RecognizedTextLine[];
  barcodes: DecodedBarcode[];
}

/**
 * Barcode-first, OCR-fallback per page: a decoded, BCBP-shaped barcode payload is exact
 * and deterministic (IATA-standardized bytes, no recognition noise), so it always wins
 * over an OCR-derived guess for the same field on the same page. OCR still runs
 * unconditionally to fill in what a boarding-pass barcode never carries anyway (return
 * date, passenger counts) and to cover documents with no barcode at all.
 */
async function scanOnePage(canvas: HTMLCanvasElement, config: OcrModelConfig): Promise<PageScanResult> {
  const imageHash = await hashCanvas(canvas);
  const barcodes = await decodeBarcodes(canvas);

  const bcbpFields: TicketFields = {};
  let barcodeFound = false;
  let barcodeFormat: string | undefined;

  for (const barcode of barcodes) {
    const parsed = parseBcbp(barcode.text);
    if (!parsed) continue;

    barcodeFound = true;
    barcodeFormat = barcode.format;

    const origin = lookupAirport(parsed.firstLeg.fromAirport);
    const destination = lookupAirport(parsed.firstLeg.toAirport);
    if (origin) bcbpFields.originCountry = { value: origin.country, confidence: 0.97, source: "barcode" };
    if (destination) bcbpFields.destinationCountry = { value: destination.country, confidence: 0.97, source: "barcode" };

    const departureDate = resolveBcbpJulianDate(parsed.firstLeg.julianDayOfYear);
    if (departureDate) bcbpFields.departureDate = { value: departureDate, confidence: 0.9, source: "barcode" };

    break; // a boarding pass carries exactly one BCBP payload; the first valid one wins
  }

  const lines = await runOcrLines(canvas, config);
  const ocrExtracted = extractFieldsFromOcrLines(lines);
  const ocrFields: TicketFields = {};

  if (ocrExtracted.originAirport) {
    const info = lookupAirport(ocrExtracted.originAirport);
    if (info) ocrFields.originCountry = { value: info.country, confidence: 0.7, source: "ocr" };
  }
  if (ocrExtracted.destinationAirport) {
    const info = lookupAirport(ocrExtracted.destinationAirport);
    if (info) ocrFields.destinationCountry = { value: info.country, confidence: 0.7, source: "ocr" };
  }
  if (ocrExtracted.departureDate) ocrFields.departureDate = ocrExtracted.departureDate;
  if (ocrExtracted.returnDate) ocrFields.returnDate = ocrExtracted.returnDate;
  if (ocrExtracted.adults) ocrFields.adults = ocrExtracted.adults;
  if (ocrExtracted.children) ocrFields.children = ocrExtracted.children;

  return {
    fields: mergeTicketFields(bcbpFields, ocrFields),
    imageHash,
    barcodeFound,
    barcodeFormat,
    rawOcrText: lines.map((l) => l.text).join("\n"),
    lines,
    barcodes,
  };
}

export type ScanInput = ImageInput | ArrayBuffer | Uint8Array;

export interface ScanTicketOptions {
  modelConfig?: OcrModelConfig;
  /**
   * Include the raw per-page OCR lines and decoded barcode payloads in the result.
   * Off by default — turn it on when capturing a regression fixture from a real report
   * (see fixtures/README.md), not for normal calls.
   */
  includeDebugInfo?: boolean;
}

function isPdfInput(input: ScanInput): input is ArrayBuffer | Uint8Array {
  return input instanceof ArrayBuffer || input instanceof Uint8Array;
}

/**
 * Runs the full on-device pipeline (barcode decode + BCBP parse, then OCR fallback) on
 * a plane ticket — a photo/screenshot (`ImageInput`) or a PDF e-ticket/itinerary (raw
 * bytes as `ArrayBuffer`/`Uint8Array`). Everything happens locally in the browser via
 * onnxruntime-web (WASM) and zxing-wasm; the image/PDF never leaves the device, and the
 * only network calls are the initial (cached) model/wasm downloads.
 *
 * A PDF's pages are each scanned independently and merged by per-field confidence (e.g.
 * one page might carry the printed itinerary, another an embedded boarding-pass
 * barcode).
 */
export async function scanTicket(input: ScanInput, options: ScanTicketOptions = {}): Promise<TicketScanResult> {
  const config = options.modelConfig ?? defaultModelConfig();

  const canvases = isPdfInput(input) ? await rasterizePdf(input) : [await toCanvas(input)];
  if (canvases.length === 0) throw new Error("ticket-scanner: input produced no pages to scan");

  const pageResults = await Promise.all(canvases.map((canvas) => scanOnePage(canvas, config)));

  const fields = mergeTicketFields(...pageResults.map((p) => p.fields));
  const tripType = deriveTripType(fields);
  if (tripType) fields.tripType = tripType;

  const pages: TicketScanPageProvenance[] = pageResults.map((p) => ({
    imageHash: p.imageHash,
    barcodeFound: p.barcodeFound,
    barcodeFormat: p.barcodeFormat,
    rawOcrText: p.rawOcrText,
  }));
  const provenance: TicketScanProvenance = {
    inputKind: isPdfInput(input) ? "pdf" : "image",
    engineVersion: ENGINE_VERSION,
    pages,
  };

  const debug: TicketScanPageDebugInfo[] | undefined = options.includeDebugInfo
    ? pageResults.map((p) => ({ lines: p.lines, barcodes: p.barcodes }))
    : undefined;

  return debug ? { fields, provenance, debug } : { fields, provenance };
}

export type { ImageInput } from "./imageUtils.js";
export { defaultModelConfig } from "./config.js";
export type { OcrModelConfig } from "./config.js";
export type {
  DecodedBarcode,
  FieldSource,
  RecognizedTextLine,
  TicketField,
  TicketFields,
  TicketScanPageDebugInfo,
  TicketScanPageProvenance,
  TicketScanProvenance,
  TicketScanResult,
} from "./types.js";
