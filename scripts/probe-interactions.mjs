// Probe the editor's interactions end to end:
// load the plain editor, switch layout and grade, check undo, then export
// all three PNG sizes and wait for the downloads.
// Usage: run while `node serve.ts` serves http://localhost:8080.
// Exits 1 when any check fails.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForHttp, createTarget, closeTarget, connectWs, Session, sleep } from './cdp.mjs';

const repoDir = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const profileDir = join(repoDir, 'shots-tmp', 'profile-probe');
const downloadDir = join(repoDir, 'shots-tmp', 'downloads');
const chromePath = join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const PORT = 9223;
const BASE = 'http://localhost:8080';

mkdirSync(profileDir, { recursive: true });
mkdirSync(downloadDir, { recursive: true });
for (const file of readdirSync(downloadDir)) rmSync(join(downloadDir, file), { force: true });

const checks = {};
const exceptions = [];
const consoleErrors = [];
const externalRequests = [];
let failed = false;

function check(name, ok, detail = '') {
  checks[name] = ok ? 'pass' : `FAIL${detail ? `: ${detail}` : ''}`;
  if (!ok) failed = true;
}

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
  const version = await waitForHttp(PORT, '/json/version', 20000);
  const browserWs = await connectWs(version.webSocketDebuggerUrl);
  const browser = new Session(browserWs);
  try {
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  } catch {
    try {
      await browser.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    } catch { /* downloads may still work with the default path */ }
  }

  const target = await createTarget(PORT, 'about:blank');
  const ws = await connectWs(target.webSocketDebuggerUrl);
  const session = new Session(ws);

  session.on('Runtime.exceptionThrown', (params) => {
    exceptions.push(String(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown').slice(0, 500));
  });
  session.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500));
    }
  });
  session.on('Network.requestWillBeSent', (params) => {
    try {
      const host = new URL(params.request.url).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') externalRequests.push(params.request.url);
    } catch { /* ignore */ }
  });

  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Network.enable');
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await session.send('Page.navigate', { url: `${BASE}/` });

    const thumbs = await session.waitFor(`document.querySelectorAll('#filmstrip img').length >= 2`, 30000);
    check('two-sample-thumbnails', thumbs);

    const layoutClicked = await session.evaluate(`(() => {
      const btn = [...document.querySelectorAll('#layouts button')].find((b) => b.textContent.trim() === 'Nine-Panel Grid');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    check('click-layout-nine-panel-grid', layoutClicked === true);
    const layoutActive = await session.evaluate(`(() => {
      const btn = [...document.querySelectorAll('#layouts button')].find((b) => b.textContent.trim() === 'Nine-Panel Grid');
      return btn ? btn.classList.contains('active') : false;
    })()`);
    check('layout-nine-panel-grid-active', layoutActive === true);

    const gradeClicked = await session.evaluate(`(() => {
      const btn = [...document.querySelectorAll('#grades button')].find((b) => b.textContent.trim() === 'Turbo Teal');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    check('click-grade-turbo-teal', gradeClicked === true);
    const gradeActive = await session.evaluate(`(() => {
      const btn = [...document.querySelectorAll('#grades button')].find((b) => b.textContent.trim() === 'Turbo Teal');
      return btn ? btn.classList.contains('active') : false;
    })()`);
    check('grade-turbo-teal-active', gradeActive === true);

    const undoEnabled = await session.evaluate(`!document.getElementById('undo').disabled`);
    check('undo-enabled-after-changes', undoEnabled === true);

    await session.evaluate(`document.getElementById('export-all').click()`);
    let downloaded = [];
    const start = Date.now();
    while (Date.now() - start < 30000) {
      downloaded = readdirSync(downloadDir).filter((f) => f.endsWith('.png'));
      if (downloaded.length >= 3) break;
      await sleep(500);
    }
    check('three-png-downloads', downloaded.length >= 3, `got ${downloaded.length}: ${downloaded.join(', ')}`);

    const statusText = await session.evaluate(`document.getElementById('status').textContent`);
    checks.status_text = statusText;
  } catch (err) {
    failed = true;
    checks.fatal = err.message;
  } finally {
    ws.socket.destroy();
    browserWs.socket.destroy();
    await closeTarget(PORT, target.id);
  }
}

try {
  await main();
} catch (err) {
  failed = true;
  checks.fatal = err.message;
} finally {
  chrome.kill('SIGKILL');
}

if (exceptions.length > 0 || consoleErrors.length > 0 || externalRequests.length > 0) failed = true;
console.log(JSON.stringify({ checks, exceptions, consoleErrors, externalRequests }, null, 2));
process.exit(failed ? 1 : 0);
