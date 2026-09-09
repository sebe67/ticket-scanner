/**
 * Generates sample-tickets/boarding-pass-sample.png: a synthetic (not a real airline's)
 * boarding pass image with a genuine, scannable PDF417 barcode encoding valid BCBP data,
 * for testing this project's demo (`npm run demo`) without needing a real ticket. The
 * flight date is always "7 days from today" so the sample never goes stale.
 *
 * Usage: node scripts/generate-sample-ticket.mjs
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = Number(process.env.GENERATE_SAMPLE_PORT ?? 8794);
const CONTENT_TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm" };

await build({
  entryPoints: [path.join(__dirname, "generate-sample-entry.ts")],
  bundle: true,
  outfile: path.join(__dirname, "generate-sample-bundle.js"),
  format: "esm",
  platform: "browser",
  target: "es2020",
});

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const flightDate = new Date();
flightDate.setUTCDate(flightDate.getUTCDate() + 7);
const displayDate = `${flightDate.getUTCDate()} ${MONTH_NAMES[flightDate.getUTCMonth()]} ${flightDate.getUTCFullYear()}`;

const params = {
  passengerName: "DELACRUZ/JUAN",
  pnr: "ABC123",
  fromAirport: "MNL",
  fromCity: "MANILA",
  toAirport: "NRT",
  toCity: "TOKYO NARITA",
  carrier: "PR",
  flightNumber: "421",
  julianDayOfYear: dayOfYear(flightDate),
  displayDate,
  seat: "14A",
  gate: "B05",
  boardingTime: "17:35",
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/scripts/generate-sample.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

  const base64Png = await page.evaluate((p) => window.__generateSampleTicket(p), params);

  const outDir = path.join(root, "sample-tickets");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "boarding-pass-sample.png");
  await writeFile(outPath, Buffer.from(base64Png, "base64"));

  console.log(`Wrote ${outPath}`);
  console.log(`Route: ${params.fromAirport} -> ${params.toAirport}, flight ${params.carrier}${params.flightNumber}, date ${params.displayDate}`);

  await page.close();
} finally {
  await browser.close();
  server.close();
}
