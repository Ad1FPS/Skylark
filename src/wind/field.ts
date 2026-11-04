import type { WindGrid } from "../api";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sampleGrid(g: WindGrid, t: number, lat: number, lon: number): { u: number; v: number } {
  const cols = g.cols;
  const rows = g.rows;
  if (cols < 1 || rows < 1) return { u: 0, v: 0 };
  const ti = clamp(Math.round(t), 0, g.u.length - 1);
  const uRow = g.u[ti] ?? [];
  const vRow = g.v[ti] ?? [];
  const lonSpan = g.lonMax - g.lonMin;
  const latSpan = g.latMax - g.latMin;
  let fx = lonSpan === 0 ? 0 : ((lon - g.lonMin) / lonSpan) * (cols - 1);
  let fy = latSpan === 0 ? 0 : ((g.latMax - lat) / latSpan) * (rows - 1);
  fx = clamp(fx, 0, cols - 1);
  fy = clamp(fy, 0, rows - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, cols - 1);
  const y1 = Math.min(y0 + 1, rows - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (arr: number[], x: number, y: number): number => {
    const v = arr[y * cols + x];
    return Number.isFinite(v) ? v : 0;
  };
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
  const u = lerp(
    lerp(at(uRow, x0, y0), at(uRow, x1, y0), tx),
    lerp(at(uRow, x0, y1), at(uRow, x1, y1), tx),
    ty,
  );
  const v = lerp(
    lerp(at(vRow, x0, y0), at(vRow, x1, y0), tx),
    lerp(at(vRow, x0, y1), at(vRow, x1, y1), tx),
    ty,
  );
  return { u, v };
}

/* ---------- colour ramp ---------- */

const STOPS: Array<[number, [number, number, number]]> = [
  [0, [0x8f, 0xd3, 0xff]],
  [15, [0x6e, 0xe7, 0xc8]],
  [30, [0xc7, 0xf2, 0x6b]],
  [45, [0xff, 0xd9, 0x5a]],
  [60, [0xff, 0x9a, 0x4d]],
  [90, [0xff, 0x5d, 0x6c]],
];

export function speedColor(kmh: number): string {
  const s = Number.isFinite(kmh) ? Math.max(0, kmh) : 0;
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  if (s <= a[0]) return rgb(a[1]);
  if (s >= b[0]) return rgb(b[1]);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i];
    const hi = STOPS[i + 1];
    if (s >= lo[0] && s <= hi[0]) {
      a = lo;
      b = hi;
      break;
    }
  }
  const k = b[0] === a[0] ? 0 : (s - a[0]) / (b[0] - a[0]);
  const c: [number, number, number] = [
    Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
    Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
    Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
  ];
  return rgb(c);
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
