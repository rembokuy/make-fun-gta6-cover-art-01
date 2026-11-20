// Probe the editor end to end in headless Chromium.
//
// Usage: node serve.ts must already be running on http://localhost:8080,
// then `node scripts/probe-interactions.mjs`. The probe opens the plain
// editor, waits for the two sample thumbnails, clicks the Nine-Panel Grid
// layout and the Turbo Teal grade, checks the undo button is enabled, and
// clicks "Export all 3 sizes" until three PNGs land in the download
// folder. Any failed check, page exception, console error or request
// outside localhost exits 1.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, newTab, connect, evaluate, waitFor } from './cdp.mjs';

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tmpDir = join(repoDir, 'shots-tmp');
const profileDir = join(tmpDir, 'profile-probe');
const downloadDir = join(tmpDir, 'downloads');
const PORT = 9223;

const checks = {};
const problems = [];

function check(name, ok, detail = '') {
  checks[name] = ok ? `pass${detail ? ` (${detail})` : ''}` : `FAIL${detail ? ` (${detail})` : ''}`;
  if (!ok) problems.push(`${name}: ${detail}`);
}

async function main() {
  mkdirSync(downloadDir, { recursive: true });
  // Clear stale downloads so the three PNGs we wait for are this run's.
  for (const f of readdirSync(downloadDir)) {
    if (f.endsWith('.png') || f.endsWith('.crdownload')) rmSync(join(downloadDir, f), { force: true });
  }
  const chrome = await launchChrome({ port: PORT, profile: profileDir });
  let statusText = '';
  try {
    const target = await newTab(PORT, 'http://localhost:8080/');
    const session = await connect(target.webSocketDebuggerUrl);
    const exceptions = [];
    const consoleErrors = [];
    const external = [];
    session.on('Runtime.exceptionThrown', (params) => {
      exceptions.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
    });
    session.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        consoleErrors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
    session.on('Network.requestWillBeSent', (params) => {
      const url = params.request?.url ?? '';
      try {
        const host = new URL(url).hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') external.push(url);
      } catch {
        // Not a URL we can judge.
      }
    });

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Network.enable');
    await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    await waitFor(async () => {
      try {
        return (await evaluate(session, `document.querySelectorAll('#filmstrip img').length`)) >= 2;
      } catch {
        return false;
      }
    }, { timeout: 30000, label: 'two sample thumbnails' });
    check('two sample thumbnails loaded', true);

    const thumbsComplete = await evaluate(session, `[...document.querySelectorAll('#filmstrip img')].every((i) => i.complete && i.naturalWidth > 0)`);
    check('sample thumbnails are real images', thumbsComplete === true);

    const clickedLayout = await evaluate(session, `
      (() => {
        const btn = [...document.querySelectorAll('#layouts button')].find((b) => b.textContent.trim() === 'Nine-Panel Grid');
        if (!btn) return false;
        btn.click();
        return btn.classList.contains('active');
      })()
    `);
    check('layout "Nine-Panel Grid" becomes active', clickedLayout === true);

    const clickedGrade = await evaluate(session, `
      (() => {
        const btn = [...document.querySelectorAll('#grades button')].find((b) => b.title === 'Turbo Teal');
        if (!btn) return false;
        btn.click();
        return btn.classList.contains('active');
      })()
    `);
    check('grade "Turbo Teal" becomes active', clickedGrade === true);

    const undoEnabled = await evaluate(session, `!document.getElementById('undo').disabled`);
    check('undo button enabled after edits', undoEnabled === true);

    await evaluate(session, `document.getElementById('export-all').click()`);
    await waitFor(async () => {
      const files = readdirSync(downloadDir).filter((f) => f.endsWith('.png') && !f.endsWith('.crdownload'));
      return files.length >= 3;
    }, { timeout: 30000, label: 'three PNG downloads' });
    const downloaded = readdirSync(downloadDir).filter((f) => f.endsWith('.png')).sort();
    check('3 PNG files downloaded', downloaded.length === 3, downloaded.join(', '));

    // The final "Exported …" status lands a beat after the last download
    // (the exporter pauses 350 ms between sizes), so wait for it.
    await waitFor(async () => {
      statusText = await evaluate(session, `document.getElementById('status').textContent`);
      return typeof statusText === 'string' && statusText.includes('Exported');
    }, { timeout: 10000, label: 'final export status' });
    check('status reports the export', true, statusText);

    check('no page exceptions', exceptions.length === 0, exceptions.join(' | '));
    check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
    check('no external requests', external.length === 0, external.join(' | '));
    session.close();
  } finally {
    chrome.kill();
  }

  console.log(JSON.stringify({ checks, status: statusText, problems }, null, 2));
  if (problems.length > 0) {
    console.error(`FAILED: ${problems.length} problem(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
