// Interaction probe: drive the plain editor in Chromium, exercise layout /
// grade pickers, undo state, and the 3-size PNG export. Exits 1 on any
// failed check, exception, console error, or external request.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./cdp.mjs";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const downloadsDir = join(repoDir, "shots-tmp", "downloads");

rmSync(downloadsDir, { recursive: true, force: true });
mkdirSync(downloadsDir, { recursive: true });

const cdp = await launchChromium({
  port: 9223,
  userDataDir: join(repoDir, "shots-tmp", "profile-probe"),
  width: 1280,
  height: 900,
});

const checks = {};
function check(name, ok) {
  checks[name] = !!ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  try {
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDir });
  } catch {
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDir });
  }

  await cdp.setViewport(1280, 900);
  await cdp.navigate("http://localhost:8080/");
  await cdp.waitFor("document.querySelectorAll('#filmstrip img').length >= 2", 30000);
  check("two sample thumbnails loaded", true);

  await cdp.evaluate(
    `[...document.querySelectorAll('#layouts button')].find(b => b.textContent.trim() === 'Nine-Panel Grid').click()`
  );
  await sleep(300);
  check(
    "Nine-Panel Grid becomes active",
    await cdp.evaluate(
      `[...document.querySelectorAll('#layouts button')].find(b => b.textContent.trim() === 'Nine-Panel Grid').classList.contains('active')`
    )
  );

  await cdp.evaluate(
    `[...document.querySelectorAll('#grades button')].find(b => b.textContent.trim() === 'Turbo Teal').click()`
  );
  await sleep(300);
  check(
    "Turbo Teal becomes active",
    await cdp.evaluate(
      `[...document.querySelectorAll('#grades button')].find(b => b.textContent.trim() === 'Turbo Teal').classList.contains('active')`
    )
  );

  check("undo enabled after changes", await cdp.evaluate(`!document.querySelector('#undo').disabled`));

  await cdp.evaluate(`document.querySelector('#export-all').click()`);
  const deadline = Date.now() + 30000;
  let pngs = [];
  while (Date.now() < deadline) {
    pngs = readdirSync(downloadsDir).filter((f) => f.endsWith(".png") && statSync(join(downloadsDir, f)).size > 0);
    if (pngs.length >= 3) break;
    await sleep(500);
  }
  check("3 PNG files downloaded", pngs.length >= 3);
  // Let the final status line settle after the last download.
  await sleep(1200);
  const status = await cdp.evaluate(`document.querySelector('#status').textContent`);
  checks.statusText = status;
  check("status reports exported files", status.startsWith("Exported"));
} finally {
  cdp.close();
}

const report = {
  checks,
  exceptions: cdp.exceptions,
  consoleErrors: cdp.consoleErrors,
  externalRequests: cdp.externalRequests,
};
console.log(JSON.stringify(report, null, 2));

const failed =
  Object.values(checks).some((v) => v === false) ||
  cdp.exceptions.length > 0 ||
  cdp.consoleErrors.length > 0 ||
  cdp.externalRequests.length > 0;
process.exit(failed ? 1 : 0);
