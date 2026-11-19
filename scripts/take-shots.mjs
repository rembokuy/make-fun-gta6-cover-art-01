// Neon Coast screenshot runner: takes the four screenshots listed in
// shots.json with the vendored headless Chromium, driven over the DevTools
// protocol (plain Node WebSocket, no dependencies).
//
//   node scripts/take-shots.mjs
//
// It expects the app already served on http://localhost:8080 (`node serve.ts`).
// For each shot it opens the query at the shot's viewport, waits for
// window.__shotReady, then captures the page as JPEG straight into
// screenshots/. The JPEG quality starts at 88 and steps down until the file
// fits the 256 KiB cap. Any JavaScript error, console error, or network
// request to a host other than localhost is reported and fails the run.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const shotDir = join(root, 'screenshots');
const profileDir = join(root, 'shots-tmp', 'profile');
mkdirSync(shotDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const CHROME = join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const DEBUG_PORT = 9222;
const BASE = 'http://localhost:8080';
const MAX_BYTES = 262144;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  throw new Error('Chromium DevTools did not come up');
}

/** A small DevTools client over one WebSocket: send, await, collect events. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result ?? {});
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  call(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /** Takes the buffered events out, leaving an empty list behind. */
  takeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}

async function evalJs(cdp, sessionId, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function waitUntil(cdp, sessionId, expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value = false;
    try {
      value = await evalJs(cdp, sessionId, expression);
    } catch {
      value = false;
    }
    if (value) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

/** Captures the page as JPEG, stepping the quality down until it fits the cap. */
async function captureFitting(cdp, sessionId, shot) {
  let quality = 88;
  for (;;) {
    const { data } = await cdp.call(
      'Page.captureScreenshot',
      { format: 'jpeg', quality },
      sessionId,
    );
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length <= MAX_BYTES || quality <= 55) return { bytes, quality };
    quality -= 8;
  }
}

/** Sorts a batch of CDP events into errors, exceptions and outside requests. */
function classify(events, into) {
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      into.exceptions.push(event.params.exceptionDetails?.text ?? 'unknown exception');
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      into.errors.push(event.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (event.method === 'Network.requestWillBeSent') {
      const url = event.params.request?.url ?? '';
      if (/^https?:\/\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
        into.externalRequests.push(url);
      }
    }
  }
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chromium not found at ${CHROME}`);
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const report = { shots: [], errors: [], exceptions: [], externalRequests: [] };
  try {
    const version = await waitForDebugger();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const cdp = new Cdp(ws);

    const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
    await cdp.call('Page.enable', {}, sessionId);
    await cdp.call('Runtime.enable', {}, sessionId);
    await cdp.call('Network.enable', {}, sessionId);

    for (const shot of shots) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: shot.w,
        height: shot.h,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
      await cdp.call('Page.navigate', { url: `${BASE}/${shot.query}` }, sessionId);
      await waitUntil(cdp, sessionId, 'window.__shotReady === true', `shot ${shot.name}`);
      const { bytes, quality } = await captureFitting(cdp, sessionId, shot);
      const dest = join(shotDir, shot.name);
      writeFileSync(dest, bytes);
      report.shots.push({ name: shot.name, bytes: bytes.length, quality, w: shot.w, h: shot.h });
      classify(cdp.takeEvents(), report);
    }
    classify(cdp.takeEvents(), report);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.exceptions.length > 0 || report.errors.length > 0 || report.externalRequests.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
