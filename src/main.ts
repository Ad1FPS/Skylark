import "./styles.css";
import "./styles/cards.css";
import "./styles/sidebar.css";
import "./styles/radar.css";
import "./styles/nowcast.css";
import "./styles/locate.css";
import "./styles/fx.css";
import "./styles/titlebar.css";
import "./styles/settings.css";
import "./styles/detail.css";
import "./styles/popover.css";
import "./styles/glass.css";
import "./styles/moon.css";
import "./styles/averages.css";
import "./styles/windmap.css";
import "./styles/alerts.css";
import "./styles/day.css";
import { createTitlebar } from "./ui/titlebar";
import { openDetail, type DetailKind } from "./ui/detail";
import type { Location, WeatherBundle } from "./types";
import { describe, skyGradient } from "./theme";
import {
  getCached,
  getSaved,
  getWeather,
  saveLocation,
  locateIp,
  setCurrentLocation,
  setKeepAlive,
  setAlertNotifications,
  checkUpdate,
  installUpdate,
} from "./api";
import { state, set, subscribe, type LoadState, type State } from "./state";
import { renderHero } from "./ui/hero";
import { renderHourly } from "./ui/hourly";
import { renderAlertStrip } from "./ui/alerts";
import { renderDaily } from "./ui/daily";
import { renderCards } from "./ui/cards";
import { renderRadar } from "./ui/radar";
import { renderNowcast } from "./ui/nowcast";
import { initSidebar } from "./ui/sidebar";
import { createFx } from "./fx/engine";
import { createGlass, type Glass } from "./fx/glass";
import { setIconStyle } from "./icons";
import { sceneFor, sceneForCode } from "./scene";
import type { Fx } from "./fx/types";

const DEFAULT: Location = {
  name: "Berlin",
  country: "Germany",
  admin1: "Berlin",
  latitude: 52.52,
  longitude: 13.405,
};

let fx: Fx | null = null;
let glass: Glass | null = null;
let skyFront = 0;
let skyEls: HTMLDivElement[] = [];
let currentMain: HTMLElement | null = null;

const UPDATE_CHECK_DELAY = 10_000;
const UPDATE_CHECK_EVERY = 24 * 60 * 60 * 1000;
const UPDATE_CHECKED_AT = "skylark.updateCheckedAt";

let updateCheckScheduled = false;
let updateBar: HTMLElement | null = null;
let availableUpdate: { version: string } | null = null;
let updateDismissed = false;

// The browser's own menu (Back, Print, Save as) has no place in an app.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});

function setupShell(): { main: HTMLElement } {
  const app = document.getElementById("app");
  if (!app) throw new Error("missing #app");

  const sky = document.createElement("div");
  sky.className = "sky";
  skyEls = [0, 1].map(() => {
    const l = document.createElement("div");
    l.className = "sky-layer";
    sky.appendChild(l);
    return l;
  });

  const sidebar = document.createElement("aside");
  sidebar.id = "sidebar";
  sidebar.className = "sidebar";

  const main = document.createElement("main");
  main.id = "main";

  app.replaceChildren(sky, sidebar, main, createTitlebar());
  fx = createFx(sky);
  setIconStyle(state.settings.icons);
  fx.setSmooth(state.settings.fps === "60");
  glass = createGlass();
  glass.setSmooth(state.settings.fps === "60");
  return { main };
}

/** Crossfade to a new sky gradient; a no-op when it is already showing. */
let lastKeepAlive: string | null = null;
let lastAlertNotifications: string | null = null;

/**
 * Lets the backend mark the page hidden or visible when it hides or shows the window.
 * Everything animated already pauses on `document.hidden` and `visibilitychange`.
 */
function installHiddenOverride(): void {
  const real = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")?.get;
  let forced = false;
  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => forced || (real ? real.call(document) === true : false),
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (forced || (real ? real.call(document) === true : false) ? "hidden" : "visible"),
    });
  } catch {
    return;
  }
  (window as unknown as { __skylarkVisible: (v: boolean) => void }).__skylarkVisible = (v) => {
    forced = !v;
    document.dispatchEvent(new Event("visibilitychange"));
  };
}

function setSkyGradient(grad: string): void {
  const back = skyEls[1 - skyFront];
  const front = skyEls[skyFront];
  if (front.style.backgroundImage === grad) return;

  back.style.backgroundImage = grad;
  void back.offsetWidth;
  back.classList.add("active");
  front.classList.remove("active");
  skyFront = 1 - skyFront;
}

function applySky(bundle: WeatherBundle, instant = false): void {
  const c = bundle.current;
  setSkyGradient(skyGradient(describe(c.weatherCode, c.isDay).kind, c.isDay));
  // The scene changes with wind and rain intensity even when the gradient does not.
  const scene = sceneFor(bundle);
  fx?.setScene(scene, instant);
  glass?.setScene(scene);
}

function renderMain(main: HTMLElement, b: WeatherBundle): void {
  currentMain = main;
  const strip = renderAlertStrip(b, state.settings);
  strip.addEventListener("click", (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (pill?.dataset.detail) openDetail("alert", b, state.settings, pill, Number(pill.dataset.day ?? 0));
  });
  main.replaceChildren(
    renderHero(b, state.settings),
    strip,
    renderHourly(b, state.settings),
  );
  const grid = document.createElement("section");
  grid.id = "grid";
  grid.className = "grid";
  const daily = renderDaily(b, state.settings);
  daily.classList.add("span-2", "row-2");
  grid.appendChild(daily);
  const radar = renderRadar(b);
  const nowcast = renderNowcast(b, state.settings);
  if (nowcast) radar.appendChild(nowcast);
  grid.appendChild(radar);
  for (const card of renderCards(b, state.settings)) grid.appendChild(card);
  grid.addEventListener("click", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (tile?.dataset.detail) openDetail(tile.dataset.detail as DetailKind, b, state.settings, tile, tile.dataset.day ? Number(tile.dataset.day) : undefined);
  });
  main.appendChild(grid);
  renderUpdateBar(main);
  scheduleUpdateCheck();
}

function removeUpdateBar(): void {
  updateBar?.remove();
  updateBar = null;
}

/** Shows (or drops) the update bar at the bottom of the main pane. */
function renderUpdateBar(main: HTMLElement): void {
  removeUpdateBar();
  const update = availableUpdate;
  if (!update || updateDismissed) return;

  const bar = document.createElement("div");
  bar.className = "update-bar";
  bar.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "update-bar-text";
  text.textContent = `Skylark ${update.version} is available`;

  const actions = document.createElement("div");
  actions.className = "update-bar-actions";

  const install = document.createElement("button");
  install.type = "button";
  install.className = "update-bar-btn update-bar-install";
  install.textContent = "Install and restart";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "update-bar-btn update-bar-later";
  later.textContent = "Later";

  install.addEventListener("click", () => {
    install.disabled = true;
    later.disabled = true;
    install.textContent = "Installing...";
    text.textContent = `Installing Skylark ${update.version}...`;
    void installUpdate().catch(() => {
      install.disabled = false;
      later.disabled = false;
      install.textContent = "Install and restart";
      text.textContent = "Could not install the update";
    });
  });

  later.addEventListener("click", () => {
    updateDismissed = true;
    removeUpdateBar();
  });

  actions.append(install, later);
  bar.append(text, actions);
  main.appendChild(bar);
  updateBar = bar;
}

/** Runs once the first weather is on screen, so startup is not delayed by the network. */
function scheduleUpdateCheck(): void {
  if (updateCheckScheduled) return;
  updateCheckScheduled = true;
  window.setTimeout(() => void autoCheckForUpdate(), UPDATE_CHECK_DELAY);
}

async function autoCheckForUpdate(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const last = Number(window.localStorage.getItem(UPDATE_CHECKED_AT));
    if (Number.isFinite(last) && Date.now() - last < UPDATE_CHECK_EVERY) return;
  } catch {
    /* Storage unavailable: let the check run anyway. */
  }
  try {
    window.localStorage.setItem(UPDATE_CHECKED_AT, String(Date.now()));
  } catch {
    /* ignore */
  }

  try {
    const update = await checkUpdate();
    if (!update) return;
    availableUpdate = update;
    updateDismissed = false;
    if (currentMain) renderUpdateBar(currentMain);
  } catch {
    /* Automatic checks are best effort; failures stay invisible. */
  }
}

function renderPlaceholder(main: HTMLElement, text: string): void {
  const box = document.createElement("div");
  box.className = "loading";
  box.textContent = text;
  main.replaceChildren(box);
}

function renderError(main: HTMLElement, message: string, retry: () => void): void {
  const box = document.createElement("div");
  box.className = "error";
  const msg = document.createElement("div");
  msg.textContent = message || "Something went wrong.";
  const btn = document.createElement("button");
  btn.textContent = "Retry";
  btn.addEventListener("click", retry);
  box.append(msg, btn);
  main.replaceChildren(box);
}

/** Bumped by every load; an answer whose number is no longer current belongs to a superseded load. */
let loadSeq = 0;

/**
 * The only place the load phase changes (see `LoadState` in state.ts).
 * - "select": the user picked `loc` (or the app started): show its cache at once, then fetch.
 * - "refresh": quietly refetch `loc`; skipped while another load runs, and a failure keeps what is shown.
 */
async function loadWeather(loc: Location, mode: "select" | "refresh"): Promise<void> {
  const main = currentMain;
  if (!main) return;
  if (mode === "refresh" && state.load.phase === "loading") return;

  const seq = ++loadSeq;
  const superseded = (): boolean => seq !== loadSeq;
  const before = state.load;

  const prev = state.bundle?.location;
  // Jump the sky straight to the new city instead of easing from the old one.
  let snap = !!prev && (prev.latitude !== loc.latitude || prev.longitude !== loc.longitude);
  const show = (b: WeatherBundle, load?: LoadState): void => {
    set(load ? { bundle: b, load } : { bundle: b });
    applySky(b, snap);
    snap = false;
    renderMain(main, b);
  };

  set({ current: loc, load: { phase: "loading", loc } });

  if (mode === "select") {
    setCurrentLocation(loc).catch(() => {});
    try {
      const cached = await getCached(loc);
      if (superseded()) return;
      if (cached) show(cached);
      else if (!state.bundle) renderPlaceholder(main, "Loading weather\u2026");
    } catch {
      /* no cache */
    }
  }

  try {
    const b = await getWeather(loc, false);
    if (superseded()) return;
    show(b, { phase: "ready", loc });
  } catch (err) {
    if (superseded()) return;
    if (mode === "refresh") {
      // Keep whatever is on screen: the last good bundle, or the error with its Retry button.
      set({ load: before.phase === "idle" ? { phase: "error", loc, message: String(err) } : before });
      return;
    }
    const message = String(err);
    set({ load: { phase: "error", loc, message } });
    renderError(main, message, () => void loadWeather(loc, "select"));
  }
}

async function init(): Promise<void> {
  const { main } = setupShell();
  currentMain = main;

  // Dev-only weather preview panel: http://localhost:1420/?fx=1
  if (import.meta.env.DEV && location.search.includes("fx=1")) {
    void import("./fx/debug").then((m) =>
      m.initFxDebug((i) => {
        setSkyGradient(skyGradient(describe(i.code, i.isDay).kind, i.isDay));
        const scene = sceneForCode(i);
        fx?.setScene(scene);
        glass?.setScene(scene);
      }),
    );
  }

  initSidebar(document.getElementById("sidebar")!, (loc) => {
    void loadWeather(loc, "select");
  });

  // Hiding the window to the tray (Keep ready mode) does not make WebView2 report the page as hidden,
  // so the backend tells us, and every animation that watches document.hidden pauses.
  installHiddenOverride();

  // Re-render on settings changes without refetching. Other state changes render where they happen.
  let lastSettings = state.settings;
  const sync = (s: State): void => {
    main.dataset.phase = s.load.phase;
    // Must run before the re-render below so every icon picks up the new style.
    setIconStyle(s.settings.icons);
    if (s.settings.keepAlive !== lastKeepAlive) {
      lastKeepAlive = s.settings.keepAlive;
      void setKeepAlive(lastKeepAlive === "on");
    }
    if (s.settings.alertNotifications !== lastAlertNotifications) {
      lastAlertNotifications = s.settings.alertNotifications;
      void setAlertNotifications(lastAlertNotifications === "on");
    }
    fx?.setSmooth(s.settings.fps === "60");
    glass?.setSmooth(s.settings.fps === "60");
    if (s.settings !== lastSettings) {
      lastSettings = s.settings;
      if (s.bundle && main.querySelector("#grid")) renderMain(main, s.bundle);
    }
  };
  subscribe(sync);
  // Push the saved Keep ready and alert-notification choices to the backend now, not on the first change.
  sync(state);

  const seqAtStart = loadSeq;
  let saved: Location[] = [];
  try {
    saved = await getSaved();
  } catch {
    saved = [];
  }
  if (saved.length === 0) {
    let located: Location | null = null;
    try {
      located = await locateIp();
    } catch {
      located = null;
    }
    const start = located ?? DEFAULT;
    try {
      saved = await saveLocation(start);
    } catch {
      saved = [start];
    }
    if (saved.length === 0) saved = [start];
  }
  set({ saved });
  // A city picked while startup was still locating wins over the default first city.
  if (loadSeq === seqAtStart) await loadWeather(saved[0] ?? DEFAULT, "select");

  const refresh = () => {
    if (state.current) void loadWeather(state.current, "refresh");
  };

  setInterval(refresh, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

void init();
