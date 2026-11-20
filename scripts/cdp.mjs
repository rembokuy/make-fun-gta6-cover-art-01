// Minimal Chrome DevTools Protocol client over a plain Node WebSocket.
// No dependencies: node:http for the upgrade handshake, node:crypto for
// the key and frame masks, node:net for the socket.

import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

function httpJson(method, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(text);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function waitForHttp(port, path, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const out = await httpJson('GET', port, path);
      if (out) return out;
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`DevTools on port ${port} did not answer in ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function createTarget(port, url) {
  return httpJson('PUT', port, `/json/new?${encodeURIComponent(url)}`);
}

export async function closeTarget(port, id) {
  try {
    await httpJson('GET', port, `/json/close/${id}`);
  } catch { /* already gone */ }
}

class Ws {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.handlers = new Set();
    socket.on('data', (chunk) => this.onData(chunk));
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      if (this.buffer.length < 2) return;
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        len = Number(this.buffer.readBigUInt64BE(2));
        off = 10;
      }
      if (this.buffer.length < off + len) return;
      const payload = this.buffer.subarray(off, off + len);
      this.buffer = this.buffer.subarray(off + len);
      if (opcode === 9) {
        this.sendRaw(0x8a, payload); // pong
        continue;
      }
      if (opcode === 8) continue; // close
      if (opcode === 0 || opcode === 1 || opcode === 2) {
        this.fragments.push(payload);
        if (fin) {
          const message = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          for (const h of this.handlers) h(message);
        }
      }
    }
  }

  sendRaw(firstByte, payload) {
    const mask = randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([firstByte, 0x80 | len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = firstByte;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = firstByte;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  sendText(text) {
    this.sendRaw(0x81, Buffer.from(text, 'utf8'));
  }

  onMessage(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function connectWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(wsUrl);
    const key = randomBytes(16).toString('base64');
    const req = http.request({
      host: url.hostname,
      port: Number(url.port),
      path: `${url.pathname}${url.search}`,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (res, socket) => {
      const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if ((res.headers['sec-websocket-accept'] ?? '') !== accept) {
        socket.destroy();
        reject(new Error('WebSocket handshake failed'));
        return;
      }
      resolve(new Ws(socket));
    });
    req.on('error', reject);
    req.end();
  });
}

// A CDP session: send() awaits the reply with the same id; onEvent
// registers a listener for method events (Runtime.*, Network.*, ...).
export class Session {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    ws.onMessage((message) => {
      let data;
      try {
        data = JSON.parse(message);
      } catch {
        return;
      }
      if (data.id !== undefined && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(`CDP ${data.method ?? ''}: ${data.error.message}`));
        else resolve(data.result ?? {});
      } else if (data.method) {
        const listeners = this.events.get(data.method) ?? [];
        for (const fn of listeners) fn(data.params ?? {});
      }
    });
  }

  on(method, fn) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.sendText(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`);
    }
    return result.result?.value;
  }

  async waitFor(expression, timeoutMs = 30000, pollMs = 250) {
    const start = Date.now();
    for (;;) {
      let value = false;
      try {
        value = await this.evaluate(expression);
      } catch { /* keep waiting */ }
      if (value) return true;
      if (Date.now() - start > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
