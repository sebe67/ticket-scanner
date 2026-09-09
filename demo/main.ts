import {
  configureOrtWasmPaths,
  configureZxingWasmPath,
  configurePdfWorker,
  scanTicket,
  ENGINE_VERSION,
} from "../dist/index.js";

// Served straight out of node_modules by scripts/build-demo.mjs's dev server (which
// serves the whole repo root, not just demo/) — this is the exact same "host your own
// copy" pattern the README's Setup section recommends for production, just pointed at
// what npm already installed instead of a separately-hosted bucket/CDN. The wasm/worker
// build is therefore always the exact version pinned in package.json, by construction.
configureOrtWasmPaths("/node_modules/onnxruntime-web/dist/");
configureZxingWasmPath("/node_modules/zxing-wasm/dist/reader/");
configurePdfWorker("/node_modules/pdfjs-dist/build/pdf.worker.min.mjs");

const versionEl = document.getElementById("version") as HTMLElement;
versionEl.textContent = ENGINE_VERSION;

const fileInput = document.getElementById("file") as HTMLInputElement;
const scanBtn = document.getElementById("scan") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;
const resultEl = document.getElementById("result") as HTMLElement;

scanBtn.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    statusEl.textContent = "Pick a file first.";
    return;
  }

  scanBtn.disabled = true;
  statusEl.textContent = "Scanning… (first run downloads model/wasm assets, cached after)";
  resultEl.textContent = "";

  try {
    const start = performance.now();
    const input = file.type === "application/pdf" ? await file.arrayBuffer() : file;
    const result = await scanTicket(input, { includeDebugInfo: true });
    const elapsedMs = Math.round(performance.now() - start);

    versionEl.textContent = result.provenance.engineVersion;
    statusEl.textContent = `Done in ${elapsedMs}ms.`;
    resultEl.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    statusEl.textContent = `Error: ${(err as Error).message}`;
    console.error(err);
  } finally {
    scanBtn.disabled = false;
  }
});
