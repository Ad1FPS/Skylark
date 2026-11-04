import type { Layer, Scene } from "./types";
import { lerp, rng } from "./util";

const DURATION = 0.45;
const BOLT_END = 0.2;
const IDLE = 0.05;

interface Strike {
  age: number;
  points: Float32Array;
  branch: Float32Array;
}

const FLASH: [number, number][] = [
  [0, 0],
  [0.05, 0.38],
  [0.12, 0.08],
  [0.18, 0.28],
  [DURATION, 0],
];

function flashAt(age: number): number {
  for (let i = 1; i < FLASH.length; i++) {
    const [t1, a1] = FLASH[i];
    if (age <= t1) {
      const [t0, a0] = FLASH[i - 1];
      return lerp(a0, a1, (age - t0) / (t1 - t0));
    }
  }
  return 0;
}

export function createLightning(): Layer {
  const r = rng(555);
  let width = 1;
  let height = 1;
  let t = 0;
  let strike: Strike | null = null;
  let nextStrike = 0;
  let armed = false;
  let sceneNow: Scene | null = null;

  function makeBolt(): Strike {
    const segs = 9 + Math.floor(r() * 5);
    const points = new Float32Array((segs + 1) * 2);
    let x = lerp(0.15, 0.85, r()) * width;
    let y = 0;
    const dy = (height * lerp(0.55, 0.75, r())) / segs;
    points[0] = x;
    points[1] = y;
    for (let i = 1; i <= segs; i++) {
      x += (r() - 0.5) * 80;
      y += dy * lerp(0.8, 1.2, r());
      points[i * 2] = x;
      points[i * 2 + 1] = y;
    }
    // Branch from a middle point.
    const mid = Math.floor(segs / 2);
    const bx = points[mid * 2];
    const by = points[mid * 2 + 1];
    const blen = 2 + Math.floor(r() * 3);
    const branch = new Float32Array((blen + 1) * 2);
    branch[0] = bx;
    branch[1] = by;
    let cx = bx;
    let cy = by;
    for (let i = 1; i <= blen; i++) {
      cx += (r() - 0.5) * 70 + 20;
      cy += dy * lerp(0.6, 1, r());
      branch[i * 2] = cx;
      branch[i * 2 + 1] = cy;
    }
    return { age: 0, points, branch };
  }

  return {
    fps(scene: Scene): number {
      if (scene.lightning <= IDLE) return 0;
      return strike ? 30 : 6;
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
      strike = null;
    },
    update(dt: number, scene: Scene): void {
      sceneNow = scene;
      if (scene.lightning <= IDLE) {
        strike = null;
        armed = false;
        return;
      }
      t += dt;
      if (!armed) {
        armed = true;
        nextStrike = t + lerp(2, 6, r());
      }
      if (strike) {
        strike.age += dt;
        if (strike.age >= DURATION) strike = null;
      } else if (t >= nextStrike) {
        strike = makeBolt();
        nextStrike = t + lerp(6, 16, r()) / scene.lightning;
      }
    },
    draw(ctx: CanvasRenderingContext2D): void {
      const s = sceneNow;
      if (!s || s.lightning <= IDLE || !strike) return;
      const strength = s.lightning;
      const a = flashAt(strike.age) * strength;
      if (a > 0.002) {
        ctx.fillStyle = `rgba(210,225,255,${a})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (strike.age < BOLT_END) {
        const fade = strike.age <= 0.1 ? 1 : 1 - (strike.age - 0.1) / (BOLT_END - 0.1);
        drawBolt(ctx, strike, fade * strength);
      }
    },
  };

  function drawBolt(ctx: CanvasRenderingContext2D, st: Strike, fade: number): void {
    if (fade <= 0.001) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.strokeStyle = `rgba(170,200,255,${0.25 * fade})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    tracePath(ctx, st.points);
    tracePath(ctx, st.branch);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    tracePath(ctx, st.points);
    tracePath(ctx, st.branch);
    ctx.stroke();

    ctx.restore();
  }
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Float32Array): void {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
}
