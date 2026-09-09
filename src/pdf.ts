import * as pdfjsLib from "pdfjs-dist";

/**
 * Points pdf.js at wherever you host its worker script (it ships in
 * `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, or a CDN build). Call once at app
 * startup before the first `rasterizePdf` call — mirrors `configureOrtWasmPaths` and
 * `configureZxingWasmPath`.
 */
export function configurePdfWorker(workerUrl: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

/**
 * Renders each page of a PDF (an e-ticket/itinerary is commonly a 1-3 page PDF) to its
 * own canvas at device-appropriate resolution for OCR/barcode detection. `scale`
 * controls render resolution — 2x roughly matches a decent phone-camera photo's text
 * sharpness for the OCR pipeline and gives barcode decoding enough pixels per module.
 */
export async function rasterizePdf(pdfData: ArrayBuffer | Uint8Array, scale = 2): Promise<HTMLCanvasElement[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  const canvases: HTMLCanvasElement[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");

    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }

  return canvases;
}
