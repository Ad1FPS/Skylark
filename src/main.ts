import "./styles.css";
import "./styles/cards.css";
import "./styles/sidebar.css";
import "./styles/radar.css";
import "./styles/nowcast.css";
import "./styles/locate.css";
import "./styles/fx.css";
import "./styles/titlebar.css";
import "./styles/detail.css";
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
} from "./api";
import { state, set, subscribe } from "./state";
import { renderHero } from "./ui/hero";
import { renderHourly } from "./ui/hourly";
import { renderDaily } from "./ui/daily";
import { renderCards } from "./ui/cards";
import { renderRadar } from "./ui/radar";
import { renderNowcast } from "./ui/nowcast";
import { initSidebar } from "./ui/sidebar";
import { createFx } from "./fx/engine";
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
let skyFront = 0;
let skyEls: HTMLDivElement[] = [];
let currentMain: HTMLElement | null = null;

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
  fx.setSmooth(state.settings.fps === "60");
  return { main };
}

/** Crossfade to a new sky gradient; a no-op when it is already showing. */
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
  fx?.setScene(sceneFor(bundle), instant);
}

function renderMain(main: HTMLElement, b: WeatherBundle): void {
  currentMain = main;
  main.replaceChildren(
    renderHero(b, state.settings),
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
    if (tile?.dataset.detail) openDetail(tile.dataset.detail as DetailKind, b, state.settings);
  });
  main.appendChild(grid);
}

function renderPlaceholder(main: HTMLElement, text: string): void {
  const box = document.createElement("div");
  box.className = "loading";
  box.textContent = text;
  main.replaceChildren(box);
}

function renderError(main: HTMLElement, retry: () => void): void {
  const box = document.createElement("div");
  box.className = "error";
  const msg = document.createElement("div");
  msg.textContent = state.error ?? "Something went wrong.";
  const btn = document.createElement("button");
  btn.textContent = "Retry";
  btn.addEventListener("click", retry);
  box.append(msg, btn);
  main.replaceChildren(box);
}

async function selectLocation(loc: Location): Promise<void> {
  const main = currentMain ?? document.getElementById("main");
  if (!main) return;

  const prev = state.bundle?.location;
  let snap = !!prev && (prev.latitude !== loc.latitude || prev.longitude !== loc.longitude);
  set({ current: loc, loading: true, error: null });
  setCurrentLocation(loc).catch(() => {});

  try {
    const cached = await getCached(loc);
    if (cached) {
      set({ bundle: cached });
      applySky(cached, snap);
      snap = false;
      renderMain(main, cached);
    } else if (!state.bundle) {
      renderPlaceholder(main, "Loading weather\u2026");
    }
  } catch {
    /* no cache */
  }

  try {
    const b = await getWeather(loc, false);
    set({ bundle: b, loading: false });
    applySky(b, snap);
    renderMain(main, b);
  } catch (err) {
    set({ loading: false, error: String(err) });
    renderError(main, () => void selectLocation(loc));
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
        fx?.setScene(sceneForCode(i));
      }),
    );
  }

  initSidebar(document.getElementById("sidebar")!, (loc) => {
    void selectLocation(loc);
  });

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
  const loc = saved[0] ?? DEFAULT;
  setCurrentLocation(loc).catch(() => {});

  try {
    const cached = await getCached(loc);
    if (cached) {
      set({ bundle: cached, current: loc });
      applySky(cached);
      renderMain(main, cached);
    }
  } catch {
    /* no cache */
  }

  set({ current: loc, loading: true, error: null });
  try {
    const b = await getWeather(loc, false);
    set({ bundle: b, loading: false });
    applySky(b);
    renderMain(main, b);
  } catch (err) {
    set({ loading: false, error: String(err) });
    renderError(main, () => void selectLocation(loc));
  }

  const refresh = () => {
    const cur = state.current;
    if (!cur || state.loading) return;
    void (async () => {
      try {
        const b = await getWeather(cur, false);
        set({ bundle: b });
        applySky(b);
        renderMain(main, b);
      } catch {
        /* keep last bundle */
      }
    })();
  };

  // Re-render on unit changes without refetching.
  subscribe((s) => {
    fx?.setSmooth(s.settings.fps === "60");
    if (s.bundle && s.settings) {
      const m = currentMain;
      if (m && m.querySelector("#grid")) renderMain(m, s.bundle);
    }
  });

  setInterval(refresh, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

void init();
