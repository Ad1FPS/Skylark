import type { Layer, Scene } from "./types";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function createGlow(): Layer {
  let width = 1;
  let height = 1;
  let t = 0;
  let lastScene: Scene | null = null;

  const moonAmount = (s: Scene): number => s.stars * (1 - s.daylight);

  return {
    fps(scene: Scene): number {
      if (scene.sun * scene.daylight > 0.02 || scene.twilight > 0.02) return 8;
      return moonAmount(scene) > 0.02 ? 4 : 0;
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
    },
    update(dt: number, scene: Scene): void {
      lastScene = scene;
      t += dt;
    },
    draw(ctx: CanvasRenderingContext2D): void {
      drawGlow(ctx);
    },
  };

  function drawGlow(ctx: CanvasRenderingContext2D): void {
    const s = lastScene;
    if (!s) return;
    const m = Math.max(width, height);
    const cx = s.bodyX * width;
    const cy = s.bodyY * height;

    const sunAmt = s.sun * s.daylight;
    if (sunAmt > 0.002) drawSun(ctx, cx, cy, m, sunAmt);

    const moonAmt = moonAmount(s);
    if (moonAmt > 0.002) drawMoon(ctx, cx, cy, m, moonAmt);

    const k = s.twilight;
    if (k > 0.002) {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, `rgba(88,70,160,${0.18 * k})`);
      sky.addColorStop(0.35, "rgba(88,70,160,0)");
      sky.addColorStop(0.38, "rgba(214,90,120,0)");
      sky.addColorStop(0.72, `rgba(214,90,120,${0.28 * k})`);
      sky.addColorStop(1, `rgba(255,150,70,${0.55 * k})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** A bright disc with a wide bloom: crisp in the middle, soft out to the edges. */
  function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, m: number, amt: number): void {
    const pulse = 0.94 + 0.06 * Math.sin(t * 0.35);
    const a = amt * pulse;
    radial(ctx, x, y, 0.6 * m, [
      [0, `rgba(255,244,205,${0.5 * a})`],
      [0.3, `rgba(255,228,160,${0.18 * a})`],
      [1, "rgba(255,225,150,0)"],
    ]);
    radial(ctx, x, y, 0.14 * m, [
      [0, `rgba(255,252,235,${0.75 * a})`],
      [0.5, `rgba(255,246,210,${0.3 * a})`],
      [1, "rgba(255,246,210,0)"],
    ]);
    drawHalo(ctx, x, y, m, a);
    drawGhosts(ctx, x, y, m, a);
    const r = clamp(0.028 * m, 22, 46);
    radial(ctx, x, y, r * 1.35, [
      [0, `rgba(255,255,255,${Math.min(1, a * 1.3)})`],
      [0.7, `rgba(255,253,240,${Math.min(1, a * 1.2)})`],
      [0.78, `rgba(255,246,215,${0.55 * a})`],
      [1, "rgba(255,240,200,0)"],
    ]);
  }

  /** The faint 22 degree ice-crystal ring around the sun: reddish inside, bluish outside, barely there. */
  function drawHalo(ctx: CanvasRenderingContext2D, x: number, y: number, m: number, a: number): void {
    const inner = 0.3 * m;
    const outer = inner + 0.055 * m;
    const f = (r: number): number => clamp(r / outer, 0, 1);
    const k = 0.1 * a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, outer);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(f(inner), "rgba(255,255,255,0)");
    g.addColorStop(f(inner + 0.006 * m), `rgba(255,120,90,${k * 0.8})`);
    g.addColorStop(f(inner + 0.016 * m), `rgba(255,225,140,${k})`);
    g.addColorStop(f(inner + 0.028 * m), `rgba(170,240,190,${k * 0.8})`);
    g.addColorStop(f(inner + 0.04 * m), `rgba(140,190,255,${k * 0.7})`);
    g.addColorStop(1, "rgba(140,190,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
  }

  /** Two or three soft lens ghosts along the line from the sun through the middle of the sky. */
  function drawGhosts(ctx: CanvasRenderingContext2D, x: number, y: number, m: number, a: number): void {
    const mx = width / 2;
    const my = height / 2;
    const ghosts: [number, number, string][] = [
      [0.55, 0.05, "255,235,190"],
      [1.1, 0.032, "190,225,255"],
      [1.55, 0.07, "255,205,170"],
    ];
    for (const [along, size, rgb] of ghosts) {
      const gx = x + (mx - x) * along;
      const gy = y + (my - y) * along;
      radial(ctx, gx, gy, size * m, [
        [0, `rgba(${rgb},${0.07 * a})`],
        [0.7, `rgba(${rgb},${0.04 * a})`],
        [1, `rgba(${rgb},0)`],
      ]);
    }
  }

  /** A pale disc with faint maria and a cool halo. */
  function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, m: number, amt: number): void {
    radial(ctx, x, y, 0.2 * m, [
      [0, `rgba(205,218,255,${0.32 * amt})`],
      [0.4, `rgba(190,205,250,${0.1 * amt})`],
      [1, "rgba(190,205,250,0)"],
    ]);
    const r = clamp(0.02 * m, 16, 34);
    ctx.save();
    ctx.globalAlpha = Math.min(1, amt * 1.2);
    const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    disc.addColorStop(0, "#fbfcff");
    disc.addColorStop(1, "#cdd5ee");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "rgba(110,125,165,0.16)";
    for (const [dx, dy, k] of [[-0.35, -0.2, 0.32], [0.3, 0.1, 0.4], [-0.05, 0.5, 0.22]] as const) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y + dy * r, k * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
