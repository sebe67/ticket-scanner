import { readBarcodesFromImageData, setZXingModuleOverrides } from "zxing-wasm/reader";

/**
 * Points zxing-wasm at wherever you host its `zxing_reader.wasm` binary (it ships in
 * `node_modules/zxing-wasm/dist/reader/`, or use a CDN build). Call once at app startup
 * before the first `decodeBarcodes` call — mirrors `configureOrtWasmPaths` for the OCR
 * models.
 */
export function configureZxingWasmPath(wasmDirUrl: string): void {
  const base = wasmDirUrl.endsWith("/") ? wasmDirUrl : `${wasmDirUrl}/`;
  setZXingModuleOverrides({
    locateFile: (path: string) => `${base}${path}`,
  });
}

export interface DecodedBarcode {
  text: string;
  format: string;
}

/**
 * Decodes every barcode/QR symbol found in the image. A boarding pass's IATA BCBP data
 * can be carried in PDF417 (the common case), Aztec, or QR Code depending on the
 * issuing carrier — all three are tried. Returns every decoded symbol (usually zero or
 * one on a real boarding pass); the caller tries each payload against the BCBP parser
 * rather than this module guessing which symbol is "the" boarding-pass barcode.
 */
export async function decodeBarcodes(canvas: HTMLCanvasElement): Promise<DecodedBarcode[]> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const results = await readBarcodesFromImageData(imageData, {
    formats: ["PDF417", "Aztec", "QRCode"],
    tryHarder: true,
  });

  return results.filter((r) => r.text.length > 0).map((r) => ({ text: r.text, format: r.format }));
}
