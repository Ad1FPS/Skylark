import type { Settings } from "./types";

const KEY = "weather.settings";

export const DEFAULT_SETTINGS: Settings = { temp: "c", wind: "kmh", clock: "24" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore storage errors */
  }
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toF(c: number): number {
  return c * 9 / 5 + 32;
}

export function temp(c: number, s: Settings): string {
  const v = s.temp === "f" ? toF(c) : c;
  return String(Math.round(v));
}

export function tempDeg(c: number, s: Settings): string {
  return `${temp(c, s)}\u00B0`;
}

export function wind(kmh: number, s: Settings): { value: string; unit: string } {
  if (s.wind === "mph") return { value: String(Math.round(kmh * 0.621371)), unit: "mph" };
  if (s.wind === "ms") return { value: String(Math.round(kmh / 3.6)), unit: "m/s" };
  return { value: String(Math.round(kmh)), unit: "km/h" };
}

interface ClockParts {
  h: number;
  m: number;
}

function parseLocal(iso: string): ClockParts {
  // ISO strings from backend are local to the location; take the wall-clock parts.
  const t = iso.length > 10 ? iso.slice(11, 16) : "00:00";
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  return { h: Number.isFinite(hh) ? hh : 0, m: Number.isFinite(mm) ? mm : 0 };
}

function hour12(h: number, m: number): string {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hasMin = m > 0;
  const base = hasMin ? `${h12}:${String(m).padStart(2, "0")}` : String(h12);
  return `${base} ${period}`;
}

export function hourLabel(iso: string, s: Settings): string {
  const { h } = parseLocal(iso);
  if (s.clock === "12") return hour12(h, 0);
  return String(h).padStart(2, "0");
}

export function clock(iso: string, s: Settings): string {
  const { h, m } = parseLocal(iso);
  if (s.clock === "12") return hour12(h, m);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Wall-clock time at a place, given its UTC offset in seconds. */
export function localClock(offsetSeconds: number, s: Settings): string {
  const d = new Date(Date.now() + offsetSeconds * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (s.clock === "12") return hour12(h, m);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayName(isoDate: string, index: number): string {
  if (index === 0) return "Today";
  const [y, mo, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const date = new Date(y, (mo || 1) - 1, d || 1);
  return WEEKDAYS[date.getDay()];
}

export function compass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round(((deg % 360) / 45)) % 8;
  return dirs[(i + 8) % 8];
}

// Temperature ramp stops (metric). Linear interpolate between them.
const RAMP: Array<[number, [number, number, number]]> = [
  [0, [124, 196, 255]],
  [10, [110, 231, 183]],
  [20, [253, 224, 71]],
  [30, [251, 146, 60]],
];

export function tempColor(c: number): string {
  if (c <= RAMP[0][0]) return rgb(RAMP[0][1]);
  const last = RAMP[RAMP.length - 1];
  if (c >= last[0]) return rgb(last[1]);
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [a, ca] = RAMP[i];
    const [b, cb] = RAMP[i + 1];
    if (c >= a && c <= b) {
      const t = (c - a) / (b - a);
      return rgb([
        Math.round(ca[0] + (cb[0] - ca[0]) * t),
        Math.round(ca[1] + (cb[1] - ca[1]) * t),
        Math.round(ca[2] + (cb[2] - ca[2]) * t),
      ]);
    }
  }
  return rgb(last[1]);
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}
