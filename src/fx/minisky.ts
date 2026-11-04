import type { Scene } from "./types";
import { SPRITE_H, SPRITE_W, TONES, sprites, type Tone } from "./clouds";
import { clamp, lerp, rng } from "./util";

interface Sky {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: Scene;
  /** CSS size. */
  w: number;
  h: number;
  dpr: number;
  /** Seeded state, built once. */
  stars: {
    x: Float32Array;
    y: Float32Array;
    r: Float32Array;
    speed: Float32Array;
    phase: Float32Array;
  };
  clouds: { x: number; y: number; s: number; d: number; variant: number }[];
  fog: { off: number; d: number };
  rain: { x: Float32Array; y: Float32Array; speed: Float32Array; len: Float32Array };
  snow: { x: Float32Array; y: Float32Array; speed: Float32Array; rad: Float32Array; phase: Float32Array };
  /** Animation clock, seconds. */
  t: number;
  /** Time until the next lightning flash. */
  nextFlash: number;
  /** Current flash opacity, decays after each strike. */
  flash: number;
}

const STAR_MAX = 14;
const CLOUD_MAX = 7;
const RAIN_MAX = 42;
const SNOW_MAX = 34;
const RES_MAX = 1.5;
const TARGET_DT = 0.05;
const FLASH_DECAY = 1 / 0.16;

const skies: Sky[] = [];
const visible = new WeakMap<HTMLCanvasElement, boolean>();
const weights: Record<Tone, number> = { day: 0, night: 0, storm: 0 };

let loopId = 0;
let lastFrame = 0;
let observer: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

function makeSky(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, scene: Scene): Sky {
  const r = rng((skies.length + 1) * 7919);
  const stars = {
    x: new Float32Array(STAR_MAX),
    y: new Float32Array(STAR_MAX),
    r: new Float32Array(STAR_MAX),
    speed: new Float32Array(STAR_MAX),
    phase: new Float32Array(STAR_MAX),
  };
  for (let i = 0; i < STAR_MAX; i++) {
    stars.x[i] = r();
    stars.y[i] = r() * 0.7;
    stars.r[i] = lerp(0.6, 1.3, r());
    stars.speed[i] = lerp(0.7, 3.2, r());
    stars.phase[i] = r() * Math.PI * 2;
  }
  const clouds: Sky["clouds"] = [];
  for (let i = 0; i < CLOUD_MAX; i++) {
    clouds.push({ x: r(), y: lerp(0.04, 0.8, r()), s: lerp(0.7, 1.3, r()), d: lerp(0.5, 1, r()), variant: Math.floor(r() * 3) });
  }
  const rain = { x: new Float32Array(RAIN_MAX), y: new Float32Array(RAIN_MAX), speed: new Float32Array(RAIN_MAX), len: new Float32Array(RAIN_MAX) };
  for (let i = 0; i < RAIN_MAX; i++) {
    rain.x[i] = r();
    rain.y[i] = r();
    rain.speed[i] = lerp(180, 260, r());
    rain.len[i] = lerp(7, 13, r());
  }
  const snow = {
    x: new Float32Array(SNOW_MAX),
    y: new Float32Array(SNOW_MAX),
    speed: new Float32Array(SNOW_MAX),
    rad: new Float32Array(SNOW_MAX),
    phase: new Float32Array(SNOW_MAX),
  };
  for (let i = 0; i < SNOW_MAX; i++) {
    snow.x[i] = r();
    snow.y[i] = r();
    snow.speed[i] = lerp(22, 48, r());
    snow.rad[i] = lerp(0.8, 1.8, r());
    snow.phase[i] = r() * Math.PI * 2;
  }
  return {
    canvas,
    ctx,
    scene,
    w: 1,
    h: 1,
    dpr: 1,
    stars,
    clouds,
    fog: { off: r(), d: lerp(0.4, 1, r()) },
    rain,
    snow,
    t: r() * 20,
    nextFlash: lerp(3, 9, r()),
    flash: 0,
  };
}

function sizeSky(sky: Sky): void {
  const rect = sky.canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  if (w === sky.w && h === sky.h) return;
  sky.w = w;
  sky.h = h;
  sky.dpr = Math.min(window.devicePixelRatio || 1, RES_MAX);
  sky.canvas.width = Math.round(w * sky.dpr);
  sky.canvas.height = Math.round(h * sky.dpr);
}

function step(sky: Sky, dt: number): void {
  const s = sky.scene;
  sky.t += dt;
  const w = sky.w;
  const h = sky.h;
  const windDir = Math.abs(s.wind) > 0.04 ? Math.sign(s.wind) : 1;

  if (s.clouds > 0.03) {
    const n = Math.round(2 + 5 * s.clouds);
    for (let i = 0; i < n && i < CLOUD_MAX; i++) {
      const c = sky.clouds[i];
      const speed = (5 + 28 * s.windSpeed) * c.d;
      const margin = (SPRITE_W * c.s * 0.34) / w;
      c.x += (windDir * speed * dt) / w;
      if (c.x - margin > 1) c.x = -margin;
      else if (c.x + margin < 0) c.x = 1 + margin;
    }
  }
  if (s.fog > 0.05) sky.fog.off += dt * sky.fog.d * 0.02 * windDir;

  if (s.rain > 0.03) {
    const count = Math.round(8 + 34 * s.rain);
    const r = sky.rain;
    for (let i = 0; i < count; i++) {
      r.y[i] += (r.speed[i] * dt) / h;
      r.x[i] += (s.wind * 0.6 * r.speed[i] * dt) / w;
      if (r.y[i] > 1.1 || r.x[i] < -0.1 || r.x[i] > 1.1) {
        r.y[i] = -lerp(0.02, 0.08, Math.random());
        r.x[i] = Math.random();
      }
    }
  }
  if (s.snow > 0.03) {
    const count = Math.round(8 + 26 * s.snow);
    const f = sky.snow;
    for (let i = 0; i < count; i++) {
      f.y[i] += (f.speed[i] * dt) / h;
      if (f.y[i] > 1.05) {
        f.y[i] = -0.05;
        f.x[i] = Math.random();
      }
    }
  }

  if (sky.flash > 0) sky.flash = Math.max(0, sky.flash - dt * FLASH_DECAY);
  if (s.lightning > 0.05) {
    sky.nextFlash -= dt;
    if (sky.nextFlash <= 0) {
      sky.flash = clamp(0.4 + 0.6 * s.lightning);
      const base = lerp(9, 3, s.lightning);
      sky.nextFlash = base * (0.6 + Math.random() * 0.8);
    }
  }
}

function draw(sky: Sky, count: number): void {
  const { ctx, w, h } = sky;
  const s = sky.scene;
  ctx.setTransform(sky.dpr, 0, 0, sky.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 1. Sun / moon glow.
  if (s.sun > 0.05) {
    const cx = s.bodyX * w;
    const cy = clamp(s.bodyY, 0.12, 0.5) * h;
    const rad = h * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(255,236,170,${0.55 * s.sun})`);
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  // 2. Stars.
  if (s.stars > 0.05) {
    const k = count > 8 ? 0.6 : 1;
    const n = Math.round(STAR_MAX * s.stars * k);
    const st = sky.stars;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < n; i++) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(sky.t * st.speed[i] + st.phase[i]));
      ctx.globalAlpha = tw * s.stars;
      ctx.beginPath();
      ctx.arc(st.x[i] * w, st.y[i] * h, st.r[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 3. Clouds.
  if (s.clouds > 0.03) {
    weights.day = s.daylight * (1 - s.cloudDark);
    weights.night = (1 - s.daylight) * (1 - s.cloudDark);
    weights.storm = s.cloudDark;
    const n = Math.round(2 + 5 * s.clouds);
    for (let i = 0; i < n && i < CLOUD_MAX; i++) {
      const c = sky.clouds[i];
      const dw = SPRITE_W * c.s * 0.34;
      const dh = dw * (SPRITE_H / SPRITE_W);
      const x = c.x * w - dw / 2;
      const y = c.y * h - dh / 2;
      for (const tone of TONES) {
        const wt = weights[tone];
        if (wt <= 0.02) continue;
        ctx.globalAlpha = clamp((0.45 + 0.55 * s.clouds) * c.d * wt);
        ctx.drawImage(sprites(tone)[c.variant], x, y, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 4. Fog.
  if (s.fog > 0.05) {
    const a = 0.22 * s.fog;
    for (let i = 0; i < 2; i++) {
      const off = (((sky.fog.off + i * 0.5) % 1) + 1) % 1;
      const bandH = h * 0.22;
      const y = h * (0.5 + i * 0.28) - bandH / 2;
      const g = ctx.createLinearGradient(0, y, 0, y + bandH);
      g.addColorStop(0, "rgba(235,240,248,0)");
      g.addColorStop(0.5, `rgba(235,240,248,${a})`);
      g.addColorStop(1, "rgba(235,240,248,0)");
      ctx.fillStyle = g;
      const shift = (off - 0.5) * w * 0.3;
      ctx.fillRect(-w * 0.2 + shift, y, w * 1.4, bandH);
    }
  }

  // 5. Rain.
  if (s.rain > 0.03) {
    const k = count > 8 ? 0.6 : 1;
    const n = Math.round((8 + 34 * s.rain) * k);
    const r = sky.rain;
    ctx.strokeStyle = "rgba(205,225,255,0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const vx = s.wind * 0.6 * r.speed[i];
      const kk = r.len[i] / r.speed[i];
      const x = r.x[i] * w;
      const y = r.y[i] * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - vx * kk, y - r.speed[i] * kk);
    }
    ctx.stroke();
  }

  // 6. Snow.
  if (s.snow > 0.03) {
    const k = count > 8 ? 0.6 : 1;
    const n = Math.round((8 + 26 * s.snow) * k);
    const f = sky.snow;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < n; i++) {
      const sway = Math.sin(sky.t * 0.8 + f.phase[i]) * 3;
      ctx.beginPath();
      ctx.arc(f.x[i] * w + sway, f.y[i] * h, f.rad[i], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 7. Lightning.
  if (sky.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.28 * sky.flash})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function tick(now: number): void {
  loopId = requestAnimationFrame(tick);
  try {
    if (now - lastFrame < TARGET_DT * 1000) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (document.hidden) return;

    for (let i = skies.length - 1; i >= 0; i--) {
      if (!skies[i].canvas.isConnected) skies.splice(i, 1);
    }
    const count = skies.length;
    for (let i = 0; i < count; i++) {
      const sky = skies[i];
      if (visible.get(sky.canvas) === false) continue;
      step(sky, dt);
      draw(sky, count);
    }
  } catch {
    // A single bad frame must never break the shared loop.
  }
}

function ensureObservers(): void {
  if (!observer && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target as HTMLCanvasElement, e.isIntersecting);
    });
  }
  if (!resizeObserver && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) {
        const canvas = e.target as HTMLCanvasElement;
        for (const sky of skies) {
          if (sky.canvas !== canvas) continue;
          sizeSky(sky);
          draw(sky, skies.length);
          break;
        }
      }
    });
  }
}

export function addMiniSky(canvas: HTMLCanvasElement, scene: Scene): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;

  const sky = makeSky(canvas, ctx, scene);
  sizeSky(sky);
  skies.push(sky);

  ensureObservers();
  if (!visible.has(canvas)) visible.set(canvas, true);
  observer?.observe(canvas);
  resizeObserver?.observe(canvas);

  draw(sky, skies.length);

  if (skies.length === 1) {
    lastFrame = performance.now();
    loopId = requestAnimationFrame(tick);
  }

  return () => {
    const idx = skies.indexOf(sky);
    if (idx >= 0) skies.splice(idx, 1);
    observer?.unobserve(canvas);
    resizeObserver?.unobserve(canvas);
    if (skies.length === 0 && loopId) {
      cancelAnimationFrame(loopId);
      loopId = 0;
    }
  };
}
