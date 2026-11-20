// Take the four screenshots listed in shots.json.
// Usage: run while `node serve.ts` serves http://localhost:8080.
// Exits 1 when a shot fails, a console error or exception appears, or any
// request leaves localhost.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForHttp, createTarget, closeTarget, connectWs, Session, sleep } from './cdp.mjs';

const repoDir = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const shots = JSON.parse(readFileSync(join(repoDir, 'shots.json'), 'utf8'));
const outDir = join(repoDir, 'screenshots');
const profileDir = join(repoDir, 'shots-tmp', 'profile');
const chromePath = join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const PORT = 9222;
const BASE = 'http://localhost:8080';
const MAX_BYTES = 262144;

mkdirSync(outDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const report = { shots: [], exceptions: [], consoleErrors: [], externalRequests: [] };
let failed = false;

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' });

async function main() {
  await waitForHttp(PORT, '/json/version', 20000);

  for (const shot of shots) {
    const url = `${BASE}/?${shot.query}`;
    const target = await createTarget(PORT, 'about:blank');
    const ws = await connectWs(target.webSocketDebuggerUrl);
    const session = new Session(ws);

    session.on('Runtime.exceptionThrown', (params) => {
      const detail = params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown';
      report.exceptions.push({ shot: shot.name, detail: String(detail).slice(0, 500) });
    });
    session.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        report.consoleErrors.push({ shot: shot.name, text: params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500) });
      }
    });
    session.on('Network.requestWillBeSent', (params) => {
      try {
        const host = new URL(params.request.url).hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') {
          report.externalRequests.push({ shot: shot.name, url: params.request.url });
        }
      } catch { /* ignore unparseable urls */ }
    });

    try {
      await session.send('Page.enable');
      await session.send('Runtime.enable');
      await session.send('Network.enable');
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false,
      });
      await session.send('Page.navigate', { url });
      const ready = await session.waitFor('window.__shotReady === true', 30000);
      if (!ready) throw new Error('timed out waiting for window.__shotReady');

      let quality = 88;
      let bytes = null;
      let data = null;
      for (;;) {
        const shotResult = await session.send('Page.captureScreenshot', { format: 'jpeg', quality });
        data = Buffer.from(shotResult.data, 'base64');
        bytes = data.length;
        if (bytes <= MAX_BYTES || quality <= 55) break;
        quality -= 8;
      }
      writeFileSync(join(outDir, shot.name), data);
      report.shots.push({ name: shot.name, bytes, quality, w: shot.w, h: shot.h });
      if (bytes > MAX_BYTES) {
        failed = true;
        report.shots[report.shots.length - 1].error = `over byte cap at minimum quality: ${bytes} > ${MAX_BYTES}`;
      }
    } catch (err) {
      failed = true;
      report.shots.push({ name: shot.name, error: err.message, w: shot.w, h: shot.h });
    } finally {
      ws.socket.destroy();
      await closeTarget(PORT, target.id);
      await sleep(300);
    }
  }
}

try {
  await main();
} catch (err) {
  failed = true;
  report.fatal = err.message;
} finally {
  chrome.kill('SIGKILL');
}

if (report.exceptions.length > 0 || report.consoleErrors.length > 0 || report.externalRequests.length > 0) failed = true;
console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
