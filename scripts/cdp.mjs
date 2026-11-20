import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CHROME =
  process.env.CHROME_PATH ||
  join(homedir(), ".cache/ms-playwright/chromium-1255/chrome-linux64/chrome");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Cdp {
  constructor(ws, proc) {
    this.ws = ws;
    this.proc = proc;
    this.nextId = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
    this.externalRequests = [];
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || "CDP error"));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        this.exceptions.push(msg.params?.exceptionDetails?.text || "exception");
      } else if (msg.method === "Runtime.consoleAPICalled") {
        if (msg.params?.type === "error") {
          this.consoleErrors.push(
            (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")
          );
        }
      } else if (msg.method === "Network.requestWillBeSent") {
        const url = msg.params?.request?.url || "";
        try {
          const host = new URL(url).hostname;
          if (host !== "localhost" && host !== "127.0.0.1") {
            this.externalRequests.push(url);
          }
        } catch {
          // Ignore unparseable URLs.
        }
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result?.result?.value;
  }

  async waitFor(expression, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch {
        // Keep polling until the timeout.
      }
      await sleep(200);
    }
    return false;
  }

  navigate(url) {
    return this.send("Page.navigate", { url });
  }

  setViewport(w, h) {
    return this.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async screenshot(quality) {
    const result = await this.send("Page.captureScreenshot", { format: "jpeg", quality });
    return Buffer.from(result.data, "base64");
  }

  async enable() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
    try {
      this.proc.kill("SIGKILL");
    } catch {
      // Already dead.
    }
  }
}

export async function launchChromium({ port, userDataDir, width, height }) {
  mkdirSync(userDataDir, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: "ignore" });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  if (!version) {
    proc.kill("SIGKILL");
    throw new Error(`Chromium did not start on port ${port}`);
  }
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await listRes.json();
  const page = targets.find((t) => t.type === "page");
  if (!page) {
    proc.kill("SIGKILL");
    throw new Error("No page target found");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new Cdp(ws, proc);
  await cdp.enable();
  return cdp;
}
