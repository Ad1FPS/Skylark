import type { Settings, WeatherBundle } from "../types";
import { esc, saveSettings } from "../format";
import { state, set } from "../state";
import { icon } from "../icons";
import { loadRadar, PROVIDERS, type RadarSource } from "../radar/providers";

const TILE = 256;
const DEFAULT_Z = 6;
const MAX_LAT = 80;
const RADAR_OPACITY = 0.8;

interface View {
  center: { lat: number; lon: number };
  zoom: number;
}

interface TileKey {
  z: number;
  x: number;
  y: number;
}


/* ---------- projection (256-px Web Mercator) ---------- */

function lonToWorldX(lon: number, scale: number): number {
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat: number, scale: number): number {
  const rad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return ((1 - merc / Math.PI) / 2) * scale;
}

function worldXToLon(x: number, scale: number): number {
  return (x / scale) * 360 - 180;
}

function worldYToLat(y: number, scale: number): number {
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/* ---------- tile urls ---------- */

function baseTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/* ---------- time label ---------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clockLabel(unix: number, offset: number): string {
  const d = new Date((unix + offset) * 1000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function frameLabel(frameTime: number, nowTime: number, offset: number): string {
  const base = clockLabel(frameTime, offset);
  if (frameTime === nowTime) return `${base} (now)`;
  const diffMin = Math.round((frameTime - nowTime) / 60);
  return `${base}  ${diffMin > 0 ? "+" : "\u2212"}${Math.abs(diffMin)} min`;
}

/* ---------- main render ---------- */

export function renderRadar(b: WeatherBundle, settings: Settings): HTMLElement {
  const card = document.createElement("section");
  card.className = "card radar span-2";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.innerHTML = `${icon("drop", 13)}<span>${esc("RADAR")}</span>`;
  const picker = document.createElement("select");
  picker.className = "radar-source";
  picker.setAttribute("aria-label", "Radar source");
  const choices: [Settings["radar"], string][] = [
    ["auto", "Auto"],
    ...PROVIDERS.map((p): [Settings["radar"], string] => [p.id, p.name]),
  ];
  for (const [value, label] of choices) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    picker.appendChild(opt);
  }
  picker.value = settings.radar;
  picker.addEventListener("change", () => {
    const next = { ...state.settings, radar: picker.value as Settings["radar"] };
    set({ settings: next });
    saveSettings(next);
  });
  title.appendChild(picker);
  card.appendChild(title);

  const map = document.createElement("div");
  map.className = "radar-map";
  const placeholder = document.createElement("div");
  placeholder.className = "radar-loading";
  placeholder.textContent = "Loading radar";
  map.appendChild(placeholder);
  card.appendChild(map);

  const controls = document.createElement("div");
  controls.className = "radar-controls";
  const playBtn = document.createElement("button");
  playBtn.className = "radar-play";
  playBtn.type = "button";
  playBtn.setAttribute("aria-label", "Play");
  playBtn.innerHTML = playIcon();
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "radar-slider";
  slider.min = "0";
  slider.max = "0";
  slider.step = "1";
  slider.value = "0";
  slider.setAttribute("aria-label", "Radar frame");
  const timeLabel = document.createElement("span");
  timeLabel.className = "radar-time";
  timeLabel.textContent = "--:--";
  controls.append(playBtn, slider, timeLabel);
  card.appendChild(controls);

  let started = false;
  let disposed = false;
  const init = () => {
    if (started || disposed) return;
    started = true;
    placeholder.remove();
    void startRadar({
      b,
      card,
      map,
      playBtn,
      slider,
      timeLabel,
      pick: settings.radar,
      onProvider: (name) => {
        // In Auto mode, show which provider actually answered.
        const auto = picker.querySelector<HTMLOptionElement>('option[value="auto"]');
        if (auto) auto.textContent = settings.radar === "auto" && name ? `Auto \u00B7 ${name}` : "Auto";
      },
      isDisposed: () => disposed,
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      if (!card.isConnected) {
        cleanup();
        return;
      }
      for (const e of entries) {
        if (e.isIntersecting) init();
        else if (started) ownerOf(map)?.pause();
      }
    },
    { rootMargin: "200px" },
  );

  const cleanup = () => {
    disposed = true;
    io.disconnect();
    ownerOf(map)?.dispose();
  };

  // Attach the observer once the element is in the document.
  const attach = () => {
    if (card.isConnected) io.observe(card);
    else requestAnimationFrame(attach);
  };
  requestAnimationFrame(attach);

  return card;
}

function ownerOf(map: HTMLElement): RadarOwner | undefined {
  return (map as unknown as { _radarOwner?: RadarOwner })._radarOwner;
}

interface RadarOwner {
  pause(): void;
  dispose(): void;
}

interface StartArgs {
  b: WeatherBundle;
  card: HTMLElement;
  map: HTMLElement;
  pick: Settings["radar"];
  onProvider: (name: string | null) => void;
  playBtn: HTMLButtonElement;
  slider: HTMLInputElement;
  timeLabel: HTMLElement;
  isDisposed: () => boolean;
}

/* ---------- radar engine ---------- */

async function startRadar(args: StartArgs): Promise<void> {
  const { b, card, map, pick, onProvider, isDisposed } = args;
  const loaded = await loadRadar(b.location.latitude, b.location.longitude, pick);
  if (isDisposed()) return;
  if (!loaded) {
    onProvider(null);
    card.classList.add("radar-off");
    const who = pick === "auto" ? "Radar" : (PROVIDERS.find((p) => p.id === pick)?.name ?? "Radar");
    const msg = document.createElement("div");
    msg.className = "radar-loading radar-unavailable";
    const text = document.createElement("span");
    text.textContent = pick === "auto" ? "Radar is unavailable right now." : `${who} is not responding.`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "radar-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      msg.remove();
      card.classList.remove("radar-off");
      void startRadar(args);
    });
    msg.append(text, retry);
    map.appendChild(msg);
    return;
  }
  onProvider(loaded.provider.name);

  const engine = createEngine({ ...args, source: loaded.source });
  engine.start();
  // Expose to renderRadar for pause-on-offscreen via a property on the card.
  (map as unknown as { _radarOwner: RadarOwner })._radarOwner = engine;
}

interface EngineArgs extends StartArgs {
  source: RadarSource;
}

interface Engine extends RadarOwner {
  start(): void;
}

function createEngine(a: EngineArgs): Engine {
  const { b, map, source, playBtn, slider, timeLabel, isDisposed } = a;
  const frames = source.frames;
  const newestIdx = source.nowIdx;
  const lastIdx = frames.length - 1;
  const MIN_Z = source.minZoom;
  const MAX_Z = source.maxZoom;
  slider.max = String(lastIdx);

  const view: View = {
    center: { lat: clampLat(b.location.latitude), lon: b.location.longitude },
    zoom: DEFAULT_Z,
  };

  // Layers.
  const baseLayer = document.createElement("div");
  baseLayer.className = "radar-layer";
  const radarLayer = document.createElement("div");
  radarLayer.className = "radar-layer radar-tiles";
  map.append(baseLayer, radarLayer);

  const marker = document.createElement("div");
  marker.className = "radar-marker";
  marker.innerHTML = `<span class="radar-dot"></span><span class="radar-label">${esc(b.location.name)}</span>`;
  map.appendChild(marker);

  const zoomBox = document.createElement("div");
  zoomBox.className = "radar-zoom";
  const zin = zoomButton("+", "Zoom in");
  const zout = zoomButton("\u2212", "Zoom out");
  zoomBox.append(zin, zout);
  map.appendChild(zoomBox);

  const badge = document.createElement("div");
  badge.className = "radar-badge";
  badge.textContent = "FORECAST";
  map.appendChild(badge);

  const attribution = document.createElement("div");
  attribution.className = "radar-attrib";
  attribution.textContent = `\u00A9 OpenStreetMap contributors \u00B7 ${source.attribution}`;
  map.appendChild(attribution);

  // Current frame.
  let frameIdx = newestIdx;
  const loadedUrls = new Set<string>();
  let preloaded = false;

  // Playback.
  let playing = false;
  let timer: number | null = null;

  // Tile reuse: key -> img element (per layer).
  const baseTiles = new Map<string, HTMLImageElement>();
  const radarTiles = new Map<string, HTMLImageElement>();

  // Pointer / wheel state.
  let dragging = false;
  let dragId = -1;
  let lastX = 0;
  let lastY = 0;
  let rafId = 0;
  let lastWheel = 0;

  function pxPerWorld(): number {
    return TILE * Math.pow(2, view.zoom);
  }

  function size(): { w: number; h: number } {
    const r = map.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function currentTileKeys(): TileKey[] {
    const { w, h } = size();
    const scale = pxPerWorld();
    const cx = lonToWorldX(view.center.lon, scale);
    const cy = latToWorldY(view.center.lat, scale);
    const left = cx - w / 2;
    const top = cy - h / 2;
    const maxTile = Math.pow(2, view.zoom);
    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + w) / TILE);
    const y0 = Math.floor(top / TILE);
    const y1 = Math.floor((top + h) / TILE);
    const keys: TileKey[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= maxTile) continue;
        keys.push({ z: view.zoom, x, y });
      }
    }
    return keys;
  }

  function renderTiles(): void {
    rafId = 0;
    const { w, h } = size();
    const scale = pxPerWorld();
    const cx = lonToWorldX(view.center.lon, scale);
    const cy = latToWorldY(view.center.lat, scale);
    const ox = Math.round(w / 2 - cx);
    const oy = Math.round(h / 2 - cy);
    const maxTile = Math.pow(2, view.zoom);
    const keys = currentTileKeys();

    syncLayer(baseLayer, baseTiles, keys, (k, img) => {
      const wx = ((k.x % maxTile) + maxTile) % maxTile;
      const px = k.x * TILE + ox;
      const py = k.y * TILE + oy;
      place(img, px, py);
      const url = baseTileUrl(k.z, wx, k.y);
      if (img.getAttribute("src") !== url) img.src = url;
    });

    syncLayer(radarLayer, radarTiles, keys, (k, img) => {
      const wx = ((k.x % maxTile) + maxTile) % maxTile;
      place(img, k.x * TILE + ox, k.y * TILE + oy);
      const url = radarUrl(k.z, wx, k.y);
      if (img.dataset.url !== url) {
        img.dataset.url = url;
        img.dataset.z = String(k.z);
        img.dataset.x = String(wx);
        img.dataset.y = String(k.y);
        img.src = url;
        loadedUrls.add(url);
      }
    });

    updateMarker(ox, oy, scale);
  }

  function requestRender(): void {
    if (rafId) return;
    rafId = requestAnimationFrame(renderTiles);
  }

  function radarUrl(z: number, x: number, y: number): string {
    return frames[frameIdx].url(z, x, y);
  }

  function place(img: HTMLImageElement, px: number, py: number): void {
    img.style.transform = `translate(${px}px, ${py}px)`;
  }

  function syncLayer(
    layer: HTMLElement,
    store: Map<string, HTMLImageElement>,
    keys: TileKey[],
    apply: (k: TileKey, img: HTMLImageElement) => void,
  ): void {
    const seen = new Set<string>();
    for (const k of keys) {
      const key = `${k.z}/${k.x}/${k.y}`;
      seen.add(key);
      let img = store.get(key);
      if (!img) {
        img = document.createElement("img");
        img.className = "radar-tile";
        img.draggable = false;
        img.decoding = "async";
        img.alt = "";
        layer.appendChild(img);
        store.set(key, img);
      }
      apply(k, img);
    }
    for (const [key, img] of store) {
      if (!seen.has(key)) {
        img.remove();
        store.delete(key);
      }
    }
  }

  function updateMarker(ox: number, oy: number, scale: number): void {
    const mx = lonToWorldX(b.location.longitude, scale) + ox;
    const my = latToWorldY(clampLat(b.location.latitude), scale) + oy;
    marker.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
  }

  function applyFrame(idx: number): void {
    frameIdx = idx;
    slider.value = String(idx);
    timeLabel.textContent = frameLabel(frames[idx].time, frames[newestIdx].time, b.utcOffsetSeconds);
    badge.classList.toggle("show", idx > newestIdx);
    for (const img of radarTiles.values()) {
      if (img.dataset.z === undefined) continue;
      const url = radarUrl(Number(img.dataset.z), Number(img.dataset.x), Number(img.dataset.y));
      if (img.getAttribute("src") !== url) img.src = url;
    }
    // URL keys stored in loadedUrls reflect the currently displayed frame only.
    pruneLoaded();
  }

  function pruneLoaded(): void {
    // Keep the set bounded; it only serves as a "seen" hint during playback.
    if (loadedUrls.size > 2000) loadedUrls.clear();
  }

  function preloadAllFrames(): void {
    if (preloaded) return;
    preloaded = true;
    const keys = currentTileKeys();
    const maxTile = Math.pow(2, view.zoom);
    for (let i = 0; i < frames.length; i++) {
      if (i === frameIdx) continue;
      for (const k of keys) {
        const wx = ((k.x % maxTile) + maxTile) % maxTile;
        const url = frames[i].url(k.z, wx, k.y);
        if (loadedUrls.has(url)) continue;
        loadedUrls.add(url);
        const im = new Image();
        im.src = url;
      }
    }
  }

  /* ---- controls ---- */

  function setPlaying(on: boolean): void {
    playing = on;
    playBtn.innerHTML = on ? pauseIcon() : playIcon();
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    if (!on) clearTimer();
  }

  function clearTimer(): void {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function tick(): void {
    timer = null;
    if (!playing) return;
    if (isDisposed() || !map.isConnected) {
      setPlaying(false);
      return;
    }
    const next = frameIdx >= lastIdx ? 0 : frameIdx + 1;
    applyFrame(next);
    const delay = next === lastIdx ? 1500 : 700;
    timer = window.setTimeout(tick, delay);
  }

  function startPlayback(): void {
    preloadAllFrames();
    setPlaying(true);
    // If currently on the last frame, start again from the oldest.
    const next = frameIdx >= lastIdx ? 0 : frameIdx;
    applyFrame(next);
    const delay = next === lastIdx ? 1500 : 700;
    clearTimer();
    timer = window.setTimeout(tick, delay);
  }

  playBtn.addEventListener("click", () => {
    if (playing) setPlaying(false);
    else startPlayback();
  });

  slider.addEventListener("input", () => {
    const idx = Math.max(0, Math.min(lastIdx, parseInt(slider.value, 10) || 0));
    applyFrame(idx);
  });

  function setZoom(z: number): void {
    const nz = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (nz === view.zoom) return;
    view.zoom = nz;
    zout.disabled = nz <= MIN_Z;
    zin.disabled = nz >= MAX_Z;
    // Re-frame tiles after zoom change.
    for (const img of [...baseTiles.values(), ...radarTiles.values()]) img.remove();
    baseTiles.clear();
    radarTiles.clear();
    requestRender();
  }

  zin.addEventListener("click", () => setZoom(view.zoom + 1));
  zout.addEventListener("click", () => setZoom(view.zoom - 1));

  /* ---- pan ---- */

  map.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    map.classList.add("is-dragging");
    map.setPointerCapture(e.pointerId);
  });

  map.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== dragId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    panBy(dx, dy);
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragId) return;
    dragging = false;
    map.classList.remove("is-dragging");
    if (map.hasPointerCapture(dragId)) map.releasePointerCapture(dragId);
    void e;
  };
  map.addEventListener("pointerup", endDrag);
  map.addEventListener("pointercancel", endDrag);

  map.addEventListener(
    "wheel",
    (e) => {
      if (document.hidden) return;
      const now = performance.now();
      if (now - lastWheel < 250) {
        e.preventDefault();
        return;
      }
      lastWheel = now;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      zoomAtPointer(dir, e.clientX, e.clientY);
    },
    { passive: false },
  );

  function panBy(dx: number, dy: number): void {
    const scale = pxPerWorld();
    const cx = lonToWorldX(view.center.lon, scale);
    const cy = latToWorldY(view.center.lat, scale);
    const ncx = cx - dx;
    const ncy = cy - dy;
    view.center.lon = worldXToLon(ncx, scale);
    view.center.lat = clampLat(worldYToLat(ncy, scale));
    requestRender();
  }

  function zoomAtPointer(dir: number, clientX: number, clientY: number): void {
    const nz = Math.max(MIN_Z, Math.min(MAX_Z, view.zoom + dir));
    if (nz === view.zoom) return;
    const rect = map.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const oldScale = pxPerWorld();
    const cx = lonToWorldX(view.center.lon, oldScale);
    const cy = latToWorldY(view.center.lat, oldScale);
    view.zoom = nz;
    const newScale = pxPerWorld();
    // Keep the point under the cursor fixed.
    const wx = (cx - rect.width / 2 + px) / oldScale;
    const wy = (cy - rect.height / 2 + py) / oldScale;
    view.center.lon = worldXToLon(wx * newScale - (px - rect.width / 2), newScale);
    view.center.lat = clampLat(worldYToLat(wy * newScale - (py - rect.height / 2), newScale));
    zout.disabled = nz <= MIN_Z;
    zin.disabled = nz >= MAX_Z;
    for (const img of [...baseTiles.values(), ...radarTiles.values()]) img.remove();
    baseTiles.clear();
    radarTiles.clear();
    requestRender();
  }

  /* ---- resize + visibility ---- */

  const ro = new ResizeObserver(() => requestRender());
  ro.observe(map);

  const onVisibility = () => {
    if (document.hidden && playing) setPlaying(false);
  };
  document.addEventListener("visibilitychange", onVisibility);

  let intersectionObs: IntersectionObserver | null = null;

  function dispose(): void {
    setPlaying(false);
    ro.disconnect();
    intersectionObs?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    if (rafId) cancelAnimationFrame(rafId);
  }

  return {
    start() {
      zout.disabled = view.zoom <= MIN_Z;
      zin.disabled = view.zoom >= MAX_Z;
      applyFrame(newestIdx);
      requestRender();
      // Pause when off-screen.
      intersectionObs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (!e.isIntersecting && playing) setPlaying(false);
        },
        { threshold: 0 },
      );
      intersectionObs.observe(map);
    },
    pause() {
      if (playing) setPlaying(false);
    },
    dispose,
  };
}

/* ---------- icons ---------- */

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/></svg>`;
}

function zoomButton(label: string, aria: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "radar-zoom-btn";
  btn.setAttribute("aria-label", aria);
  btn.textContent = label;
  return btn;
}

// Suppress unused warnings for helper referenced only indirectly.
void RADAR_OPACITY;
