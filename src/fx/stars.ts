import type { Layer, Scene } from "./types";
import { clamp, lerp, rng } from "./util";

const MAX_STARS = 190;
const MIN_STARS = 60;
const BRIGHT_STARS = 18;
const GLOW_RAW = 24;

interface Star {
  x: number;
  y: number;
  size: number;
  base: number;
  speed: number;
  phase: number;
  bright: boolean;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
}

let glow: HTMLCanvasElement | null = null;
function glowSprite(): HTMLCanvasElement {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = GLOW_RAW;
  c.height = GLOW_RAW;
  const g = c.getContext("2d");
  if (g) {
    const r = GLOW_RAW / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, GLOW_RAW, GLOW_RAW);
  }
  glow = c;
  return c;
}

export function createStars(): Layer {
  const r = rng(42);
  const all: Star[] = [];
  for (let i = 0; i < MAX_STARS; i++) {
    all.push({
      x: r(),
      y: r() * 0.78,
      size: i < BRIGHT_STARS ? lerp(1.4, 2.2, r()) : lerp(0.9, 1.8, r()),
      base: lerp(0.55, 1, r()),
      speed: lerp(0.6, 2.4, r()),
      phase: r() * Math.PI * 2,
      bright: i < BRIGHT_STARS,
    });
  }

  let width = 1;
  let height = 1;
  let t = 0;
  let shot: Shot | null = null;
  let nextShot = lerp(4, 10, r());
  let nextDir = r() < 0.5 ? 1 : -1;
  let quality = 1;
  let sceneNow: Scene | null = null;

  function startShot(): void {
    const speed = lerp(480, 760, Math.random());
    const angle = (lerp(20, 35, Math.random()) * Math.PI) / 180;
    const sign = nextDir;
    nextDir = -nextDir;
    const startX = sign > 0 ? lerp(-40, width * 0.3, Math.random()) : lerp(width * 0.7, width + 40, Math.random());
    shot = {
      x: startX,
      y: lerp(20, height * 0.4, Math.random()),
      vx: Math.cos(angle) * speed * sign,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: lerp(0.7, 1.0, Math.random()),
      len: lerp(90, 160, Math.random()),
    };
  }

  return {
    fps(scene: Scene): number {
      if (scene.stars * (1 - scene.daylight) < 0.02) return 0;
      return shot ? 30 : 12;
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
    },
    update(dt: number, scene: Scene, q: number): void {
      sceneNow = scene;
      quality = q;
      t += dt;
      const vis = scene.stars * (1 - scene.daylight);

      if (shot) {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.life += dt;
        if (shot.life >= shot.max) {
          shot = null;
          nextShot = t + lerp(14, 40, Math.random());
        }
      } else if (vis > 0.3 && t >= nextShot) {
        startShot();
      }
    },
    draw(ctx: CanvasRenderingContext2D): void {
      const s = sceneNow;
      if (!s) return;
      const vis = s.stars * (1 - s.daylight);
      if (vis < 0.02) return;

      const count = Math.max(MIN_STARS, Math.round(MAX_STARS * quality));
      const glowImg = glowSprite();
      ctx.save();
      ctx.fillStyle = "#fff";
      for (let i = 0; i < count; i++) {
        const st = all[i];
        const a = clamp(st.base * (0.55 + 0.45 * Math.sin(t * st.speed + st.phase)) * vis);
        if (st.bright) {
          ctx.globalAlpha = a * 0.4;
          const g = GLOW_RAW * st.size * 0.55;
          ctx.drawImage(glowImg, st.x * width - g / 2, st.y * height - g / 2, g, g);
        }
        ctx.globalAlpha = a;
        const px = Math.round(st.x * width * 2) / 2;
        const py = Math.round(st.y * height * 2) / 2;
        ctx.fillRect(px, py, st.size, st.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (shot) drawShot(ctx, shot);
    },
  };

  function drawShot(ctx: CanvasRenderingContext2D, sh: Shot): void {
    const prog = sh.life / sh.max;
    const fade = prog > 0.7 ? 1 - (prog - 0.7) / 0.3 : 1;
    const mag = Math.hypot(sh.vx, sh.vy) || 1;
    const tx = sh.x - (sh.vx / mag) * sh.len;
    const ty = sh.y - (sh.vy / mag) * sh.len;
    const grad = ctx.createLinearGradient(tx, ty, sh.x, sh.y);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(255,255,255,${clamp(fade)})`);
    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(sh.x, sh.y);
    ctx.stroke();
    ctx.globalAlpha = clamp(fade);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sh.x - 1.5, sh.y - 1.5, 3, 3);
    ctx.restore();
  }
}
