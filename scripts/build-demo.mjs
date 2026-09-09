import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const demoDir = path.join(root, "demo");

await build({
  entryPoints: [path.join(demoDir, "main.ts")],
  bundle: true,
  outfile: path.join(demoDir, "dist/bundle.js"),
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
});

console.log("Bundled demo/dist/bundle.js");

if (process.argv.includes("--serve")) {
  const port = Number(process.env.PORT ?? 8787);
  const CONTENT_TYPES = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".wasm": "application/wasm", ".mjs": "text/javascript" };

  // Serves the whole repo root (not just demo/) so demo/main.ts can load
  // onnxruntime-web/zxing-wasm/pdfjs-dist's wasm/worker assets straight out of
  // node_modules via root-relative paths, instead of depending on a CDN.
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const filePath = path.join(root, urlPath === "/" ? "demo/index.html" : urlPath);

    // Guard against a request path escaping the repo root (e.g. "../../etc/passwd").
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const data = await readFile(filePath);
      const type = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => console.log(`Demo running at http://localhost:${port}/`));
}
