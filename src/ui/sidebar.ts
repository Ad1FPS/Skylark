import type { Location, Settings, WeatherBundle } from "../types";
import { state, set, subscribe } from "../state";
import { searchCity, saveLocation, removeLocation, getWeather, getCached, locateIp } from "../api";
import { esc, localClock, saveSettings, temp, tempDeg } from "../format";
import { describe } from "../theme";
import { icon } from "../icons";

const cache = new Map<string, WeatherBundle>();
const fetching = new Set<string>();

function key(loc: Location): string {
  return `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
}

function sameLoc(a: Location, b: Location | null): boolean {
  if (!b) return false;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function secondary(loc: Location): string {
  const parts = [loc.admin1, loc.country].filter((x): x is string => !!x);
  return parts.join(", ");
}

export function initSidebar(root: HTMLElement, onSelect: (loc: Location) => void): void {
  // Toggle button (mobile only).
  const existingToggle = document.querySelector(".sidebar-toggle");
  if (!existingToggle) {
    const toggle = document.createElement("button");
    toggle.className = "sidebar-toggle";
    toggle.setAttribute("aria-label", "Toggle sidebar");
    toggle.innerHTML = icon("menu", 20);
    toggle.addEventListener("click", () => root.classList.toggle("open"));
    document.body.appendChild(toggle);
  }

  // Backdrop for mobile.
  let backdrop: HTMLButtonElement | null = null;
  const ensureBackdrop = (): HTMLButtonElement => {
    if (!backdrop) {
      backdrop = document.createElement("button");
      backdrop.className = "sidebar-backdrop";
      backdrop.setAttribute("aria-label", "Close");
      backdrop.addEventListener("click", () => root.classList.remove("open"));
      document.body.appendChild(backdrop);
    }
    return backdrop;
  };
  ensureBackdrop();

  root.replaceChildren();

  // Search box (built once).
  const searchWrap = document.createElement("div");
  searchWrap.className = "side-search";
  searchWrap.innerHTML = `
    <span class="side-search-icon">${icon("search", 16)}</span>
    <input type="search" class="side-search-input" placeholder="Search city" autocomplete="off" spellcheck="false"/>
  `;
  const input = searchWrap.querySelector("input") as HTMLInputElement;

  // Locate button (built once, next to the search box).
  const locateBtn = document.createElement("button");
  locateBtn.type = "button";
  locateBtn.className = "locate-btn";
  locateBtn.title = "Uses your IP address to find your approximate location";
  const locateLabel = (): string => `${icon("locate", 16)}<span>Use my location</span>`;
  locateBtn.innerHTML = locateLabel();

  const locateError = document.createElement("div");
  locateError.className = "locate-error";
  locateError.hidden = true;

  const locateWrap = document.createElement("div");
  locateWrap.className = "locate-wrap";
  locateWrap.append(locateBtn, locateError);

  let errTimer: number | undefined;

  locateBtn.addEventListener("click", () => {
    if (locateBtn.disabled) return;
    locateBtn.disabled = true;
    locateBtn.innerHTML = `<span>Locating\u2026</span>`;
    void (async () => {
      try {
        const loc = await locateIp();
        try {
          const updated = await saveLocation(loc);
          set({ saved: updated });
        } catch {
          /* ignore save errors */
        }
        onSelect(loc);
      } catch {
        locateError.textContent = "Could not find your location";
        locateError.hidden = false;
        if (errTimer !== undefined) window.clearTimeout(errTimer);
        errTimer = window.setTimeout(() => {
          locateError.hidden = true;
        }, 4000);
      } finally {
        locateBtn.disabled = false;
        locateBtn.innerHTML = locateLabel();
      }
    })();
  });

  const results = document.createElement("div");
  results.className = "side-results";
  results.hidden = true;

  const list = document.createElement("div");
  list.className = "side-list";

  const settingsBox = document.createElement("div");
  settingsBox.className = "side-settings";

  root.append(searchWrap, locateWrap, results, list, settingsBox);

  let reqId = 0;
  let timer: number | undefined;

  input.addEventListener("input", () => {
    if (timer !== undefined) window.clearTimeout(timer);
    const q = input.value.trim();
    if (!q) {
      results.hidden = true;
      results.replaceChildren();
      return;
    }
    timer = window.setTimeout(() => void runSearch(q), 250);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      results.hidden = true;
      results.replaceChildren();
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchWrap.contains(e.target as Node) && !results.contains(e.target as Node)) {
      results.hidden = true;
    }
  });

  const runSearch = async (q: string): Promise<void> => {
    const id = ++reqId;
    try {
      const found = await searchCity(q);
      if (id !== reqId) return;
      renderResults(found);
    } catch {
      if (id !== reqId) return;
      renderResults([]);
    }
  };

  const renderResults = (found: Location[]): void => {
    results.replaceChildren();
    results.hidden = false;
    if (found.length === 0) {
      const empty = document.createElement("div");
      empty.className = "side-empty";
      empty.textContent = "No matches";
      results.appendChild(empty);
      return;
    }
    for (const loc of found.slice(0, 8)) {
      const item = document.createElement("button");
      item.className = "side-result";
      item.innerHTML = `
        <span class="side-result-name">${esc(loc.name)}</span>
        <span class="side-result-sub">${esc(secondary(loc))}</span>
      `;
      item.addEventListener("click", () => {
        void (async () => {
          try {
            const updated = await saveLocation(loc);
            set({ saved: updated });
          } catch {
            /* ignore */
          }
          input.value = "";
          results.hidden = true;
          results.replaceChildren();
          input.blur();
          onSelect(loc);
        })();
      });
      results.appendChild(item);
    }
  };

  // Prefetch temps for saved cities.
  const ensureTemps = (saved: Location[]): void => {
    for (const loc of saved) {
      const k = key(loc);
      if (cache.has(k) || fetching.has(k)) continue;
      void (async () => {
        fetching.add(k);
        try {
          const cached = await getCached(loc);
          if (cached) {
            cache.set(k, cached);
            renderList();
          }
          const fresh = await getWeather(loc, false);
          cache.set(k, fresh);
          renderList();
        } catch {
          /* ignore */
        } finally {
          fetching.delete(k);
        }
      })();
    }
  };

  let menu: HTMLElement | null = null;
  const closeMenu = (): void => {
    menu?.remove();
    menu = null;
  };
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  window.addEventListener("blur", closeMenu);

  const showMenu = (x: number, y: number, items: { label: string; run: () => void }[]): void => {
    closeMenu();
    const m = document.createElement("div");
    m.className = "ctx-menu";
    for (const it of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = it.label;
      btn.addEventListener("click", () => {
        closeMenu();
        it.run();
      });
      m.appendChild(btn);
    }
    document.body.appendChild(m);
    m.style.left = `${Math.min(x, window.innerWidth - m.offsetWidth - 8)}px`;
    m.style.top = `${Math.min(y, window.innerHeight - m.offsetHeight - 8)}px`;
    menu = m;
  };

  const renderList = (): void => {
    const saved = state.saved;
    ensureTemps(saved);
    list.replaceChildren();
    if (saved.length === 0) {
      const empty = document.createElement("div");
      empty.className = "side-empty";
      empty.textContent = "No saved cities";
      list.appendChild(empty);
      return;
    }
    for (const loc of saved) {
      const active = sameLoc(loc, state.current);
      const row = document.createElement("div");
      row.className = `city${active ? " active" : ""}`;

      const b = cache.get(key(loc));
      const cond = b ? describe(b.current.weatherCode, b.current.isDay) : null;
      const tempTxt = b ? tempDeg(b.current.temperature, state.settings) : "\u2013";

      const day = b?.daily[0];
      const hl = day ? `H:${temp(day.tempMax, state.settings)}° L:${temp(day.tempMin, state.settings)}°` : "";
      const offset = b ? b.utcOffsetSeconds : null;
      row.innerHTML = `
        <button class="city-main" type="button">
          <span class="city-text">
            <span class="city-top">
              <span class="city-name">${esc(loc.name)}</span>
              <span class="city-temp">${esc(tempTxt)}</span>
            </span>
            <span class="city-time"${offset !== null ? ` data-offset="${offset}"` : ""}>${offset !== null ? esc(localClock(offset, state.settings)) : esc(secondary(loc))}</span>
            <span class="city-bottom">
              <span class="city-cond">${esc(cond ? cond.label : "")}</span>
              <span class="city-hl">${esc(hl)}</span>
            </span>
          </span>
        </button>
        <button class="city-remove" type="button" aria-label="Remove">${icon("close", 12)}</button>
      `;

      const mainBtn = row.querySelector(".city-main") as HTMLButtonElement;
      mainBtn.addEventListener("click", () => {
        root.classList.remove("open");
        onSelect(loc);
      });

      const remove = (): void => {
        void (async () => {
          try {
            const updated = await removeLocation(loc.latitude, loc.longitude);
            set({ saved: updated });
            if (sameLoc(loc, state.current) && updated.length > 0) {
              onSelect(updated[0]);
            }
          } catch {
            /* ignore */
          }
        })();
      };

      const removeBtn = row.querySelector(".city-remove") as HTMLButtonElement;
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        remove();
      });

      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [{ label: `Remove ${loc.name}`, run: remove }]);
      });

      list.appendChild(row);
    }
  };

  const renderSettings = (): void => {
    const s = state.settings;
    settingsBox.innerHTML = `<div class="side-section-title">SETTINGS</div>`;
    settingsBox.appendChild(segmented([
      { label: "\u00B0C", value: "c", active: s.temp === "c" },
      { label: "\u00B0F", value: "f", active: s.temp === "f" },
    ], (v) => update({ ...state.settings, temp: v as Settings["temp"] })));
    settingsBox.appendChild(segmented([
      { label: "km/h", value: "kmh", active: s.wind === "kmh" },
      { label: "mph", value: "mph", active: s.wind === "mph" },
      { label: "m/s", value: "ms", active: s.wind === "ms" },
    ], (v) => update({ ...state.settings, wind: v as Settings["wind"] })));
    settingsBox.appendChild(segmented([
      { label: "24h", value: "24", active: s.clock === "24" },
      { label: "12h", value: "12", active: s.clock === "12" },
    ], (v) => update({ ...state.settings, clock: v as Settings["clock"] })));
  };

  interface Seg { label: string; value: string; active: boolean; }
  const segmented = (items: Seg[], onPick: (v: string) => void): HTMLElement => {
    const box = document.createElement("div");
    box.className = "seg";
    for (const it of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `seg-btn${it.active ? " active" : ""}`;
      btn.textContent = it.label;
      btn.addEventListener("click", () => onPick(it.value));
      box.appendChild(btn);
    }
    return box;
  };

  let lastSettings = state.settings;
  const update = (s: Settings): void => {
    set({ settings: s });
    saveSettings(s);
  };

  subscribe((s) => {
    if (s.saved !== undefined) renderList();
    if (s.settings !== lastSettings) {
      lastSettings = s.settings;
      renderSettings();
    }
  });

  renderList();
  renderSettings();

  window.setInterval(() => {
    for (const el of list.querySelectorAll<HTMLElement>(".city-time[data-offset]")) {
      el.textContent = localClock(Number(el.dataset.offset), state.settings);
    }
  }, 15000);
}
