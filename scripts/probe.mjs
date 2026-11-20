// Drives the app in headless Chrome and checks every control:
// photo, layout and palette switching, title editing, undo,
// PNG export at all three sizes, a real file download, and a
// clean console. Prints one PASS/FAIL line per check.

import { readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchChrome, Cdp, startServer, stop } from './cdp.mjs';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8092;
const DEBUG_PORT = 9334;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  const server = await startServer(repoDir, PORT);
  const chrome = await launchChrome(DEBUG_PORT);
  const pageErrors = [];
  let cdp;
  try {
    cdp = await Cdp.open(DEBUG_PORT);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(p.exceptionDetails?.text ?? 'exception'));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') pageErrors.push(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    const loaded = cdp.waitFor('Page.loadEventFired', null, 20000);
    await cdp.navigate('http://127.0.0.1:' + PORT + '/');
    await loaded;

    const title = await cdp.evaluate('document.title');
    check('page loads with studio title', title.includes('Neon Coast'), title);

    const ready = await cdp.evaluate(`(async () => { await window.__studio.ready; return true; })()`);
    check('app becomes ready', ready === true);

    const painted = await cdp.evaluate(`(() => {
      const ctx = document.getElementById('stage').getContext('2d');
      const data = ctx.getImageData(0, 0, 1080, 1080).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 401 * 4) {
        seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
      }
      return seen.size;
    })()`);
    check('preview canvas is painted, not blank', painted > 60, painted + ' distinct sampled colours');

    await cdp.evaluate(`document.getElementById('palette-boardwalk-neon').click()`);
    await sleep(200);
    check('palette switch works', (await cdp.evaluate('window.__studio.state.palette')) === 'boardwalk-neon');

    await cdp.evaluate(`document.getElementById('layout-split-vice').click()`);
    await sleep(200);
    check('layout switch works', (await cdp.evaluate('window.__studio.state.layout')) === 'split-vice');

    await cdp.evaluate(`document.getElementById('photo-boardwalk-neon').click()`);
    await sleep(200);
    check('photo switch works', (await cdp.evaluate('window.__studio.state.photo')) === 1);

    await cdp.evaluate(`(() => {
      const el = document.getElementById('title-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      el.focus();
      setter.call(el, 'VICE CITY');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    check('title edit works', (await cdp.evaluate('window.__studio.state.title')) === 'VICE CITY');

    await cdp.evaluate(`document.getElementById('undo-btn').click()`);
    await sleep(200);
    const afterUndo = await cdp.evaluate('window.__studio.state.title');
    check('undo restores the title', afterUndo === 'NEON COAST', 'got ' + afterUndo);

    for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
      const url = await cdp.evaluate(`window.__studio.exportDataURL(${w}, ${h}, 'image/png')`);
      check('PNG export renders ' + w + 'x' + h, typeof url === 'string' && url.startsWith('data:image/png;base64,') && url.length > 20000, url.length + ' chars');
    }

    const downloadDir = mkdtempSync(join(tmpdir(), 'neon-coast-dl-'));
    try {
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    } catch {
      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    }
    await cdp.evaluate(`document.getElementById('export-1080x1080').click()`);
    let downloaded = null;
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      const files = readdirSync(downloadDir).filter((f) => f.endsWith('.png'));
      if (files.length > 0) { downloaded = files[0]; break; }
    }
    const dlBytes = downloaded ? statSync(join(downloadDir, downloaded)).size : 0;
    check('export button downloads a PNG file', downloaded !== null && dlBytes > 10000, (downloaded ?? 'none') + ' ' + dlBytes + ' bytes');

    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } finally {
    if (cdp) cdp.close();
    stop(chrome);
    stop(server);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? 'PROBE: all ' + results.length + ' checks passed' : 'PROBE: ' + failed + ' of ' + results.length + ' checks failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe failed: ' + err.message);
  process.exit(1);
});
