import type { Layer, Scene } from "./types";
import { clamp } from "./util";

const SPRITE_W = 900;
const SPRITE_H = 220;
const BANDS = 4;
const HEIGHTS = [0.38, 0.52, 0.66, 0.8];

let sprite: HTMLCanvasElement | null = null;
function fogSprite(): HTMLCanvasElement {
  if (sprite) return sprite;
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const g = c.getContext("2d");
  if (g) {
    g.save();
    g.translate(SPRITE_W / 2, SPRITE_H / 2);
    g.scale(2.4, 1);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, SPRITE_H / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(-SPRITE_W, -SPRITE_H, SPRITE_W * 2, SPRITE_H * 2);
    g.restore();

    // Second smaller blob for irregularity.
    g.save();
    g.translate(SPRITE_W * 0.62, SPRITE_H * 0.42);
    g.scale(1.6, 1);
    const b = g.createRadialGradient(0, 0, 0, 0, 0, SPRITE_H * 0.32);
    b.addColorStop(0, "rgba(255,255,255,0.32)");
    b.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = b;
    g.fillRect(-SPRITE_W, -SPRITE_H, SPRITE_W * 2, SPRITE_H * 2);
    g.restore();
  }
  sprite = c;
  return c;
}

export function createFog(): Layer {
  let width = 1;
  let height = 1;
  let t = 0;
  let sceneNow: Scene | null = null;
  const offsets = new Float32Array(BANDS);

  return {
    fps(scene: Scene): number {
      return scene.fog > 0.01 ? 12 : 0;
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
    },
    update(dt: number, scene: Scene): void {
      sceneNow = scene;
      t += dt;
      for (let i = 0; i < BANDS; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = (6 + 8 * (i / (BANDS - 1))) * (1 - i * 0.12);
        offsets[i] += dir * speed * dt;
      }
    },
    draw(ctx: CanvasRenderingContext2D): void {
      const s = sceneNow;
      if (!s || s.fog <= 0.001) return;
      const img = fogSprite();
      const dim = 0.45 + 0.55 * s.daylight;
      const scale = Math.max(1, width / SPRITE_W);
      const dw = SPRITE_W * scale;
      const dh = SPRITE_H * Math.min(1.4, scale);

      ctx.save();
      for (let i = 0; i < BANDS; i++) {
        const band = 0.6 + 0.4 * (i / (BANDS - 1));
        const a = clamp(0.5 * s.fog * band, 0, 0.55) * dim;
        if (a <= 0.003) continue;
        const bob = Math.sin(t * 0.25 + i * 1.7) * 4;
        const y = HEIGHTS[i] * height - dh / 2 + bob;
        let x = (offsets[i] % dw + dw) % dw - dw;
        ctx.globalAlpha = a;
        ctx.drawImage(img, x, y, dw, dh);
        ctx.drawImage(img, x + dw, y, dw, dh);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}
