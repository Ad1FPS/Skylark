export type ProviderId = "rainviewer";

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

/* ---------- RainViewer: global, past frames only ---------- */

const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";

const rainviewer: RadarProvider = {
  id: "rainviewer",
  name: "RainViewer",
  coverage: "Worldwide, past 2 hours",
  covers: () => true,
  async load() {
    try {
      const res = await fetch(RAINVIEWER_URL);
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

export const PROVIDERS: RadarProvider[] = [rainviewer];

/** Load radar for a place from the first provider that covers it and works. */
export async function loadRadar(
  lat: number,
  lon: number,
): Promise<{ source: RadarSource; provider: RadarProvider } | null> {
  for (const provider of PROVIDERS.filter((p) => p.covers(lat, lon))) {
    const source = await provider.load();
    if (source) return { source, provider };
  }
  return null;
}
