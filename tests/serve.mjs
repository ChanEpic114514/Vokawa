// A static host to verify production builds at both root and GitHub Pages subpaths.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
const types = {
  ".wasm": "application/wasm",
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".wav": "audio/wav",
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let name = decodeURIComponent(url.pathname).replace(/^\/Vokawa(?=\/)/, "");
    if (name.endsWith("/")) name += "index.html";
    const file = path.resolve(root, "." + name);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const bytes = await fs.readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        .end(bytes);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(4173, "127.0.0.1");
