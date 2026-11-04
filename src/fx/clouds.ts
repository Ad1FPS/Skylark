import type { Layer, Scene } from "./types";
import { clamp, lerp, rng } from "./util";

const TONES = ["day", "night", "storm"] as const;
type Tone = (typeof TONES)[number];

/** Shaded base and lit top colour per tone, for puffy 3D clouds. */
const TONE_RGB: Record<Tone, { shade: string; light: string }> = {
  day: { shade: "150,166,198", light: "255,255,255" },
  night: { shade: "34,42,78", light: "122,138,190" },
  storm: { shade: "28,33,48", light: "98,108,130" },
};

const SPRITE_W = 480;
const SPRITE_H = 200;
const COUNT = 18;
/** Sprites are baked at this multiple of their drawn size so big windows do not just stretch a small bitmap. */
const SPRITE_RES = 1.5;

const SPRITES: Partial<Record<Tone, HTMLCanvasElement[]>> = {};

/** Lazily build the 3 shapes x 3 tones sprite atlas once. */
function sprites(tone: Tone): HTMLCanvasElement[] {
  const cached = SPRITES[tone];
  if (cached) return cached;
  const made: HTMLCanvasElement[] = [];
  const tone_ = TONE_RGB[tone];
  for (let v = 0; v < 3; v++) {
    const c = document.createElement("canvas");
    c.width = SPRITE_W * SPRITE_RES;
    c.height = SPRITE_H * SPRITE_RES;
    const g = c.getContext("2d");
    if (g) {
      g.scale(SPRITE_RES, SPRITE_RES);
      const r = rng(1000 + v * 37);
      // Many small soft puffs inside a dome with a flat base read as billows, not as circles.
      const puffs: { x: number; y: number; radius: number }[] = [];
      const N = 64;
      for (let i = 0; i < N; i++) {
        const u = r() * 2 - 1;
        const dome = Math.sqrt(Math.max(0, 1 - u * u));
        const top = 128 - dome * (60 + r() * 30);
        const y = lerp(top, 148, Math.pow(r(), 0.7));
        const radius = lerp(14, 40, r()) * (0.5 + 0.6 * dome);
        puffs.push({ x: SPRITE_W / 2 + u * 190, y, radius });
      }
      const puff = (p: { x: number; y: number; radius: number }, rgb: string, dx: number, dy: number, k: number, a: number): void => {
        const x = p.x + dx * p.radius;
        const y = p.y + dy * p.radius;
        const rad = p.radius * k;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${rgb},${a})`);
        grad.addColorStop(0.5, `rgba(${rgb},${a * 0.55})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      };
      for (const p of puffs) puff(p, tone_.shade, 0, 0, 1.4, 0.7);
      // Light comes from the upper left: tops catch it, undersides stay shaded.
      g.globalCompositeOperation = "source-atop";
      for (const p of puffs) puff(p, tone_.light, -0.35, -0.5, 1.0, 0.3);
      g.globalCompositeOperation = "source-over";
      // Soften the whole thing so no puff outline survives.
      g.setTransform(1, 0, 0, 1, 0, 0);
      const soft = document.createElement("canvas");
      soft.width = c.width;
      soft.height = c.height;
      const sg = soft.getContext("2d");
      if (sg) {
        sg.filter = `blur(${2.2 * SPRITE_RES}px)`;
        sg.drawImage(c, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(soft, 0, 0);
      }
    }
    made.push(c);
  }
  SPRITES[tone] = made;
  return made;
}

interface CloudState {
  x: number;
  y: number;
  scale: number;
  d: number;
  variant: number;
}

export function createClouds(): Layer {
  const init = rng(7);
  const clouds: CloudState[] = [];
  for (let i = 0; i < COUNT; i++) {
    clouds.push({
      x: init(),
      y: lerp(0.04, 0.96, init()),
      scale: lerp(0.9, 2.2, init()),
      d: lerp(0.4, 1, init()),
      variant: Math.floor(init() * 3),
    });
  }

  let width = 1;
  let height = 1;
  let t = 0;
  // Bigger windows get bigger clouds, so a fullscreen sky is not a few small tufts.
  let sizeK = 1;
  let dir = 1;
  let lastScene: Scene | null = null;

  // Current on-canvas state, in CSS pixels.
  const xs = new Float32Array(COUNT);
  const ys = new Float32Array(COUNT);
  const present = new Float32Array(COUNT);

  function place(): void {
    for (let i = 0; i < COUNT; i++) {
      xs[i] = clouds[i].x * width;
      ys[i] = clouds[i].y * height;
      present[i] = 0;
    }
  }

  const weights = { day: 0, night: 0, storm: 0 };

  return {
    fps(scene: Scene): number {
      return scene.clouds > 0.01 ? 15 : 0;
    },
    resize(w: number, h: number): void {
      const first = width === 1 && height === 1;
      const sx = w / width;
      const sy = h / height;
      width = w;
      height = h;
      sizeK = clamp(Math.max(w / 1100, h / 720), 1, 2.4);
      if (first) {
        place();
        return;
      }
      // Keep clouds where they were, relative to the new size.
      for (let i = 0; i < COUNT; i++) {
        xs[i] *= sx;
        ys[i] *= sy;
      }
    },
    update(dt: number, scene: Scene, quality: number): void {
      lastScene = scene;
      t += dt;
      const sign = Math.abs(scene.wind) > 0.04 ? Math.sign(scene.wind) : 1;
      dir = lerp(dir, sign, 1 - Math.exp(-dt / 0.8));

      const n = scene.clouds * COUNT * quality;
      for (let i = 0; i < COUNT; i++) {
        const c = clouds[i];
        const speed = (9 + 45 * scene.windSpeed) * c.d;
        xs[i] += dir * speed * dt;
        present[i] = clamp(n - i, 0, 1);

        const margin = SPRITE_W * c.scale * sizeK;
        if (xs[i] > width + margin) xs[i] = -margin;
        else if (xs[i] < -margin) xs[i] = width + margin;
      }
    },
    draw(ctx: CanvasRenderingContext2D): void {
      drawClouds(ctx);
    },
  };

  function drawClouds(ctx: CanvasRenderingContext2D): void {
    const s = lastScene;
    if (!s) return;
    const night = 1 - s.daylight;
    weights.day = s.daylight * (1 - s.cloudDark);
    weights.night = night * (1 - s.cloudDark);
    weights.storm = s.cloudDark;

    ctx.save();
    for (let i = 0; i < COUNT; i++) {
      const p = present[i];
      if (p <= 0.001) continue;
      const c = clouds[i];
      const w = SPRITE_W * c.scale * sizeK;
      const h = SPRITE_H * c.scale * sizeK;
      const x = xs[i] - w / 2;
      const y = ys[i] + Math.sin(t * 0.1 + i) * 3 - h / 2;
      // Clouds near the horizon sit in haze: lighter and softer than the ones overhead.
      const low = clamp((ys[i] / height - 0.5) / 0.5);
      const baseAlpha = (0.4 + 0.6 * s.clouds) * c.d * p * (1 - 0.4 * low * low * (3 - 2 * low));
      for (const tone of TONES) {
        const wt = weights[tone];
        if (wt <= 0.02) continue;
        ctx.globalAlpha = clamp(baseAlpha * wt);
        ctx.drawImage(sprites(tone)[c.variant], x, y, w, h);
      }
    }
    ctx.restore();
  }
}
