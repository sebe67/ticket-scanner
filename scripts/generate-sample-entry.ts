import { writeBarcodeToImageFile } from "zxing-wasm/writer";
import { setZXingModuleOverrides as setWriterOverrides } from "zxing-wasm/writer";

setWriterOverrides({ locateFile: (p: string) => `/node_modules/zxing-wasm/dist/writer/${p}` });

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

interface SampleParams {
  passengerName: string; // "SURNAME/GIVEN"
  pnr: string;
  fromAirport: string; // 3-letter IATA
  fromCity: string;
  toAirport: string;
  toCity: string;
  carrier: string; // 2-letter
  flightNumber: string;
  julianDayOfYear: number;
  displayDate: string; // e.g. "16 SEP 2026"
  seat: string;
  gate: string;
  boardingTime: string;
  /** "PDF417" (paper boarding passes) or "Aztec"/"QRCode" (mobile/wallet boarding passes) — see src/barcode.ts's decodeBarcodes, which reads all three. */
  format: "PDF417" | "Aztec" | "QRCode";
}

function buildBcbpHeader(p: SampleParams): string {
  return (
    "M1" +
    p.passengerName.padEnd(20) +
    "E" +
    p.pnr.padEnd(7) +
    p.fromAirport.padEnd(3) +
    p.toAirport.padEnd(3) +
    p.carrier.padEnd(3) +
    p.flightNumber.padEnd(5) +
    String(p.julianDayOfYear).padStart(3, "0") +
    "Y" +
    "014A".padEnd(4) +
    "0045".padEnd(5) +
    "1" +
    "00"
  );
}

/**
 * Renders a synthetic (clearly not a real airline's) boarding pass with a genuine,
 * scannable barcode encoding valid BCBP data matching the printed fields — for
 * exercising both the barcode-first path and the OCR fallback (the printed IATA codes
 * let route matching succeed even if the barcode region were cropped out or damaged).
 *
 * `format` picks PDF417 (a wide rectangle, how paper boarding passes are printed) or
 * Aztec/QRCode (square, how mobile/wallet boarding passes are typically encoded) — all
 * three are read by src/barcode.ts's decodeBarcodes, but until this was added only the
 * PDF417 path had ever been exercised against a generated (let alone real) image.
 */
(window as unknown as Record<string, unknown>).__generateSampleTicket = async (params: SampleParams) => {
  const bcbpText = buildBcbpHeader(params);
  const isSquareFormat = params.format !== "PDF417";
  const barcodeWidth = isSquareFormat ? 300 : 380;
  const barcodeHeight = isSquareFormat ? 300 : 110;
  const written = await writeBarcodeToImageFile(bcbpText, { format: params.format, width: barcodeWidth, height: barcodeHeight, margin: 8 });
  if (!written.image) throw new Error(`writeBarcodeToImageFile failed: ${written.error}`);
  const barcodeImg = await blobToImage(written.image);

  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = isSquareFormat ? 780 : 600;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#0a3d62";
  ctx.fillRect(0, 0, canvas.width, 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(isSquareFormat ? "MOBILE BOARDING PASS" : "BOARDING PASS", 40, 58);
  ctx.font = "20px sans-serif";
  ctx.fillText("SAMPLE AIRLINE — TEST DATA ONLY, NOT A REAL TICKET", 40, 82);

  ctx.fillStyle = "#111111";
  ctx.font = "22px monospace";
  let y = 150;
  const lh = 46;
  const col1 = 40;
  const col2 = 520;

  ctx.fillText(`PASSENGER: ${params.passengerName.replace("/", " / ")}`, col1, y);
  y += lh;
  ctx.fillText(`FROM: ${params.fromAirport} - ${params.fromCity}`, col1, y);
  ctx.fillText(`TO: ${params.toAirport} - ${params.toCity}`, col2, y);
  y += lh;
  ctx.fillText(`FLIGHT: ${params.carrier}${params.flightNumber}`, col1, y);
  ctx.fillText(`DATE: ${params.displayDate}`, col2, y);
  y += lh;
  ctx.fillText(`SEAT: ${params.seat}`, col1, y);
  ctx.fillText(`GATE: ${params.gate}`, col2, y);
  y += lh;
  ctx.fillText(`BOARDING TIME: ${params.boardingTime}`, col1, y);
  y += lh;
  ctx.fillText(`${params.fromAirport} - ${params.toAirport}`, col1, y);

  const barcodeX = isSquareFormat ? (canvas.width - barcodeWidth) / 2 : 40;
  ctx.drawImage(barcodeImg, barcodeX, 430, barcodeWidth, barcodeHeight);
  ctx.font = "14px monospace";
  ctx.fillStyle = "#555555";
  ctx.fillText(`${params.format} — decodable by this project's barcode subsystem`, 40, 430 + barcodeHeight + 30);

  const outBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(outBlob);
  });
};

(window as unknown as Record<string, unknown>).__ready = true;
