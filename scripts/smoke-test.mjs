/**
 * A real-browser (headless Chromium via Playwright) verification of the barcode
 * subsystem: encode -> image -> decode -> BCBP parse -> country/date resolution,
 * exercising the actual zxing-wasm WASM runtime rather than just the pure-logic unit
 * tests in tests/. Deliberately does NOT exercise the OCR fallback path, because that
 * requires fetching the real ~20MB det/rec model weights over the network from
 * whichever bucket `defaultModelConfig()` points at — some sandboxed/CI environments
 * restrict a headless browser's outbound HTTPS in ways that don't affect a real user's
 * browser (this was true of the environment this script was first written in). If this
 * script's OCR coverage ever needs extending, run it somewhere with normal outbound
 * network access first to confirm that's not the environment you're in, then add a
 * similar page.evaluate() calling `scanTicket` on a rendered/decoded test image.
 *
 * Usage: npm run build && npm run smoke
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = Number(process.env.SMOKE_TEST_PORT ?? 8793);
const CONTENT_TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm" };

await build({
  entryPoints: [path.join(__dirname, "smoke-test-entry.ts")],
  bundle: true,
  outfile: path.join(__dirname, "smoke-test-bundle.js"),
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

function buildBcbpHeader({ from, to, julianDay }) {
  return (
    "M1" +
    "SMOKE/TEST".padEnd(20) +
    "E" +
    "SMK123".padEnd(7) +
    from.padEnd(3) +
    to.padEnd(3) +
    "PR".padEnd(3) +
    "421".padEnd(5) +
    String(julianDay).padStart(3, "0") +
    "Y" +
    "012A".padEnd(4) +
    "0023".padEnd(5) +
    "1" +
    "00"
  );
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

let exitCode = 0;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(`[console] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[pageerror] ${err}`));

  await page.goto(`http://localhost:${PORT}/scripts/smoke-test.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

  const today = new Date();
  const bcbpText = buildBcbpHeader({ from: "MNL", to: "NRT", julianDay: dayOfYear(today) });
  const expectedDate = today.toISOString().slice(0, 10);

  // All three formats decodeBarcodes actually reads (src/barcode.ts) — PDF417 for a
  // paper boarding pass, Aztec/QRCode for a mobile/wallet one.
  for (const format of ["PDF417", "Aztec", "QRCode"]) {
    const r = await page.evaluate(([text, fmt]) => window.__runBarcodePipelineTest(text, fmt), [bcbpText, format]);

    const checks = [
      ["a barcode symbol was decoded", r.decodedCount >= 1],
      [`decoded format is ${format}`, r.decodedFormats.includes(format)],
      ["decoded text parsed as BCBP", r.parsed !== null],
      ["round-tripped fromAirport === MNL", r.parsed?.firstLeg?.fromAirport === "MNL"],
      ["round-tripped toAirport === NRT", r.parsed?.firstLeg?.toAirport === "NRT"],
      ["origin country resolved to Philippines", r.originLookup?.country === "Philippines"],
      ["destination country resolved to Japan", r.destinationLookup?.country === "Japan"],
      ["departure date resolved correctly", r.resolvedDepartureDate === expectedDate],
    ];

    console.log(`\n=== ${format} ===`);
    console.log(`BCBP text: "${bcbpText}"`);
    console.log(JSON.stringify(r, null, 2));
    console.log();
    for (const [name, pass] of checks) {
      console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
      if (!pass) exitCode = 1;
    }
  }
  if (logs.length) console.log("\nbrowser logs:\n" + logs.join("\n"));
  console.log(exitCode === 0 ? "\nsmoke test: ALL CHECKS PASSED" : "\nsmoke test: SOME CHECKS FAILED");

  await page.close();
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
