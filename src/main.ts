import "./styles.css";
import type { Location, WeatherBundle } from "./types";
import { describe, skyGradient } from "./theme";
import { getCached, getSaved, getWeather, saveLocation } from "./api";
import { state, set } from "./state";
import { renderHero } from "./ui/hero";
import { renderHourly } from "./ui/hourly";
import { renderDaily } from "./ui/daily";

const DEFAULT: Location = {
  name: "Berlin",
  country: "Germany",
  admin1: "Berlin",
  latitude: 52.52,
  longitude: 13.405,
};

let skyFront = 0;
let skyEls: HTMLDivElement[] = [];

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
  // force reflow so the transition triggers
  void back.offsetWidth;
  back.classList.add("active");
  front.classList.remove("active");
  skyFront = 1 - skyFront;
}

function renderMain(main: HTMLElement, b: WeatherBundle): void {
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

async function load(loc: Location, main: HTMLElement): Promise<void> {
  set({ current: loc, loading: true, error: null });
  if (!state.bundle) renderPlaceholder(main, "Loading weather\u2026");

  try {
    const b = await getWeather(loc, false);
    set({ bundle: b, loading: false });
    applySky(b);
    renderMain(main, b);
  } catch (err) {
    set({ loading: false, error: String(err) });
    renderError(main, () => void load(loc, main));
  }
}

async function init(): Promise<void> {
  const { main } = setupShell();

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

  // Show cached data instantly if present.
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

  await load(loc, main);

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

  setInterval(refresh, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

void init();
