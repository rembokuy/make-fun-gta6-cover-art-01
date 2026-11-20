// Minimal Chrome DevTools Protocol client over a plain Node WebSocket.
// No dependencies: launches the vendored Chromium, talks CDP, and records
// console errors, exceptions, and network requests for the caller.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  throw new Error(`DevTools endpoint never came up: ${url}`);
}

export class Cdp {
  constructor(ws, proc) {
    this.ws = ws;
    this.proc = proc;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
    this.externalRequests = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.exceptions.push(d?.exception?.description || d?.text || "exception");
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.consoleErrors.push(
          msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")
        );
      }
      if (msg.method === "Network.requestWillBeSent") {
        const url = msg.params.request.url;
        try {
          const host = new URL(url).hostname;
          if (host !== "localhost" && host !== "127.0.0.1") {
            this.externalRequests.push(url);
          }
        } catch {
          this.externalRequests.push(url);
        }
      }
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Evaluate JS in the page and return the value (returnByValue).
  // NOTE: the CDP reply nests it as result.result.value — one level deeper
  // than the method result itself. Destructure carefully.
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result?.result?.value;
  }

  async waitFor(expression, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return true;
      await sleep(200);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
  }

  async setViewport(w, h) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async screenshot(quality) {
    const result = await this.send("Page.captureScreenshot", {
      format: "jpeg",
      quality,
    });
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
    } catch {}
    try {
      this.proc.kill("SIGKILL");
    } catch {}
  }
}

export async function launchChromium({ port, userDataDir, width, height }) {
  mkdirSync(userDataDir, { recursive: true });
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("No page target found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new Cdp(ws, proc);
  await cdp.enable();
  return cdp;
}
