// Minimal headless-Chrome driver over the DevTools protocol.
// No dependencies: plain fetch for the HTTP endpoints and the
// built-in WebSocket client for the debugger session.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/opt/meta-chromium/chrome',
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error('no Chrome binary found; set CHROME_BIN');
}

async function waitHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export async function launchChrome(debugPort) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'neon-coast-chrome-'));
  const proc = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    'about:blank',
  ], { stdio: 'ignore' });
  const up = await waitHttp('http://127.0.0.1:' + debugPort + '/json/version');
  if (!up) {
    proc.kill('SIGKILL');
    throw new Error('Chrome did not open its DevTools port');
  }
  return proc;
}

export class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.listeners.get(msg.method) ?? [];
        for (const fn of list) fn(msg.params ?? {});
      }
    };
  }

  static async open(debugPort) {
    const res = await fetch('http://127.0.0.1:' + debugPort + '/json/new?url=' + encodeURIComponent('about:blank'), { method: 'PUT' });
    const target = await res.json();
    const ws = new Cdp(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.ws.onopen = resolve;
      ws.ws.onerror = reject;
    });
    return ws;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    const list = this.listeners.get(method) ?? [];
    list.push(fn);
    this.listeners.set(method, list);
  }

  waitFor(method, predicate, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for ' + method)), timeoutMs);
      this.on(method, (params) => {
        if (!predicate || predicate(params)) {
          clearTimeout(timer);
          resolve(params);
        }
      });
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error('page threw: ' + JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
    }
    return result.result?.value;
  }

  async screenshot(format = 'jpeg', quality = 80) {
    const shot = await this.send('Page.captureScreenshot', { format, quality });
    return Buffer.from(shot.data, 'base64');
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

export async function startServer(repoDir, port) {
  const proc = spawn(process.execPath, ['serve.ts'], {
    cwd: repoDir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const up = await waitHttp('http://127.0.0.1:' + port + '/');
  if (!up) {
    proc.kill('SIGKILL');
    throw new Error('dev server did not come up on port ' + port);
  }
  return proc;
}

export function stop(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
}
