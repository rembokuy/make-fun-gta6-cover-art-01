// Takes the four dossier screenshots with headless Chrome:
// the exported wide cover, the editor, the editor in another
// layout and grade, and the exported portrait cover.
// Every file must stay under 256 KiB, long side at most 1280 px.

import { writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, Cdp, startServer, stop } from './cdp.mjs';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = join(repoDir, 'screenshots');
const PORT = 8091;
const DEBUG_PORT = 9333;
const MAX_BYTES = 262144;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function saveDataUrl(dataUrl, file) {
  const base64 = dataUrl.split(',')[1];
  const buf = Buffer.from(base64, 'base64');
  writeFileSync(file, buf);
  return buf.length;
}

async function coverShot(cdp, width, height, file) {
  for (const quality of [0.82, 0.7, 0.58]) {
    const dataUrl = await cdp.evaluate(
      `window.__studio.exportDataURL(${width}, ${height}, 'image/jpeg', ${quality})`,
    );
    const bytes = saveDataUrl(dataUrl, file);
    console.log(file.split('/').pop() + ' ' + bytes + ' bytes (quality ' + quality + ')');
    if (bytes <= MAX_BYTES) return bytes;
  }
  throw new Error(file + ' still over 256 KiB at the lowest quality');
}

async function editorShot(cdp, file) {
  for (const quality of [80, 62, 48]) {
    const buf = await cdp.screenshot('jpeg', quality);
    writeFileSync(file, buf);
    console.log(file.split('/').pop() + ' ' + buf.length + ' bytes (quality ' + quality + ')');
    if (buf.length <= MAX_BYTES) return buf.length;
  }
  throw new Error(file + ' still over 256 KiB at the lowest quality');
}

async function main() {
  const server = await startServer(repoDir, PORT);
  const chrome = await launchChrome(DEBUG_PORT);
  let cdp;
  try {
    cdp = await Cdp.open(DEBUG_PORT);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.waitFor('Page.loadEventFired', null, 20000);
    await cdp.navigate('http://127.0.0.1:' + PORT + '/');
    await loaded;
    const ready = await cdp.evaluate(`(async () => { await window.__studio.ready; return true; })()`);
    if (!ready) throw new Error('app did not become ready');
    await sleep(400);

    // 2 - the editor, default state.
    await editorShot(cdp, join(shotsDir, '2-editor.jpg'));

    // 3 - the editor in the split layout with the neon grade.
    await cdp.evaluate(`window.__studio.setLayout('split-vice'); window.__studio.setPalette('boardwalk-neon');`);
    await sleep(400);
    await editorShot(cdp, join(shotsDir, '3-layout.jpg'));

    // 1 - the exported wide cover (first by name, so it is the dossier cover).
    await cdp.evaluate(`window.__studio.setLayout('neon-frame'); window.__studio.setPalette('coral-dusk'); window.__studio.setPhoto(0);`);
    await sleep(400);
    await coverShot(cdp, 1280, 720, join(shotsDir, '1-cover.jpg'));

    // 4 - the exported portrait cover, stacked layout, gold grade.
    await cdp.evaluate(`window.__studio.setLayout('sunset-stack'); window.__studio.setPalette('vice-gold');`);
    await sleep(400);
    await coverShot(cdp, 1024, 1280, join(shotsDir, '4-cover.jpg'));

    for (const name of ['1-cover.jpg', '2-editor.jpg', '3-layout.jpg', '4-cover.jpg']) {
      const size = statSync(join(shotsDir, name)).size;
      console.log(name + ' final ' + size + ' bytes' + (size <= MAX_BYTES ? '' : ' OVER LIMIT'));
      if (size > MAX_BYTES) throw new Error(name + ' over 256 KiB');
    }
    console.log('all 4 screenshots written');
  } finally {
    if (cdp) cdp.close();
    stop(chrome);
    stop(server);
  }
}

main().catch((err) => {
  console.error('take-shots failed: ' + err.message);
  process.exit(1);
});
