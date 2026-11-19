// Neon Coast screenshot runner: drives the vendored headless Chromium over the
// DevTools protocol (plain Node WebSocket, no dependencies) and takes the four
// screenshots listed in shots.json.
//
//   node scripts/take-shots.mjs
//
// It expects the app already served on http://localhost:8080 (`node serve.ts`).
// For each entry it opens the query, waits for window.__shotReady, then either
// captures the page (mode "page") or waits for the app's own export download
// (mode "export") and records the PNG the app wrote. Raw captures land in
// shots-tmp/; a later step compresses them into screenshots/. Any JavaScript
// error, console error, or network request to a host other than localhost is
// reported and fails the run.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const tmpDir = join(root, 'shots-tmp');
const downloadDir = join(tmpDir, 'downloads');
const profileDir = join(tmpDir, 'profile');
mkdirSync(downloadDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const CHROME = join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const DEBUG_PORT = 9222;
const BASE = 'http://localhost:8080';

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

/** Minimal DevTools client over one WebSocket: send, await, and collect events. */
class DevTools {
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

  send(method, params = {}, sessionId) {
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

  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }
}

async function evaluate(devtools, sessionId, expression) {
  const result = await devtools.send(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function waitFor(devtools, sessionId, expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value = false;
    try {
      value = await evaluate(devtools, sessionId, expression);
    } catch {
      value = false;
    }
    if (value) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
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
    const devtools = new DevTools(ws);

    const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
    await devtools.send('Page.enable', {}, sessionId);
    await devtools.send('Runtime.enable', {}, sessionId);
    await devtools.send('Network.enable', {}, sessionId);
    try {
      await devtools.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
        eventsEnabled: true,
      }, sessionId);
    } catch {
      await devtools.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      }, sessionId);
    }

    for (const shot of shots) {
      await devtools.send('Emulation.setDeviceMetricsOverride', {
        width: shot.w,
        height: shot.h,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
      const beforeDownloads = new Set(readdirSync(downloadDir));
      await devtools.send('Page.navigate', { url: `${BASE}/${shot.query}` }, sessionId);
      await waitFor(devtools, sessionId, 'window.__shotReady === true', `shot ${shot.name}`);

      if (shot.mode === 'page') {
        const { data } = await devtools.send(
          'Page.captureScreenshot',
          { format: 'jpeg', quality: 90 },
          sessionId,
        );
        const raw = join(tmpDir, `raw-${shot.name}`);
        writeFileSync(raw, Buffer.from(data, 'base64'));
        report.shots.push({ name: shot.name, mode: 'page', raw });
      } else {
        await waitFor(devtools, sessionId, 'window.__exportTriggered === true', `export ${shot.name}`);
        let found = null;
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          for (const file of readdirSync(downloadDir)) {
            if (file.endsWith('.png') && !beforeDownloads.has(file) && !file.endsWith('.crdownload')) {
              const full = join(downloadDir, file);
              const size = statSync(full).size;
              if (size > 0) {
                found = full;
                break;
              }
            }
          }
          if (found) break;
          await sleep(300);
        }
        if (!found) throw new Error(`no export download appeared for ${shot.name}`);
        report.shots.push({ name: shot.name, mode: 'export', raw: found });
      }
    }

    for (const event of devtools.drain()) {
      if (event.method === 'Runtime.exceptionThrown') {
        report.exceptions.push(event.params.exceptionDetails?.text ?? 'unknown exception');
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        report.errors.push(event.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (event.method === 'Network.requestWillBeSent') {
        const url = event.params.request?.url ?? '';
        if (/^https?:\/\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
          report.externalRequests.push(url);
        }
      }
    }

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
