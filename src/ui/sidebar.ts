import type { Location, Settings, WeatherBundle } from "../types";
import { state, set, subscribe } from "../state";
import { searchCity, saveLocation, removeLocation, getWeather, getCached, locateIp } from "../api";
import { esc, localClock, saveSettings, temp, tempDeg } from "../format";
import { describe, skyGradient } from "../theme";
import { icon } from "../icons";
import { sceneFor } from "../scene";
import { loadAlerts, onAlertsChange, peekAlerts, severityColor, worstSeverity } from "../alerts/store";
import { addMiniSky } from "../fx/minisky";
import type { Scene } from "../fx/types";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

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
    const pendingSkies: { sky: HTMLCanvasElement; scene: Scene }[] = [];
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
      // Each row wears its own city's sky, like the macOS sidebar.
      if (b && cond) {
        row.style.backgroundImage = `linear-gradient(rgba(8,16,36,.2), rgba(8,16,36,.2)), ${skyGradient(cond.kind, b.current.isDay)}`;
        row.classList.add("has-sky");
      }

      // A small warning mark when the city has an active official alert.
      void loadAlerts(loc);
      const worst = worstSeverity(peekAlerts(loc));
      const alertMark = worst
        ? `<span class="city-alert" style="--sev:${severityColor(worst)}" title="Weather alert">${icon("alert", 12)}</span>`
        : "";

      const day = b?.daily[0];
      const hl = day ? `H:${temp(day.tempMax, state.settings)}° L:${temp(day.tempMin, state.settings)}°` : "";
      const offset = b ? b.utcOffsetSeconds : null;
      row.innerHTML = `
        <button class="city-main" type="button">
          <span class="city-text">
            <span class="city-top">
              <span class="city-name">${esc(loc.name)}${alertMark}</span>
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

      // A live miniature of the city's sky behind the text.
      if (b) {
        const sky = document.createElement("canvas");
        sky.className = "city-sky";
        sky.setAttribute("aria-hidden", "true");
        row.prepend(sky);
        pendingSkies.push({ sky, scene: sceneFor(b) });
      }

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
    // The canvases need to be in the document to be measured.
    for (const p of pendingSkies) addMiniSky(p.sky, p.scene);
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
    settingsBox.appendChild(segmented([
      { label: "30 fps", value: "30", active: s.fps === "30" },
      { label: "60 fps", value: "60", active: s.fps === "60" },
    ], (v) => update({ ...state.settings, fps: v as Settings["fps"] })));
    const iconLabel = document.createElement("div");
    iconLabel.className = "side-setting-label";
    iconLabel.textContent = "Weather icons";
    settingsBox.append(iconLabel, segmented([
      { label: "Mono", value: "mono", active: s.icons === "mono" },
      { label: "Color", value: "color", active: s.icons === "color" },
    ], (v) => update({ ...state.settings, icons: v as Settings["icons"] })));
    // Only offered inside the real app; the browser preview has no autostart plugin.
    const keepLabel = document.createElement("div");
    keepLabel.className = "side-setting-label";
    keepLabel.textContent = "Keep ready when closed";
    keepLabel.title = "On: closing the window only hides it, so it reopens instantly but about 110 MB stays in use. Off: the window is freed (about 6 MB) and takes a moment to reopen.";
    settingsBox.append(keepLabel, segmented([
      { label: "Off", value: "off", active: s.keepAlive === "off" },
      { label: "On", value: "on", active: s.keepAlive === "on" },
    ], (v) => update({ ...state.settings, keepAlive: v as Settings["keepAlive"] })));
    const alertLabel = document.createElement("div");
    alertLabel.className = "side-setting-label";
    alertLabel.textContent = "Alert notifications";
    alertLabel.title = "Show a system notification when a new official weather warning (moderate or worse) is issued for your current location. Available in the US and Germany.";
    settingsBox.append(alertLabel, segmented([
      { label: "Off", value: "off", active: s.alertNotifications === "off" },
      { label: "On", value: "on", active: s.alertNotifications === "on" },
    ], (v) => update({ ...state.settings, alertNotifications: v as Settings["alertNotifications"] })));
    if (autostart !== null) {
      const label = document.createElement("div");
      label.className = "side-setting-label";
      label.textContent = "Start with Windows";
      settingsBox.append(label, segmented([
        { label: "Off", value: "off", active: !autostart },
        { label: "On", value: "on", active: autostart },
      ], (v) => void setAutostart(v === "on")));
    }
  };

  let autostart: boolean | null = null;
  const setAutostart = async (on: boolean): Promise<void> => {
    try {
      if (on) await enable();
      else await disable();
      autostart = (await isEnabled()) === true;
    } catch {
      /* keep the previous state */
    }
    renderSettings();
  };
  void isEnabled()
    .then((v) => {
      if (typeof v === "boolean") {
        autostart = v;
        renderSettings();
      }
    })
    .catch(() => {});

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

  // Re-draw the rows when a city's alerts change (only fires on real changes, so no loop).
  onAlertsChange(() => renderList());

  renderList();
  renderSettings();

  window.setInterval(() => {
    for (const el of list.querySelectorAll<HTMLElement>(".city-time[data-offset]")) {
      el.textContent = localClock(Number(el.dataset.offset), state.settings);
    }
  }, 15000);
}
