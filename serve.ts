// Tiny static server for local development: `node serve.ts [--port N]`.
// Serves the app/ folder on http://localhost:8080 (loopback only).

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("./app", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

function portFromArgs() {
  const idx = process.argv.indexOf("--port");
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return 8080;
}

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad request");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = resolve(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
    return;
  }

  let stat;
  try {
    stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

const port = portFromArgs();
server.listen(port, "127.0.0.1", () => {
  console.log(`Neon Coast Cover Studio at http://localhost:${port}`);
});
