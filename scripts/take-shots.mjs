// Take the four dossier screenshots from shots.json.
//
// Usage: node serve.ts must already be running on http://localhost:8080,
// then `node scripts/take-shots.mjs`. Each shot opens its query in a fresh
// headless Chromium tab at the shot's viewport, waits for
// window.__shotReady, and captures a JPEG that fits the 262144-byte cap
// (quality starts at 88 and drops by 8, down to 55).
//
// The run fails (exit 1) when a shot errors, a page exception or console
// error appears, or the app requests anything outside localhost.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, newTab, connect, evaluate, waitFor } from './cdp.mjs';

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const shotsDir = join(repoDir, 'screenshots');
const tmpDir = join(repoDir, 'shots-tmp');
const profileDir = join(tmpDir, 'profile');
const PORT = 9222;
const MAX_BYTES = 262144;

const shots = JSON.parse(readFileSync(join(repoDir, 'shots.json'), 'utf8'));

const results = [];
const problems = [];

async function captureShot(session, shot) {
  const errors = [];
  const exceptions = [];
  const external = [];

  session.on('Runtime.exceptionThrown', (params) => {
    exceptions.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
  });
  session.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      errors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  session.on('Network.requestWillBeSent', (params) => {
    const url = params.request?.url ?? '';
    try {
      const host = new URL(url).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') external.push(url);
    } catch {
      // A URL we cannot parse is not a network request we can judge.
    }
  });

  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Network.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: shot.w,
    height: shot.h,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await waitFor(async () => {
    try {
      return (await evaluate(session, 'window.__shotReady === true')) === true;
    } catch {
      return false;
    }
  }, { timeout: 30000, label: `__shotReady for ${shot.name}` });

  // Capture, lowering the quality until the file fits the byte cap.
  let quality = 88;
  let bytes = null;
  for (;;) {
    const { data } = await session.send('Page.captureScreenshot', { format: 'jpeg', quality });
    const buf = Buffer.from(data, 'base64');
    if (buf.length <= MAX_BYTES || quality <= 55) {
      bytes = buf;
      break;
    }
    quality -= 8;
  }
  writeFileSync(join(shotsDir, shot.name), bytes);
  return { name: shot.name, bytes: bytes.length, quality, w: shot.w, h: shot.h, errors, exceptions, external };
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  const chrome = await launchChrome({ port: PORT, profile: profileDir });
  try {
    for (const shot of shots) {
      const url = `http://localhost:8080/${shot.query}`;
      const target = await newTab(PORT, url);
      const session = await connect(target.webSocketDebuggerUrl);
      try {
        const result = await captureShot(session, shot);
        results.push(result);
        if (result.errors.length > 0) problems.push(`${shot.name}: console errors: ${result.errors.join(' | ')}`);
        if (result.exceptions.length > 0) problems.push(`${shot.name}: exceptions: ${result.exceptions.join(' | ')}`);
        if (result.external.length > 0) problems.push(`${shot.name}: external requests: ${result.external.join(' | ')}`);
      } finally {
        session.close();
      }
    }
  } finally {
    chrome.kill();
  }

  console.log(JSON.stringify({ shots: results, problems }, null, 2));
  if (problems.length > 0) {
    console.error(`FAILED: ${problems.length} problem(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
