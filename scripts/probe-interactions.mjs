// Neon Coast interaction probe: loads the plain editor (no ?shot=), switches
// a layout and a grade, checks undo becomes available, clicks "Export all 3
// sizes" and checks that three PNGs are downloaded. Reports JS errors and any
// network request to a host other than localhost.
//
// Run while `node serve.ts` is up:
//   node scripts/probe-interactions.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tmpDir = join(root, 'shots-tmp');
const downloadDir = join(tmpDir, 'downloads');
const profileDir = join(tmpDir, 'profile-probe');
mkdirSync(downloadDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const CHROME = join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const DEBUG_PORT = 9223;
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
}

async function evalJs(cdp, sessionId, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function waitUntil(cdp, sessionId, expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let ok = false;
    try {
      ok = await evalJs(cdp, sessionId, expression);
    } catch {
      ok = false;
    }
    if (ok) return;
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

  const checks = {};
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
    try {
      await cdp.call('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
        eventsEnabled: true,
      }, sessionId);
    } catch {
      await cdp.call('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      }, sessionId);
    }

    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    const before = new Set(readdirSync(downloadDir));
    await cdp.call('Page.navigate', { url: 'http://localhost:8080/' }, sessionId);
    await waitUntil(cdp, sessionId, `document.querySelectorAll('#filmstrip .thumb').length === 2`, 'samples loaded');
    checks.samplesLoaded = true;

    // Switch layout to Nine-Panel Grid and grade to Turbo Teal.
    checks.layoutSwitched = await evalJs(cdp, sessionId, `(() => {
      const b = [...document.querySelectorAll('#layouts .pick')].find((x) => x.textContent === 'Nine-Panel Grid');
      if (!b) return false;
      b.click();
      return b.classList.contains('active');
    })()`);
    checks.gradeSwitched = await evalJs(cdp, sessionId, `(() => {
      const b = [...document.querySelectorAll('#grades .swatch')].find((x) => x.title === 'Turbo Teal');
      if (!b) return false;
      b.click();
      return b.classList.contains('active');
    })()`);
    checks.undoEnabled = await evalJs(cdp, sessionId, `!document.getElementById('undo').disabled`);

    // Export all three sizes and wait for the downloads.
    await evalJs(cdp, sessionId, `document.getElementById('export-all').click()`);
    const deadline = Date.now() + 30000;
    let found = [];
    while (Date.now() < deadline) {
      found = readdirSync(downloadDir).filter((f) => f.endsWith('.png') && !before.has(f));
      if (found.length >= 3) break;
      await sleep(300);
    }
    checks.exportedFiles = found.sort();
    checks.statusText = await evalJs(cdp, sessionId, `document.getElementById('status').textContent`);

    const exceptions = [];
    const errors = [];
    const external = [];
    for (const event of cdp.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        exceptions.push(event.params.exceptionDetails?.text ?? 'exception');
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        errors.push(event.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (event.method === 'Network.requestWillBeSent') {
        const url = event.params.request?.url ?? '';
        if (/^https?:\/\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
          external.push(url);
        }
      }
    }
    checks.exceptions = exceptions;
    checks.consoleErrors = errors;
    checks.externalRequests = external;
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
  console.log(JSON.stringify(checks, null, 2));
  const ok = checks.samplesLoaded && checks.layoutSwitched && checks.gradeSwitched
    && checks.undoEnabled && checks.exportedFiles.length === 3
    && checks.exceptions.length === 0 && checks.consoleErrors.length === 0
    && checks.externalRequests.length === 0;
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
