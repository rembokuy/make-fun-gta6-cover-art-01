// A tiny static file server for local development: `node serve.ts` serves
// app/ at http://localhost:8080, or another port with `--port N`.
// Node 22+ standard library only; nothing here talks to the network.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(join(fileURLToPath(new URL('.', import.meta.url)), 'app'));

// Extension -> Content-Type. Anything not listed is served as a binary blob.
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

const DEFAULT_TYPE = 'application/octet-stream';

// `--port N` (or `--port=N`) picks the listen port; default 8080.
function pickPort(argv) {
  const fallback = 8080;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    } else if (arg.startsWith('--port=')) {
      const n = Number.parseInt(arg.slice('--port='.length), 10);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  return fallback;
}

const port = pickPort(process.argv.slice(2));

const server = createServer((req, res) => {
  let pathname;
  try {
    // A request line the URL parser cannot read is a bad request, not a file.
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('400 bad request\n');
    return;
  }

  // A trailing slash names the directory's index page.
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside app/ and refuse anything that climbs out of it.
  const file = resolve(rootDir, `.${sep}${pathname.replace(/^\//, '')}`);
  if (file !== rootDir && !file.startsWith(rootDir + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 forbidden\n');
    return;
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 not found\n');
    return;
  }

  const type = MIME[extname(file).toLowerCase()] ?? DEFAULT_TYPE;
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
});

// Loopback only: this server is a local preview, never a public host.
server.listen(port, '127.0.0.1', () => {
  console.log(`Neon Coast Cover Studio at http://localhost:${port}`);
});
