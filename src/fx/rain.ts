import type { Layer, Scene } from "./types";
import { lerp, rng } from "./util";

// Far drops are short, faint and slow; near drops are long, bright and fast.
const CLASSES = [
  { max: 240, speedLo: 620, speedHi: 820, lenLo: 9, lenHi: 16, alpha: 0.3, width: 1, rgb: "200,218,240" },
  { max: 130, speedLo: 1000, speedHi: 1400, lenLo: 18, lenHi: 32, alpha: 0.55, width: 1.4, rgb: "220,232,248" },
] as const;

interface Field {
  x: Float32Array;
  y: Float32Array;
  speed: Float32Array;
  len: Float32Array;
}

export function createRain(): Layer {
  const r = rng(99);
  const fields: Field[] = CLASSES.map((cfg) => {
    const f: Field = {
      x: new Float32Array(cfg.max),
      y: new Float32Array(cfg.max),
      speed: new Float32Array(cfg.max),
      len: new Float32Array(cfg.max),
    };
    for (let i = 0; i < cfg.max; i++) {
      f.speed[i] = lerp(cfg.speedLo, cfg.speedHi, r());
      f.len[i] = lerp(cfg.lenLo, cfg.lenHi, r());
    }
    return f;
  });

  let width = 1;
  let height = 1;
  let quality = 1;
  let scene: Scene | null = null;

  /** Positions are in CSS pixels; scatter them over the whole screen so rain starts already falling. */
  function scatter(): void {
    for (const f of fields) {
      for (let i = 0; i < f.x.length; i++) {
        f.x[i] = r() * width;
        f.y[i] = r() * height;
      }
    }
  }

  return {
    fps: (s) => (s.rain > 0.01 ? 30 : 0),
    resize(w, h) {
      width = w;
      height = h;
      scatter();
    },
    update(dt, s, q) {
      scene = s;
      quality = q;
      const speedScale = 0.75 + 0.5 * s.rain;
      const margin = width * 0.5 + 40;
      CLASSES.forEach((cfg, c) => {
        const f = fields[c];
        const count = Math.floor(cfg.max * s.rain * q);
        for (let i = 0; i < count; i++) {
          const sp = f.speed[i] * speedScale;
          f.x[i] += (s.wind * sp * 0.55 + sp * 0.04) * dt;
          f.y[i] += sp * dt;
          if (f.y[i] > height + 40 || f.x[i] < -margin || f.x[i] > width + margin) {
            f.y[i] = -lerp(20, 80, r());
            f.x[i] = r() * (width + margin * 2) - margin;
          }
        }
      });
    },
    draw(ctx) {
      const s = scene;
      if (!s || s.rain <= 0.001) return;
      const speedScale = 0.75 + 0.5 * s.rain;
      // Dimmer at night.
      const vis = Math.min(1, s.rain * 1.6) * (0.65 + 0.35 * s.daylight);

      ctx.save();
      ctx.lineCap = "round";
      CLASSES.forEach((cfg, c) => {
        const f = fields[c];
        const count = Math.floor(cfg.max * s.rain * quality);
        if (count <= 0) return;
        ctx.strokeStyle = `rgba(${cfg.rgb},${cfg.alpha * vis})`;
        ctx.lineWidth = cfg.width;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          // Each streak trails along its own velocity.
          const sp = f.speed[i] * speedScale;
          const vx = s.wind * sp * 0.55 + sp * 0.04;
          const k = f.len[i] / sp;
          ctx.moveTo(f.x[i], f.y[i]);
          ctx.lineTo(f.x[i] - vx * k, f.y[i] - sp * k);
        }
        ctx.stroke();
      });
      ctx.restore();
    },
  };
}
