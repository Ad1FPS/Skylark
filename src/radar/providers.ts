export interface RadarFrame {
  /** Unix seconds the frame is valid for. */
  time: number;
  url(z: number, x: number, y: number): string;
}

export interface RadarSource {
  frames: RadarFrame[];
  /** Index of the latest observed frame; later frames are forecast. */
  nowIdx: number;
  attribution: string;
  minZoom: number;
  maxZoom: number;
}

/** Fail fast so a dead service falls through to the unavailable state. */
const TIMEOUT_MS = 6000;

type FrameList = { time: number; path: string }[];

const LIBREWXR_URL = "https://api.librewxr.net/public/weather-maps.json";
const LIBREWXR_MIN_LAT = -60;
const LIBREWXR_MAX_LAT = 70;

/* ---------- LibreWXR: open data, 60 min nowcast ---------- */

export async function loadRadar(lat: number): Promise<RadarSource | null> {
  if (lat <= LIBREWXR_MIN_LAT || lat >= LIBREWXR_MAX_LAT) return null;
  try {
    const res = await fetch(LIBREWXR_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { host?: string; radar?: { past?: FrameList; nowcast?: FrameList } };
    const byTime = (a: { time: number }, b: { time: number }): number => a.time - b.time;
    const past = (json.radar?.past ?? []).slice().sort(byTime);
    const ahead = (json.radar?.nowcast ?? []).slice().sort(byTime);
    if (!json.host || past.length === 0) return null;
    const host = json.host;
    return {
      frames: [...past, ...ahead].map((f) => ({
        time: f.time,
        url: (z, x, y) => `${host}${f.path}/256/${z}/${x}/${y}/2/1_1.png`,
      })),
      nowIdx: past.length - 1,
      attribution: "Radar by LibreWXR (CC BY 4.0)",
      minZoom: 3,
      maxZoom: 10,
    };
  } catch {
    return null;
  }
}
