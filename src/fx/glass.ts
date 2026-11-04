import type { Scene } from "./types";
import { clamp, lerp, rng } from "./util";

const MAX_PIXELS = 2_100_000;
const MAX_DPR = 1.25;
const MAX_FPS = 30;
const SMOOTH_FPS = 40;
const UNFOCUSED_FPS = 15;
const ACTIVE_RAIN = 0.02;
const FADE_OUT = 3;
const TILES_REFRESH_MS = 250;
const RESIZE_DEBOUNCE_MS = 120;
const BEAD_CAP = 200;
const BEAD_DENSITY = 2400;
const BEAD_MIN_R = 1.2;
const BEAD_MAX_R = 2.2;
const BEAD_GROW = 0.2;
const BEAD_LIMIT_R = 4.6;
const BEAD_RUN_R = 3.6;
const BEAD_END_R = 1.4;
const STREAK_BASE = 16;
const GOVERNOR_FRAMES = 45;
const GOVERNOR_MS = 4;

export interface Glass {
  setScene(scene: Scene): void;
  setSmooth(on: boolean): void;
}

interface Tile {
  el: Element;
  rect: DOMRect;
}

interface Bead {
  tile: Element;
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  fading: boolean;
  fade: number;
  running: boolean;
  vy: number;
  vx: number;
}

interface Trail {
  tile: Element;
  x: number;
  y0: number;
  y1: number;
  age: number;
  ttl: number;
}

interface Streak {
  x: number;
  y: number;
  speed: number;
  len: number;
  alpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  ttl: number;
  sparks: Spark[];
}

const SPRITE_SCALE = 2;
const beadSprites = new Map<number, HTMLCanvasElement>();

/** One pre-drawn bead per quarter-pixel radius: a faint lens disc, a dark lower rim and a bright specular dot. */
function beadSprite(r: number): HTMLCanvasElement {
  const cached = beadSprites.get(r);
  if (cached) return cached;
  const size = Math.ceil((r * 2 + 4) * SPRITE_SCALE);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    g.scale(SPRITE_SCALE, SPRITE_SCALE);
    const m = size / SPRITE_SCALE / 2;
    const grad = g.createRadialGradient(m, m, 0, m, m, r);
    grad.addColorStop(0, "rgba(255,255,255,0.07)");
    grad.addColorStop(1, "rgba(255,255,255,0.26)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.36)";
    g.lineWidth = Math.max(0.6, r * 0.18);
    g.beginPath();
    g.arc(m, m, r * 0.85, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.beginPath();
    g.arc(m - r * 0.3, m - r * 0.3, r * 0.28, 0, Math.PI * 2);
    g.fill();
  }
  beadSprites.set(r, c);
  return c;
}

export function createGlass(): Glass {
  const canvas = document.createElement("canvas");
  canvas.className = "glass-fx";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const rand = rng(5077);

  let rainNow = 0;
  let windNow = 0;

  let cssW = 1;
  let cssH = 1;
  let smooth = false;
  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let lastRealtime = 0;
  let fadeTimer = 0;

  const beads: Bead[] = [];
  const trails: Trail[] = [];
  const streaks: Streak[] = [];
  const splashes: Splash[] = [];

  let tiles: Tile[] = [];
  let tilesStale = true;
  let lastTileRefresh = 0;

  let mainEl: HTMLElement | null = document.querySelector<HTMLElement>("#main");

  // Governor.
  let beadCap = BEAD_CAP;
  let govSum = 0;
  let govFrames = 0;
  let govDone = false;

  let splashAcc = 0;

  function refreshTiles(now: number): void {
    if (!tilesStale && now - lastTileRefresh < TILES_REFRESH_MS) return;
    tilesStale = false;
    lastTileRefresh = now;
    if (!mainEl) mainEl = document.querySelector<HTMLElement>("#main");

    const found: Tile[] = [];
    const els = document.querySelectorAll("#main .card, .radar.expanded");
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.closest(".popover")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      found.push({ el, rect });
    }
    tiles = found;
  }

  function findTile(el: Element): Tile | null {
    for (const t of tiles) if (t.el === el) return t;
    return null;
  }

  function swapRemove<T>(arr: T[], i: number): void {
    const last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.pop();
  }

  function targetBeads(): number {
    let total = 0;
    for (const t of tiles) {
      const n = Math.round((t.rect.width * t.rect.height / BEAD_DENSITY) * rainNow);
      if (n > 0) total += n;
    }
    return Math.min(total, beadCap);
  }

  function spawnBead(t: Tile): void {
    const w = t.rect.width - 20;
    const h = t.rect.height - 20;
    if (w <= 0 || h <= 0) return;
    beads.push({
      tile: t.el,
      x: 10 + rand() * w,
      y: 10 + rand() * h,
      r: lerp(BEAD_MIN_R, BEAD_MAX_R, rand()),
      age: 0,
      life: lerp(25, 45, rand()),
      fading: false,
      fade: 0,
      running: false,
      vy: 0,
      vx: 0,
    });
  }

  function spawnSplash(): void {
    if (!mainEl || tiles.length === 0) return;
    const mainRect = mainEl.getBoundingClientRect();
    const top = mainRect.top;
    const bottom = mainRect.bottom;
    const candidates: Tile[] = [];
    for (const t of tiles) {
      if (t.rect.top >= top && t.rect.top <= bottom && t.rect.width > 16) candidates.push(t);
    }
    if (candidates.length === 0) return;
    const t = candidates[Math.floor(rand() * candidates.length)];
    const x = t.rect.left + 8 + rand() * (t.rect.width - 16);
    const y = t.rect.top;
    const sparks: Spark[] = [];
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      sparks.push({ x, y, vx: lerp(-30, 30, rand()), vy: lerp(-60, -25, rand()), alpha: 0.5 });
    }
    splashes.push({ x, y, age: 0, ttl: 0.35, sparks });
  }

  function spawnStreak(): void {
    streaks.push({
      x: rand() * cssW,
      y: -rand() * 80,
      speed: lerp(900, 1500, rand()),
      len: lerp(24, 64, rand()),
      alpha: lerp(0.22, 0.4, rand()),
    });
  }

  function resize(): void {
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    let scale = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (cssW * cssH * scale * scale > MAX_PIXELS) {
      scale = Math.sqrt(MAX_PIXELS / (cssW * cssH));
    }
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(canvas.width / cssW, canvas.height / cssH);
    }
    tilesStale = true;
  }

  function clear(): void {
    if (ctx) ctx.clearRect(0, 0, cssW, cssH);
  }

  function update(dt: number): void {
    // Spawn beads toward target.
    const target = targetBeads();
    if (rainNow > ACTIVE_RAIN && beads.length < target && tiles.length > 0) {
      const rate = tiles.length * rainNow * dt * (beads.length < target * 0.5 ? 8 : 3);
      let n = Math.floor(rate);
      if (rand() < rate - n) n++;
      for (let i = 0; i < n && beads.length < target; i++) {
        spawnBead(tiles[Math.floor(rand() * tiles.length)]);
      }
    }

    // Beads.
    for (let i = beads.length - 1; i >= 0; i--) {
      const b = beads[i];
      const t = findTile(b.tile);
      if (!t) {
        swapRemove(beads, i);
        continue;
      }
      b.age += dt;
      if (b.age >= b.life) b.fading = true;
      if (b.fading) {
        b.fade += dt;
        if (b.fade >= 1) {
          swapRemove(beads, i);
          continue;
        }
      }
      if (b.running) {
        const ny = b.y + b.vy * dt;
        b.x = clamp(b.x + b.vx * dt, 2, t.rect.width - 2);
        b.r -= 0.3 * dt;
        trails.push({ tile: b.tile, x: b.x, y0: b.y, y1: ny, age: 0, ttl: 1.5 });
        b.y = ny;
        if (b.y > t.rect.height || b.r < BEAD_END_R) {
          swapRemove(beads, i);
        }
      } else {
        b.r = Math.min(BEAD_LIMIT_R, b.r + BEAD_GROW * dt);
        if (b.r > BEAD_RUN_R && rand() < 0.2 * dt) {
          b.running = true;
          b.vy = lerp(40, 90, rand());
          b.vx = windNow * 20 + lerp(-6, 6, rand());
        }
      }
    }

    // Trails.
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      if (!findTile(tr.tile)) {
        swapRemove(trails, i);
        continue;
      }
      tr.age += dt;
      if (tr.age >= tr.ttl) swapRemove(trails, i);
    }

    // Streaks.
    const wantStreaks = Math.round((STREAK_BASE * rainNow) / (govDone ? 2 : 1));
    while (streaks.length < wantStreaks) spawnStreak();
    if (streaks.length > wantStreaks) streaks.length = wantStreaks;
    const slope = windNow * 0.35;
    for (const s of streaks) {
      s.y += s.speed * dt;
      s.x += slope * s.speed * dt;
      if (s.y - s.len > cssH || s.x < -200 || s.x > cssW + 200) {
        s.y = -rand() * 80;
        s.x = rand() * cssW;
      }
    }

    // Splashes.
    if (rainNow > ACTIVE_RAIN) {
      splashAcc += 3 * rainNow * dt;
      while (splashAcc >= 1) {
        splashAcc -= 1;
        spawnSplash();
      }
    } else {
      splashAcc = 0;
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i];
      sp.age += dt;
      let alive = false;
      for (const k of sp.sparks) {
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.vy += 200 * dt;
        k.alpha -= 1.4 * dt;
        if (k.alpha > 0) alive = true;
      }
      if (sp.age >= sp.ttl || !alive) swapRemove(splashes, i);
    }
  }

  function draw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    const main = mainEl;
    if (!main) return;
    const mainRect = main.getBoundingClientRect();
    if (mainRect.width < 1 || mainRect.height < 1) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(mainRect.left, mainRect.top, mainRect.width, mainRect.height);
    ctx.clip();
    ctx.lineCap = "round";

    // Trails under beads.
    for (const tr of trails) {
      const t = findTile(tr.tile);
      if (!t) continue;
      const a = 0.12 * (1 - tr.age / tr.ttl);
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.rect.left + tr.x, t.rect.top + tr.y0);
      ctx.lineTo(t.rect.left + tr.x, t.rect.top + tr.y1);
      ctx.stroke();
    }

    // Beads.
    for (const b of beads) {
      const t = findTile(b.tile);
      if (!t) continue;
      const fade = b.fading ? Math.max(0, 1 - b.fade) : 1;
      const x = t.rect.left + b.x;
      const y = t.rect.top + b.y;
      const r = b.r;

      const sp = beadSprite(Math.max(1, Math.round(r * 4) / 4));
      ctx.globalAlpha = fade;
      ctx.drawImage(sp, x - sp.width / (2 * SPRITE_SCALE), y - sp.height / (2 * SPRITE_SCALE), sp.width / SPRITE_SCALE, sp.height / SPRITE_SCALE);
    }
    ctx.globalAlpha = 1;

    // Splash ripples and sparks.
    for (const sp of splashes) {
      const p = sp.age / sp.ttl;
      const alpha = 0.35 * (1 - p);
      if (alpha > 0) {
        const rx = lerp(2, 9, p);
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, rx, rx * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const k of sp.sparks) {
        if (k.alpha <= 0) continue;
        ctx.fillStyle = `rgba(255,255,255,${k.alpha})`;
        ctx.beginPath();
        ctx.arc(k.x, k.y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Streaks on top.
    const slope = windNow * 0.35;
    for (const s of streaks) {
      ctx.strokeStyle = `rgba(255,255,255,${s.alpha * rainNow})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - slope * s.len, s.y - s.len);
      ctx.stroke();
    }

    ctx.restore();
  }

  function measurePerf(ms: number): void {
    if (govDone) return;
    govSum += ms;
    govFrames++;
    if (govFrames >= GOVERNOR_FRAMES) {
      if (govSum / govFrames > GOVERNOR_MS) {
        beadCap = Math.floor(BEAD_CAP / 2);
        govDone = true;
      }
      govSum = 0;
      govFrames = 0;
    }
  }

  function maxFps(): number {
    let fps = smooth ? SMOOTH_FPS : MAX_FPS;
    if (!document.hasFocus || !document.hasFocus()) fps = Math.min(fps, UNFOCUSED_FPS);
    return fps;
  }

  function frame(now: number): void {
    raf = 0;
    if (document.hidden) {
      stop();
      return;
    }
    const wanted = maxFps();
    if (lastFrame && now - lastFrame < 1000 / wanted - 1) {
      schedule();
      return;
    }
    const real = lastRealtime ? (now - lastRealtime) / 1000 : 0;
    lastRealtime = now;
    lastFrame = now;
    const dt = Math.min(0.1, Math.max(0, real || 1 / wanted));

    refreshTiles(now);

    const t0 = performance.now();
    update(dt);
    draw();
    measurePerf(performance.now() - t0);

    if (rainNow < ACTIVE_RAIN) {
      if (beads.length === 0 && trails.length === 0 && streaks.length === 0 && splashes.length === 0) {
        fadeTimer += dt;
        if (fadeTimer >= FADE_OUT) {
          stop();
          return;
        }
      }
    } else {
      fadeTimer = 0;
    }

    schedule();
  }

  function schedule(): void {
    if (raf || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running) return;
    running = true;
    fadeTimer = 0;
    lastFrame = 0;
    lastRealtime = 0;
    refreshTiles(performance.now());
    schedule();
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    running = false;
    lastFrame = 0;
    lastRealtime = 0;
    beads.length = 0;
    trails.length = 0;
    streaks.length = 0;
    splashes.length = 0;
    clear();
  }

  // Resize (debounced).
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      if (running) schedule();
    }, RESIZE_DEBOUNCE_MS);
  });

  // Scroll and DOM changes invalidate the tile cache (next frame).
  window.addEventListener("scroll", () => {
    tilesStale = true;
  }, { passive: true, capture: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (running) {
      lastFrame = 0;
      lastRealtime = 0;
      schedule();
    }
  });

  window.addEventListener("focus", () => {
    lastFrame = 0;
    if (running) schedule();
  });

  // Observe #main children; if #main isn't there yet, watch body until it appears.
  const tileObserver = new MutationObserver(() => {
    tilesStale = true;
  });
  let bodyObserver: MutationObserver | null = null;

  function observeMain(): void {
    if (!mainEl) mainEl = document.querySelector<HTMLElement>("#main");
    if (!mainEl) {
      if (!bodyObserver) {
        bodyObserver = new MutationObserver(() => {
          if (document.querySelector("#main")) {
            bodyObserver?.disconnect();
            bodyObserver = null;
            observeMain();
          }
        });
        bodyObserver.observe(document.body, { childList: true });
      }
      return;
    }
    tileObserver.observe(mainEl, { childList: true, subtree: true });
    tilesStale = true;
  }

  resize();
  observeMain();

  return {
    setScene(s: Scene): void {
      rainNow = clamp(s.rain);
      windNow = clamp(s.wind, -1, 1);
      if (rainNow >= ACTIVE_RAIN) start();
      else if (running) schedule();
    },
    setSmooth(on: boolean): void {
      smooth = on;
      lastFrame = 0;
      if (running) schedule();
    },
  };
}
