import type { Layer, Scene } from "./types";
import { lerp, rng } from "./util";

const CLASSES = [
  { max: 150, rLo: 1, rHi: 1.6, sLo: 22, sHi: 40, alpha: 0.6 },
  { max: 80, rLo: 1.8, rHi: 2.4, sLo: 35, sHi: 60, alpha: 0.75 },
  { max: 24, rLo: 2.8, rHi: 3.6, sLo: 55, sHi: 90, alpha: 0.85 },
] as const;

interface Field {
  x: Float32Array;
  y: Float32Array;
  speed: Float32Array;
  radius: Float32Array;
  amp: Float32Array;
  freq: Float32Array;
  phase: Float32Array;
}

function makeField(cfg: (typeof CLASSES)[number], r: () => number): Field {
  const f: Field = {
    x: new Float32Array(cfg.max),
    y: new Float32Array(cfg.max),
    speed: new Float32Array(cfg.max),
    radius: new Float32Array(cfg.max),
    amp: new Float32Array(cfg.max),
    freq: new Float32Array(cfg.max),
    phase: new Float32Array(cfg.max),
  };
  for (let i = 0; i < cfg.max; i++) {
    f.x[i] = r();
    f.y[i] = r();
    f.speed[i] = lerp(cfg.sLo, cfg.sHi, r());
    f.radius[i] = lerp(cfg.rLo, cfg.rHi, r());
    f.amp[i] = lerp(8, 26, r());
    f.freq[i] = lerp(0.4, 1.2, r());
    f.phase[i] = r() * Math.PI * 2;
  }
  return f;
}

export function createSnow(): Layer {
  const r = rng(123);
  const fields = CLASSES.map((cfg) => makeField(cfg, r));

  let width = 1;
  let height = 1;
  let t = 0;
  let drift = 0;
  let quality = 1;
  let sceneNow: Scene | null = null;

  return {
    fps(scene: Scene): number {
      return scene.snow > 0.01 ? 24 : 0;
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
    },
    update(dt: number, scene: Scene, q: number): void {
      sceneNow = scene;
      quality = q;
      t += dt;
      const snow = scene.snow;
      if (snow <= 0.001) return;
      const speedScale = 0.7 + 0.5 * snow;
      drift += scene.wind * 70 * dt;
      const margin = 30;

      for (let c = 0; c < CLASSES.length; c++) {
        const cfg = CLASSES[c];
        const f = fields[c];
        const count = Math.floor(cfg.max * snow * quality);
        for (let i = 0; i < count; i++) {
          f.y[i] += (f.speed[i] * speedScale * dt) / height;
          if (f.y[i] * height > height + margin) {
            f.y[i] = (-margin - r() * 40) / height;
            f.x[i] = r();
          }
        }
      }
    },
    draw(ctx: CanvasRenderingContext2D): void {
      const s = sceneNow;
      if (!s || s.snow <= 0.001) return;
      const vis = Math.min(1, s.snow * 1.5) * (0.7 + 0.3 * s.daylight);

      ctx.save();
      ctx.fillStyle = "#fff";
      for (let c = 0; c < CLASSES.length; c++) {
        const cfg = CLASSES[c];
        const f = fields[c];
        const count = Math.floor(cfg.max * s.snow * quality);
        if (count <= 0) continue;
        ctx.globalAlpha = cfg.alpha * vis;
        ctx.beginPath();
        const wrap = width + 60;
        for (let i = 0; i < count; i++) {
          const px = (((f.x[i] * width + Math.sin(t * f.freq[i] + f.phase[i]) * f.amp[i] + drift) % wrap) + wrap) % wrap - 30;
          const py = f.y[i] * height;
          ctx.moveTo(px + f.radius[i], py);
          ctx.arc(px, py, f.radius[i], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}
