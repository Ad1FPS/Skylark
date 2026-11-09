import type { Settings, WeatherBundle } from "../types";
import { esc } from "../format";
import { icon } from "../icons";
import { osmTileUrl } from "../map/tiles";
import { getWindGrid, type WindGrid } from "../api";
import { sampleGrid, speedColor } from "../wind/field";

const TILE = 256;
const ZOOM = 6;
const MAX_LAT = 80;
const COLS = 8;
const ROWS = 6;
const CELL = 16;
const SPEED_PX_PER_KMH = 1.4;
const CACHE_MS = 45 * 60 * 1000;

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function measure(el: HTMLElement): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
}

/* ---------- wind grid cache ---------- */

interface CacheEntry {
  grid: WindGrid | null;
  at: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number, w: number, h: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)},${Math.round(w / 50)}x${Math.round(h / 50)}`;
}

async function loadGrid(key: string, latMin: number, latMax: number, lonMin: number, lonMax: number): Promise<WindGrid | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.grid;
  const grid = await getWindGrid(latMin, latMax, lonMin, lonMax, COLS, ROWS);
  cache.set(key, { grid, at: now });
  return grid;
}

/* ---------- units ---------- */

function windFactor(s: Settings): { unit: string; conv: (kmh: number) => number } {
  if (s.wind === "mph") return { unit: "mph", conv: (k) => k * 0.621371 };
  if (s.wind === "ms") return { unit: "m/s", conv: (k) => k / 3.6 };
  return { unit: "km/h", conv: (k) => k };
}

/* ---------- labels ---------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hourLabel(idx: number, times: number[], offset: number): string {
  if (idx === 0) return "Now";
  const t = times[idx] ?? times[0] ?? 0;
  const d = new Date((t + offset) * 1000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}  +${idx} h`;
}

function compass8(deg: number): string {
  const pts = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return pts[i];
}

/* ---------- main render ---------- */

interface Owner {
  start(): void;
  resume(): void;
  pause(): void;
  dispose(): void;
}

export function renderWindMap(b: WeatherBundle, s: Settings): HTMLElement {
  const card = document.createElement("section");
  card.className = "card windmap span-2";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.innerHTML = `${icon("wind", 13)}<span>${esc("WIND MAP")}</span>`;
  card.appendChild(title);

  const map = document.createElement("div");
  map.className = "radar-map windmap-map";
  const placeholder = document.createElement("div");
  placeholder.className = "radar-loading";
  placeholder.textContent = "Loading wind";
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
  slider.setAttribute("aria-label", "Hour");
  const timeLabel = document.createElement("span");
  timeLabel.className = "radar-time";
  timeLabel.textContent = "--:--";
  controls.append(playBtn, slider, timeLabel);
  card.appendChild(controls);

  let started = false;
  let disposed = false;
  let visible = false;
  let owner: Owner | null = null;

  const showUnavailable = (): void => {
    if (disposed) return;
    card.classList.add("radar-off");
    const msg = document.createElement("div");
    msg.className = "radar-loading radar-unavailable";
    const text = document.createElement("span");
    text.textContent = "Wind map is unavailable right now.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "radar-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      if (disposed) return;
      msg.remove();
      card.classList.remove("radar-off");
      const loading = document.createElement("div");
      loading.className = "radar-loading";
      loading.textContent = "Loading wind";
      map.appendChild(loading);
      // Bust the cache entry so Retry really refetches.
      cache.clear();
      startEngine(() => loading.remove());
    });
    msg.append(text, retry);
    map.appendChild(msg);
  };

  const startEngine = (onReady?: () => void): void => {
    void (async () => {
      try {
        const engine = await buildEngine();
        if (disposed) {
          engine?.dispose();
          return;
        }
        if (!engine) {
          onReady?.();
          showUnavailable();
          return;
        }
        onReady?.();
        engine.start();
        owner = engine;
        if (visible) engine.resume();
      } catch {
        onReady?.();
        showUnavailable();
      }
    })();
  };

  const start = (): void => {
    if (started || disposed) return;
    started = true;
    placeholder.remove();
    try {
      startEngine();
    } catch {
      showUnavailable();
    }
  };

  const buildEngine = async (): Promise<Owner | null> => {
    const { w, h } = measure(map);
    const scale = TILE * Math.pow(2, ZOOM);
    const center = { lat: clampLat(b.location.latitude), lon: b.location.longitude };
    const cxw = lonToWorldX(center.lon, scale);
    const cyw = latToWorldY(center.lat, scale);
    const lonMin = worldXToLon(cxw - w / 2, scale);
    const lonMax = worldXToLon(cxw + w / 2, scale);
    const latMax = worldYToLat(cyw - h / 2, scale);
    const latMin = worldYToLat(cyw + h / 2, scale);
    const lonPad = (lonMax - lonMin) * 0.1;
    const latPad = (latMax - latMin) * 0.1;
    const key = cacheKey(b.location.latitude, b.location.longitude, w, h);
    const grid = await loadGrid(key, latMin - latPad, latMax + latPad, lonMin - lonPad, lonMax + lonPad);
    if (!grid) return null;
    return createEngine(grid);
  };

  const createEngine = (grid: WindGrid): Owner => {
    // Layers.
    const baseLayer = document.createElement("div");
    baseLayer.className = "radar-layer";
    const canvas = document.createElement("canvas");
    canvas.className = "windmap-canvas";
    map.append(baseLayer, canvas);
    const ctx = canvas.getContext("2d");

    const marker = document.createElement("div");
    marker.className = "radar-marker";
    marker.innerHTML = `<span class="radar-dot"></span><span class="radar-label">${esc(b.location.name)}</span>`;
    map.appendChild(marker);

    const legend = document.createElement("div");
    legend.className = "windmap-legend";
    const wv = windFactor(s);
    const stopVals = [0, 20, 40, 60];
    const gradStops = [0, 15, 30, 45, 60, 90]
      .map((v) => `${speedColor(v)} ${Math.round((v / 90) * 100)}%`)
      .join(", ");
    legend.innerHTML =
      `<div class="windmap-legend-bar" style="background:linear-gradient(90deg, ${gradStops})"></div>` +
      `<div class="windmap-legend-labels">${stopVals.map((v) => `<span>${Math.round(wv.conv(v))}</span>`).join("")}</div>` +
      `<div class="windmap-legend-unit">${esc(wv.unit)}</div>`;
    map.appendChild(legend);

    const readout = document.createElement("div");
    readout.className = "windmap-readout";
    map.appendChild(readout);

    const attrib = document.createElement("div");
    attrib.className = "radar-attrib";
    attrib.textContent = "\u00A9 OpenStreetMap contributors \u00B7 Wind: Open-Meteo";
    map.appendChild(attrib);

    /* ---- sizing ---- */

    let { w, h } = measure(map);

    /* ---- tiles ---- */

    const baseTiles = new Map<string, HTMLImageElement>();

    function pxPerWorld(): number {
      return TILE * Math.pow(2, ZOOM);
    }

    function layoutTiles(): void {
      const scale = pxPerWorld();
      const cx = lonToWorldX(b.location.longitude, scale);
      const cy = latToWorldY(clampLat(b.location.latitude), scale);
      const ox = Math.round(w / 2 - cx);
      const oy = Math.round(h / 2 - cy);
      const maxTile = Math.pow(2, ZOOM);
      const left = cx - w / 2;
      const top = cy - h / 2;
      const x0 = Math.floor(left / TILE);
      const x1 = Math.floor((left + w) / TILE);
      const y0 = Math.floor(top / TILE);
      const y1 = Math.floor((top + h) / TILE);
      const seen = new Set<string>();
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= maxTile) continue;
          const key = `${ZOOM}/${x}/${y}`;
          seen.add(key);
          let img = baseTiles.get(key);
          if (!img) {
            img = document.createElement("img");
            img.className = "radar-tile";
            img.draggable = false;
            img.decoding = "async";
            img.alt = "";
            const wx = ((x % maxTile) + maxTile) % maxTile;
            img.src = osmTileUrl(ZOOM, wx, y);
            baseLayer.appendChild(img);
            baseTiles.set(key, img);
          }
          img.style.transform = `translate(${x * TILE + ox}px, ${y * TILE + oy}px)`;
        }
      }
      for (const [key, img] of baseTiles) {
        if (!seen.has(key)) {
          img.remove();
          baseTiles.delete(key);
        }
      }
      const mx = lonToWorldX(b.location.longitude, scale) + ox;
      const my = latToWorldY(clampLat(b.location.latitude), scale) + oy;
      marker.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
    }

    /* ---- canvas ---- */

    function sizeCanvas(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
      }
    }

    /* ---- screen-space field ---- */

    let gx = 0;
    let gy = 0;
    let fieldU = new Float32Array(0);
    let fieldV = new Float32Array(0);
    let hour = 0;

    function recomputeField(): void {
      gx = Math.ceil(w / CELL) + 1;
      gy = Math.ceil(h / CELL) + 1;
      fieldU = new Float32Array(gx * gy);
      fieldV = new Float32Array(gx * gy);
      const scale = pxPerWorld();
      const cx = lonToWorldX(b.location.longitude, scale);
      const cy = latToWorldY(clampLat(b.location.latitude), scale);
      const ox = w / 2 - cx;
      const oy = h / 2 - cy;
      for (let j = 0; j < gy; j++) {
        for (let i = 0; i < gx; i++) {
          const wx = i * CELL - ox;
          const wy = j * CELL - oy;
          const lon = worldXToLon(wx, 1);
          const la = worldYToLat(wy, 1);
          const sm = sampleGrid(grid, hour, la, lon);
          const k = j * gx + i;
          fieldU[k] = sm.u;
          fieldV[k] = sm.v;
        }
      }
      updateReadout();
    }

    function sampleScreen(x: number, y: number): { u: number; v: number } {
      let fx = x / CELL;
      let fy = y / CELL;
      fx = clamp(fx, 0, gx - 1);
      fy = clamp(fy, 0, gy - 1);
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      const i1 = Math.min(i0 + 1, gx - 1);
      const j1 = Math.min(j0 + 1, gy - 1);
      const tx = fx - i0;
      const ty = fy - j0;
      const lerp = (a: number, c: number, k: number): number => a + (c - a) * k;
      const at = (arr: Float32Array, i: number, j: number): number => arr[j * gx + i] ?? 0;
      const u = lerp(
        lerp(at(fieldU, i0, j0), at(fieldU, i1, j0), tx),
        lerp(at(fieldU, i0, j1), at(fieldU, i1, j1), tx),
        ty,
      );
      const v = lerp(
        lerp(at(fieldV, i0, j0), at(fieldV, i1, j0), tx),
        lerp(at(fieldV, i0, j1), at(fieldV, i1, j1), tx),
        ty,
      );
      return { u, v };
    }

    function updateReadout(): void {
      const sm = sampleGrid(grid, hour, b.location.latitude, b.location.longitude);
      const speed = Math.hypot(sm.u, sm.v);
      const dir = ((Math.atan2(-sm.u, -sm.v) * 180) / Math.PI + 360) % 360;
      readout.textContent = `${compass8(dir)} ${Math.round(wv.conv(speed))} ${wv.unit}`;
    }

    /* ---- particles ---- */

    interface Particle {
      x: number;
      y: number;
      px: number;
      py: number;
      age: number;
      maxAge: number;
    }

    let particles: Particle[] = [];

    function spawn(p: Particle): void {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.px = p.x;
      p.py = p.y;
      p.age = 0;
      p.maxAge = 1.2 + Math.random() * 1.6;
    }

    function seed(): void {
      const count = clamp(Math.round((w * h) / 650), 250, 900);
      particles = [];
      for (let i = 0; i < count; i++) {
        const p: Particle = { x: 0, y: 0, px: 0, py: 0, age: 0, maxAge: 1 };
        spawn(p);
        // Stagger initial ages so they do not all fade in together.
        p.age = Math.random() * p.maxAge;
        particles.push(p);
      }
    }

    function clearCanvas(): void {
      if (ctx) ctx.clearRect(0, 0, w, h);
    }

    function step(dt: number): void {
      if (!ctx) return;
      const d = Math.min(dt, 0.05);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.3;
      for (const p of particles) {
        const { u, v } = sampleScreen(p.x, p.y);
        const speed = Math.hypot(u, v);
        p.px = p.x;
        p.py = p.y;
        p.x += u * SPEED_PX_PER_KMH * d;
        p.y += -v * SPEED_PX_PER_KMH * d;
        p.age += d;
        const t = p.maxAge > 0 ? p.age / p.maxAge : 1;
        const fadeInOut = t < 0.2 ? t / 0.2 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
        if (fadeInOut > 0.02) {
          ctx.strokeStyle = speedColor(speed);
          ctx.globalAlpha = 0.9 * Math.min(1, speed / 6 + 0.15) * fadeInOut;
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        if (p.age >= p.maxAge || p.x < 0 || p.x > w || p.y < 0 || p.y > h) spawn(p);
      }
      ctx.globalAlpha = 1;
    }

    /* ---- animation loop ---- */

    let rafId = 0;
    let running = false;
    let lastTs = 0;
    let lastDraw = 0;
    let playing = false;
    let playTimer: number | null = null;
    let selfDisposed = false;

    function frame(ts: number): void {
      rafId = 0;
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (ts - lastDraw < 1000 / 30) return;
      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;
      lastDraw = ts;
      try {
        step(dt);
      } catch {
        /* never throw out of the frame loop */
      }
    }

    function resume(): void {
      if (running || !canvas.isConnected) return;
      running = true;
      lastTs = 0;
      lastDraw = 0;
      rafId = requestAnimationFrame(frame);
    }

    function pause(): void {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (playing) setPlaying(false);
    }

    /* ---- hour control ---- */

    function applyHour(idx: number): void {
      hour = clamp(idx, 0, grid.times.length - 1);
      slider.value = String(hour);
      timeLabel.textContent = hourLabel(hour, grid.times, b.utcOffsetSeconds);
      recomputeField();
      clearCanvas();
      seed();
    }

    /* ---- playback ---- */

    function setPlaying(on: boolean): void {
      playing = on;
      playBtn.innerHTML = on ? pauseIcon() : playIcon();
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
      if (playTimer != null) {
        window.clearTimeout(playTimer);
        playTimer = null;
      }
      if (!on) return;
      const tick = (): void => {
        playTimer = null;
        if (!playing || selfDisposed || !map.isConnected) {
          setPlaying(false);
          return;
        }
        const next = hour >= grid.times.length - 1 ? 0 : hour + 1;
        applyHour(next);
        playTimer = window.setTimeout(tick, 900);
      };
      playTimer = window.setTimeout(tick, 900);
    }

    playBtn.addEventListener("click", () => {
      if (playing) setPlaying(false);
      else if (running) setPlaying(true);
    });

    slider.addEventListener("input", () => {
      if (playing) setPlaying(false);
      applyHour(parseInt(slider.value, 10) || 0);
    });

    /* ---- resize ---- */

    const relayout = (): void => {
      const r = measure(map);
      if (r.w === w && r.h === h) return;
      w = r.w;
      h = r.h;
      layoutTiles();
      sizeCanvas();
      recomputeField();
      clearCanvas();
      seed();
    };

    const ro = new ResizeObserver(() => relayout());
    ro.observe(map);

    const onVisibility = (): void => {
      if (document.hidden) pause();
      else if (visible) resume();
    };

    const dispose = (): void => {
      selfDisposed = true;
      pause();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };

    return {
      start(): void {
        slider.max = String(Math.max(0, grid.times.length - 1));
        const r = measure(map);
        w = r.w;
        h = r.h;
        sizeCanvas();
        layoutTiles();
        applyHour(0);
        document.addEventListener("visibilitychange", onVisibility);
        resume();
      },
      resume(): void {
        resume();
      },
      pause(): void {
        pause();
      },
      dispose,
    };
  };

  /* ---- observers / lifecycle ---- */

  const io = new IntersectionObserver(
    (entries) => {
      if (!card.isConnected) {
        cleanup();
        return;
      }
      for (const e of entries) {
        visible = e.isIntersecting;
        if (e.isIntersecting) {
          start();
          owner?.resume();
        } else {
          owner?.pause();
        }
      }
    },
    { rootMargin: "200px" },
  );

  const onVisibility = (): void => {
    if (document.hidden) owner?.pause();
    else if (visible && started) owner?.resume();
  };

  const cleanup = (): void => {
    disposed = true;
    io.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    owner?.dispose();
    owner = null;
  };

  document.addEventListener("visibilitychange", onVisibility);

  // Attach the observer once the element is in the document.
  const attach = (): void => {
    if (disposed) return;
    if (card.isConnected) io.observe(card);
    else requestAnimationFrame(attach);
  };
  requestAnimationFrame(attach);

  return card;
}

/* ---------- icons ---------- */

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/></svg>`;
}
