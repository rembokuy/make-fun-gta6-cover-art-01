// Neon Coast Cover Studio — tiny static file server (Node 22+ stdlib only).
// Usage: `node serve.ts` serves app/ at http://localhost:8080.
// Pass `--port N` to listen on another port.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const appDir = resolve(join(fileURLToPath(new URL('.', import.meta.url)), 'app'));

let port = 8080;
const portFlag = process.argv.indexOf('--port');
if (portFlag >= 0) {
  const parsed = Number.parseInt(process.argv[portFlag + 1] ?? '', 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) port = parsed;
}

const server = createServer((req, res) => {
  let rawPath = (req.url ?? '/').split(/[?#]/)[0] ?? '/';
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request\n');
    return;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const resolved = resolve(join(appDir, decoded));
  if (resolved !== appDir && !resolved.startsWith(appDir + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden\n');
    return;
  }
  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found\n');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found\n');
    return;
  }
  const type = MIME[extname(resolved).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  createReadStream(resolved).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Neon Coast Cover Studio at http://localhost:${port}`);
});
