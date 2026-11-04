export type ProviderId = "librewxr" | "rainviewer";

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

export interface RadarProvider {
  id: ProviderId;
  name: string;
  coverage: string;
  covers(lat: number, lon: number): boolean;
  load(): Promise<RadarSource | null>;
}

/** Fail fast so a dead provider falls through to the next one. */
const TIMEOUT_MS = 6000;

type FrameList = { time: number; path: string }[];

/* ---------- LibreWXR: RainViewer-compatible, open data, 60 min nowcast ---------- */

const LIBREWXR_URL = "https://api.librewxr.net/public/weather-maps.json";

const librewxr: RadarProvider = {
  id: "librewxr",
  name: "LibreWXR",
  coverage: "National radar composites, satellite estimate between 60°S and 70°N; past 2 hours and 1 hour ahead",
  covers: (lat) => lat > -60 && lat < 70,
  async load() {
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
  },
};

/* ---------- RainViewer: global, past frames only ---------- */

const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";

const rainviewer: RadarProvider = {
  id: "rainviewer",
  name: "RainViewer",
  coverage: "Worldwide, past 2 hours",
  covers: () => true,
  async load() {
    try {
      const res = await fetch(RAINVIEWER_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const json = (await res.json()) as { host?: string; radar?: { past?: { time: number; path: string }[] } };
      const past = (json.radar?.past ?? []).slice().sort((a, b) => a.time - b.time);
      if (!json.host || past.length === 0) return null;
      const host = json.host;
      return {
        frames: past.map((f) => ({
          time: f.time,
          url: (z, x, y) => `${host}${f.path}/256/${z}/${x}/${y}/2/1_1.png`,
        })),
        nowIdx: past.length - 1,
        attribution: "Radar by RainViewer",
        minZoom: 3,
        maxZoom: 7,
      };
    } catch {
      return null;
    }
  },
};

/** In order of preference; the first that covers the place and answers wins. */
export const PROVIDERS: RadarProvider[] = [librewxr, rainviewer];

/** Load radar for a place from the first provider that covers it and works. */
export async function loadRadar(
  lat: number,
  lon: number,
  pick: ProviderId | "auto" = "auto",
): Promise<{ source: RadarSource; provider: RadarProvider } | null> {
  // A deliberate pick is honoured as is, with no silent fallback.
  const candidates = pick === "auto" ? PROVIDERS.filter((p) => p.covers(lat, lon)) : PROVIDERS.filter((p) => p.id === pick);
  for (const provider of candidates) {
    const source = await provider.load();
    if (source) return { source, provider };
  }
  return null;
}
