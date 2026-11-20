import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./cdp.mjs";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const downloadsDir = join(repoDir, "shots-tmp/downloads");
rmSync(downloadsDir, { recursive: true, force: true });
mkdirSync(downloadsDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cdp = await launchChromium({
  port: 9223,
  userDataDir: join(repoDir, "shots-tmp/profile-probe"),
  width: 1280,
  height: 900,
});

const checks = {};
let failed = false;
try {
  try {
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDir });
  } catch {
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDir });
  }

  await cdp.setViewport(1280, 900);
  await cdp.navigate("http://localhost:8080/");
  checks.filmstripLoaded = await cdp.waitFor(
    "document.querySelectorAll('#filmstrip img').length >= 2",
    30000
  );

  await cdp.evaluate(
    "[...document.querySelectorAll('#layouts button')].find(b => b.textContent.trim() === 'Nine-Panel Grid')?.click()"
  );
  await sleep(400);
  checks.layoutNineActive = await cdp.evaluate(
    "[...document.querySelectorAll('#layouts button')].find(b => b.textContent.trim() === 'Nine-Panel Grid')?.classList.contains('active') === true"
  );

  await cdp.evaluate(
    "[...document.querySelectorAll('#grades button')].find(b => b.textContent.trim() === 'Turbo Teal')?.click()"
  );
  await sleep(400);
  checks.gradeTealActive = await cdp.evaluate(
    "[...document.querySelectorAll('#grades button')].find(b => b.textContent.trim() === 'Turbo Teal')?.classList.contains('active') === true"
  );

  checks.undoEnabled = await cdp.evaluate("!document.querySelector('#undo').disabled");

  await cdp.evaluate("document.querySelector('#export-all').click()");
  let pngCount = 0;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const files = existsSync(downloadsDir) ? readdirSync(downloadsDir) : [];
    pngCount = files.filter((f) => f.toLowerCase().endsWith(".png")).length;
    if (pngCount >= 3) break;
    await sleep(500);
  }
  checks.pngDownloads = pngCount;
  checks.downloadedThree = pngCount >= 3;

  await sleep(1200);
  checks.statusExported = await cdp.evaluate(
    "document.querySelector('#status').textContent.startsWith('Exported')"
  );
  checks.statusText = await cdp.evaluate("document.querySelector('#status').textContent");
} finally {
  cdp.close();
}

for (const [name, value] of Object.entries(checks)) {
  if (value === false) failed = true;
}
const report = {
  checks,
  exceptions: cdp.exceptions,
  consoleErrors: cdp.consoleErrors,
  externalRequests: cdp.externalRequests,
  ok: !failed && cdp.exceptions.length === 0 && cdp.consoleErrors.length === 0 && cdp.externalRequests.length === 0,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
