import "./styles.css";
import "./styles/cards.css";
import "./styles/sidebar.css";
import type { Location, WeatherBundle } from "./types";
import { describe, skyGradient } from "./theme";
import { getCached, getSaved, getWeather, saveLocation } from "./api";
import { state, set, subscribe } from "./state";
import { renderHero } from "./ui/hero";
import { renderHourly } from "./ui/hourly";
import { renderDaily } from "./ui/daily";
import { renderCards } from "./ui/cards";
import { initSidebar } from "./ui/sidebar";

const DEFAULT: Location = {
  name: "Berlin",
  country: "Germany",
  admin1: "Berlin",
  latitude: 52.52,
  longitude: 13.405,
};

let skyFront = 0;
let skyEls: HTMLDivElement[] = [];
let currentMain: HTMLElement | null = null;

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

  app.replaceChildren(sky, sidebar, main);
  return { main };
}

function applySky(bundle: WeatherBundle): void {
  const c = bundle.current;
  const cond = describe(c.weatherCode, c.isDay);
  const grad = skyGradient(cond.kind, c.isDay);
  const back = skyEls[1 - skyFront];
  const front = skyEls[skyFront];
  if (front.style.backgroundImage === grad) return;

  back.style.backgroundImage = grad;
  void back.offsetWidth;
  back.classList.add("active");
  front.classList.remove("active");
  skyFront = 1 - skyFront;
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
  for (const card of renderCards(b, state.settings)) grid.appendChild(card);
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

  set({ current: loc, loading: true, error: null });

  try {
    const cached = await getCached(loc);
    if (cached) {
      set({ bundle: cached });
      applySky(cached);
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
    applySky(b);
    renderMain(main, b);
  } catch (err) {
    set({ loading: false, error: String(err) });
    renderError(main, () => void selectLocation(loc));
  }
}

async function init(): Promise<void> {
  const { main } = setupShell();
  currentMain = main;

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
    try {
      saved = await saveLocation(DEFAULT);
    } catch {
      saved = [DEFAULT];
    }
  }
  set({ saved });
  const loc = saved[0] ?? DEFAULT;

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
