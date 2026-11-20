// Minimal Chrome DevTools Protocol helpers over Node's built-in WebSocket.
// No dependencies: the scripts in this folder talk straight to the vendored
// Chromium's remote debugging port.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Start headless Chromium with a debugging port; resolve once it answers. */
export async function launchChrome({ port, profile, extraArgs = [] }) {
  mkdirSync(profile, { recursive: true });
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    ...extraArgs,
  ];
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return child;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Chromium did not start a debugging port on ${port}`);
    }
    await sleep(250);
  }
}

/** Open a new tab at `url` and return its target (with webSocketDebuggerUrl). */
export async function newTab(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`cannot open tab: HTTP ${res.status}`);
  return res.json();
}

/** A CDP session: send() awaits a method's reply; on() subscribes to events. */
export class Session {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
        else resolve(msg.result ?? {});
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) ?? [];
        for (const fn of handlers) fn(msg.params ?? {});
      }
    });
  }

  get ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() {
    this.ws.close();
  }
}

export async function connect(wsUrl) {
  const session = new Session(wsUrl);
  await session.ready;
  return session;
}

/** Evaluate JS in the page and return its value (awaitPromise for promises). */
export async function evaluate(session, expression) {
  const reply = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reply.exceptionDetails) {
    throw new Error(`page evaluation failed: ${JSON.stringify(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)}`);
  }
  return reply.result?.value;
}

/** Wait until `check` (an async function) returns truthy, or time out. */
export async function waitFor(check, { timeout = 30000, interval = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(interval);
  }
}

export { join };
