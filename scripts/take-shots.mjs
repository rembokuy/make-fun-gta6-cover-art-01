// Take the four dossier screenshots: open each shot from shots.json in the
// vendored Chromium, wait for window.__shotReady, capture a JPEG no larger
// than 262144 bytes. Exits 1 on any exception, console error, or network
// request to a host other than localhost.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./cdp.mjs";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_BYTES = 262144;

const shots = JSON.parse(readFileSync(join(repoDir, "shots.json"), "utf-8"));

const cdp = await launchChromium({
  port: 9222,
  userDataDir: join(repoDir, "shots-tmp", "profile"),
  width: 1280,
  height: 720,
});

const results = [];
try {
  for (const shot of shots) {
    await cdp.setViewport(shot.w, shot.h);
    await cdp.navigate(
      `http://localhost:8080/?${shot.query}`
    );
    await cdp.waitFor("window.__shotReady === true", 30000);
    let quality = 88;
    let buf = await cdp.screenshot(quality);
    while (buf.length > MAX_BYTES && quality > 55) {
      quality -= 8;
      buf = await cdp.screenshot(quality);
    }
    writeFileSync(join(repoDir, "screenshots", shot.name), buf);
    results.push({ name: shot.name, bytes: buf.length, quality, w: shot.w, h: shot.h });
    console.log(`${shot.name}: ${buf.length} bytes @ q${quality}`);
  }
} finally {
  cdp.close();
}

const report = {
  shots: results,
  exceptions: cdp.exceptions,
  consoleErrors: cdp.consoleErrors,
  externalRequests: cdp.externalRequests,
};
console.log(JSON.stringify(report, null, 2));

const failed =
  results.some((r) => r.bytes > MAX_BYTES) ||
  cdp.exceptions.length > 0 ||
  cdp.consoleErrors.length > 0 ||
  cdp.externalRequests.length > 0;
process.exit(failed ? 1 : 0);
