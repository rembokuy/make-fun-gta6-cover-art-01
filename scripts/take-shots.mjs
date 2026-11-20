import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./cdp.mjs";

const MAX_BYTES = 262144;
const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const shots = JSON.parse(readFileSync(join(repoDir, "shots.json"), "utf8"));

const cdp = await launchChromium({
  port: 9222,
  userDataDir: join(repoDir, "shots-tmp/profile"),
  width: 1280,
  height: 720,
});

const results = [];
let failed = false;
try {
  for (const shot of shots) {
    await cdp.setViewport(shot.w, shot.h);
    await cdp.navigate(`http://localhost:8080/?${shot.query}`);
    const ready = await cdp.waitFor("window.__shotReady === true", 30000);
    let buffer = null;
    let quality = null;
    if (ready) {
      for (let q = 88; q >= 55; q -= 8) {
        const shot_buf = await cdp.screenshot(q);
        buffer = shot_buf;
        quality = q;
        if (shot_buf.length <= MAX_BYTES) break;
      }
    }
    const size = buffer ? buffer.length : 0;
    const ok = ready && buffer !== null && size <= MAX_BYTES;
    if (!ok) failed = true;
    if (buffer) writeFileSync(join(repoDir, "screenshots", shot.name), buffer);
    results.push({ name: shot.name, w: shot.w, h: shot.h, quality, bytes: size, ready, ok });
  }
} finally {
  cdp.close();
}

const report = {
  shots: results,
  exceptions: cdp.exceptions,
  consoleErrors: cdp.consoleErrors,
  externalRequests: cdp.externalRequests,
  ok: !failed && cdp.exceptions.length === 0 && cdp.consoleErrors.length === 0 && cdp.externalRequests.length === 0,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
