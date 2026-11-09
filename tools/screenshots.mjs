// Regenerates the README screenshots through Edge headless + CDP.
// The app runs in the browser with dev-mock.js standing in for the Tauri backend.
//
// Usage: node tools/screenshots.mjs
//
// Edge is always killed (process tree) and its temporary profile is deleted, including on
// failure, on SIGINT/SIGTERM and after the 4-minute hard timeout.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "screenshots");
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const URL = "http://localhost:1420/";
const VIEWPORT = { width: 1280, height: 800 };
const TOTAL_TIMEOUT_MS = 4 * 60 * 1000;
const SETTLE_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let edgeProc = null;
let edgePid = null;
let viteProc = null;
let vitePid = null;
let viteStarted = false;
let viteProblem = null;
let profileDir = "";
let timeoutTimer = null;
let cleaned = false;
let failed = false;

function killTree(pid) {
  if (!pid) return;
  try {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 20000,
    });
  } catch {
    /* the process may already be gone */
  }
}

function killEdgeByProfile(dir) {
  const needle = dir.replace(/'/g, "''");
  const script =
    `$p='${needle}'; ` +
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) } | ` +
    `ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
  try {
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 20000,
    });
  } catch {
    /* best effort fallback after taskkill */
  }
}

function cleanupSync() {
  if (cleaned) return;
  cleaned = true;
  if (timeoutTimer) clearTimeout(timeoutTimer);

  if (edgePid) {
    killTree(edgePid);
    if (profileDir) killEdgeByProfile(profileDir);
  }
  if (profileDir) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (err) {
      console.error(`screenshots: could not delete profile ${profileDir}: ${err.message}`);
    }
  }
  if (viteStarted && vitePid) killTree(vitePid);
}

function fail(err) {
  if (failed) return;
  failed = true;
  console.error(`screenshots: ${err?.stack ?? err}`);
  cleanupSync();
  process.exit(1);
}

process.on("SIGINT", () => fail(new Error("interrupted by SIGINT")));
process.on("SIGTERM", () => fail(new Error("interrupted by SIGTERM")));
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
process.on("exit", () => {
  try {
    cleanupSync();
  } catch {
    /* nothing left to do while exiting */
  }
});

async function isServerUp() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(1200) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (viteProblem) throw viteProblem;
    if (await isServerUp()) return;
    await sleep(500);
  }
  throw new Error("Vite dev server did not start on port 1420");
}

async function startVite() {
  if (await isServerUp()) {
    console.log("screenshots: using the already-running Vite dev server");
    return;
  }
  console.log("screenshots: starting Vite dev server");
  viteStarted = true;
  viteProc = spawn(
    process.env.ComSpec || "cmd.exe",
    // Native config loading avoids Vite's bundled-config `exec("net use")`, which the sandbox
    // forbids (it cannot create the pipes needed to capture a child's output).
    ["/d", "/s", "/c", "npx vite --port 1420 --strictPort --configLoader native"],
    { cwd: ROOT, stdio: "ignore", windowsHide: true, env: process.env },
  );
  vitePid = viteProc.pid;
  viteProc.on("error", (err) => {
    viteProblem = new Error(`could not start Vite: ${err.message}`);
  });
  viteProc.on("exit", (code) => {
    if (code !== 0 && !(awaitingShutdown())) {
      viteProblem = new Error(`Vite exited with code ${code}`);
    }
  });
  await waitForServer();
}

function awaitingShutdown() {
  return cleaned || failed;
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();

    this.ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString());
      } catch {
        return;
      }
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(`${pending.method}: ${msg.error.message}`));
        else pending.resolve(msg.result);
      }
    });
    this.ws.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`CDP connection closed during ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("could not connect to the Edge DevTools endpoint"));
      };
      const cleanup = () => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError);
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`CDP socket is not open (${method})`));
        return;
      }
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

async function getPageTarget(port) {
  for (let i = 0; i < 160; i++) {
    if (edgeProc?.exitCode !== null && edgeProc?.exitCode !== undefined) {
      throw new Error(`Edge exited early with code ${edgeProc.exitCode}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      /* Edge is still starting */
    }
    await sleep(250);
  }
  throw new Error("Edge did not expose a page target in time");
}

function makeEvaluator(cdp) {
  return async function evaluate(expression, { awaitPromise = true, label = "evaluate" } = {}) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const message =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "JavaScript exception";
      throw new Error(`${label}: ${message}`);
    }
    return result.result?.value;
  };
}

async function waitFor(evaluate, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return;
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`);
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
}

async function capture(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: 85,
    fromSurface: true,
  });
  const file = path.join(SHOTS, `${name}.jpg`);
  const buffer = Buffer.from(data, "base64");
  await fsp.writeFile(file, buffer);
  const kb = buffer.length / 1024;
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  console.log(`screenshots/${name}.jpg  ${size}`);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
}

async function selectCity(evaluate, wait, name) {
  const literal = JSON.stringify(name);
  const clicked = await evaluate(
    `(() => {
      const rows = [...document.querySelectorAll(".city")];
      const row = rows.find((r) => {
        const n = r.querySelector(".city-name");
        return n && n.textContent.trim().startsWith(${literal});
      });
      if (!row) return false;
      row.querySelector(".city-main").click();
      return true;
    })()`,
    { awaitPromise: false, label: `select ${name}` },
  );
  if (!clicked) throw new Error(`saved city not found: ${name}`);
  await wait(
    `(document.querySelector(".hero-city")?.textContent.trim() === ${literal}) && document.querySelector("#main")?.dataset.phase === "ready"`,
    30000,
    `${name} weather ready`,
  );
  await sleep(SETTLE_MS);
}

async function settle(ms = SETTLE_MS) {
  console.log(`screenshots: waiting ${ms / 1000}s for the scene to settle`);
  await sleep(ms);
}

async function run() {
  await fsp.mkdir(SHOTS, { recursive: true });
  if (!fs.existsSync(EDGE)) throw new Error(`Edge not found at ${EDGE}`);

  timeoutTimer = setTimeout(() => fail(new Error("timed out after 4 minutes")), TOTAL_TIMEOUT_MS);

  await startVite();

  const port = 9300 + Math.floor(Math.random() * 100);
  profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "skylark-edgeprof-"));
  console.log(`screenshots: launching Edge on CDP port ${port}`);

  edgeProc = spawn(
    EDGE,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--disable-extensions",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  edgePid = edgeProc.pid;
  edgeProc.on("error", (err) => fail(new Error(`could not launch Edge: ${err.message}`)));

  const target = await getPageTarget(port);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();

  const evaluate = makeEvaluator(cdp);
  const wait = (expression, timeoutMs, label) => waitFor(evaluate, expression, timeoutMs, label);

  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    await setViewport(cdp, VIEWPORT.width, VIEWPORT.height);

    // Load the app once so localStorage is available, then reset it before loading the mock.
    await cdp.send("Page.navigate", { url: `${URL}?fx=1` });
    await wait(`document.readyState === "complete"`, 30000, "initial page load");
    await evaluate(
      `(() => {
        localStorage.clear();
        localStorage.setItem("weather.settings", JSON.stringify({
          temp: "c", wind: "kmh", clock: "24", fps: "30", icons: "color",
          keepAlive: "off", alertNotifications: "off"
        }));
      })()`,
      { awaitPromise: false, label: "reset localStorage" },
    );
    await cdp.send("Page.reload", { ignoreCache: false });
    await wait(
      `document.readyState === "complete" && !!document.getElementById("app")`,
      30000,
      "app reload",
    );

    // dev-mock.js replaces the Tauri bridge, boots the app and exposes window.__set.
    await evaluate(
      `(async () => {
        await import("/dev-mock.js?t=" + Date.now());
        return true;
      })()`,
      { label: "load dev-mock.js" },
    );

    await wait(`document.querySelector("#main")?.dataset.phase === "ready"`, 30000, "weather ready");
    await wait(`!!document.getElementById("fxd-cond")`, 10000, "dev scene panel");
    await evaluate(
      `(() => { const p = document.getElementById("fxd-cond")?.closest("div"); if (p) p.style.display = "none"; })()`,
      { awaitPromise: false, label: "hide dev scene panel" },
    );

    // 1. Clear day (Tokyo is the clear-day variant in dev-mock's saved cities).
    await settle();
    await capture(cdp, "clear-day");

    // 2. Day popover: first row of the 10-day forecast.
    await evaluate(`document.querySelector(".daily-row")?.click()`, {
      awaitPromise: false,
      label: "open day popover",
    });
    await wait(`!!document.querySelector(".popover")`, 10000, "day popover");
    await sleep(1200);
    await capture(cdp, "popover-day");
    await evaluate(`document.querySelector(".daily-row")?.click()`, {
      awaitPromise: false,
      label: "close day popover",
    });
    await wait(`!document.querySelector(".popover")`, 10000, "day popover closed");

    // 3. Settings modal over the clear-day dashboard.
    await evaluate(`document.querySelector('button[title="Settings"]')?.click()`, {
      awaitPromise: false,
      label: "open settings",
    });
    await wait(`!!document.querySelector(".settings-backdrop.open")`, 10000, "settings modal");
    await sleep(1200);
    await capture(cdp, "settings");
    await evaluate(`document.querySelector(".settings-close")?.click()`, {
      awaitPromise: false,
      label: "close settings",
    });
    await wait(`!document.querySelector(".settings-backdrop.open")`, 10000, "settings closed");

    // 4. Weather alert pill + its detail popover (Tokyo has alerts in dev-mock).
    await wait(`!!document.querySelector(".alert-pill")`, 15000, "alert pill");
    await evaluate(`document.querySelector(".alert-pill")?.click()`, {
      awaitPromise: false,
      label: "open alert popover",
    });
    await wait(`!!document.querySelector(".popover")`, 10000, "alert popover");
    await sleep(1200);
    await capture(cdp, "alerts");
    await pressEscape(cdp);
    await wait(`!document.querySelector(".popover")`, 10000, "alert popover closed");

    // 5. Rain at night.
    await selectCity(evaluate, wait, "Seattle");
    await capture(cdp, "rain-night");

    // 6. Clear night.
    await selectCity(evaluate, wait, "Oslo");
    await capture(cdp, "clear-night");

    // 7. Snow during the day: no saved city is snow-at-day, so force the scene.
    await selectCity(evaluate, wait, "Reykjavik");
    await evaluate(`window.__set(73, true, 0, 10, "270")`, {
      awaitPromise: false,
      label: "force snow day scene",
    });
    await settle();
    await capture(cdp, "snow-day");

    // 8. Thunderstorm at night.
    await selectCity(evaluate, wait, "Miami");
    await capture(cdp, "storm-night");

    // 9. Expanded radar over a clear day; tiles need time to load.
    await selectCity(evaluate, wait, "Tokyo");
    await evaluate(`document.querySelector(".radar-expand")?.click()`, {
      awaitPromise: false,
      label: "expand radar",
    });
    await wait(`!!document.querySelector(".radar.expanded")`, 10000, "expanded radar");
    await settle(10000);
    await capture(cdp, "radar-expanded");

    // 10. All tiles: grow the viewport to the main pane's full scroll height.
    await evaluate(`document.querySelector(".radar-expand")?.click()`, {
      awaitPromise: false,
      label: "collapse radar",
    });
    await wait(`!document.querySelector(".radar.expanded")`, 10000, "radar collapsed");
    await sleep(800);

    const scrollHeight = await evaluate(`Math.ceil(document.getElementById("main").scrollHeight)`, {
      awaitPromise: false,
      label: "main scroll height",
    });
    const tall = Math.min(3000, Number(scrollHeight) || VIEWPORT.height);
    console.log(`screenshots: all-tiles viewport height ${tall}px`);
    await setViewport(cdp, VIEWPORT.width, tall);
    await sleep(1200);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 85,
      fromSurface: true,
      captureBeyondViewport: true,
    });
    const file = path.join(SHOTS, "all-tiles.jpg");
    const buffer = Buffer.from(data, "base64");
    await fsp.writeFile(file, buffer);
    const kb = buffer.length / 1024;
    const size = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
    console.log(`screenshots/all-tiles.jpg  ${size}`);
    await setViewport(cdp, VIEWPORT.width, VIEWPORT.height);

    cdp.close();
  } finally {
    cdp.close();
    cleanupSync();
  }
}

run()
  .then(() => {
    cleanupSync();
    process.exit(0);
  })
  .catch((err) => fail(err));
