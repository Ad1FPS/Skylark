import type { WeatherBundle } from "./types";
import { CALM_SCENE, type Scene } from "./fx/types";

const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));

/** Minutes since the epoch for a local `YYYY-MM-DDTHH:MM` string (timezone-agnostic, for differences only). */
function minutes(iso: string): number {
  return Date.parse(`${iso.slice(0, 16)}:00Z`) / 60000;
}

/** 1 right at sunrise or sunset, fading to 0 forty-five minutes either side. */
function twilightAt(now: string, sunrise?: string, sunset?: string): number {
  if (!sunrise || !sunset) return 0;
  const t = minutes(now);
  const nearest = Math.min(Math.abs(t - minutes(sunrise)), Math.abs(t - minutes(sunset)));
  return clamp(1 - nearest / 45);
}

interface Sky {
  clouds: number;
  dark: number;
  rain?: number;
  snow?: number;
  fog?: number;
  lightning?: number;
}

/** WMO weather code to sky ingredients. */
function skyFor(code: number): Sky {
  if (code === 0) return { clouds: 0.04, dark: 0 };
  if (code === 1) return { clouds: 0.18, dark: 0 };
  if (code === 2) return { clouds: 0.45, dark: 0.05 };
  if (code === 3) return { clouds: 0.85, dark: 0.3 };
  if (code === 45 || code === 48) return { clouds: 0.5, dark: 0.1, fog: 0.85 };
  if (code >= 51 && code <= 57) return { clouds: 0.8, dark: 0.45, rain: 0.25 };
  if (code === 61 || code === 80) return { clouds: 0.85, dark: 0.55, rain: 0.4 };
  if (code === 63 || code === 81) return { clouds: 0.9, dark: 0.7, rain: 0.65 };
  if (code === 65 || code === 82) return { clouds: 1, dark: 0.85, rain: 0.9 };
  if (code === 66 || code === 67) return { clouds: 0.9, dark: 0.65, rain: 0.5 };
  if (code === 71 || code === 85) return { clouds: 0.8, dark: 0.25, snow: 0.35 };
  if (code === 73) return { clouds: 0.85, dark: 0.3, snow: 0.6 };
  if (code === 75 || code === 86) return { clouds: 0.95, dark: 0.4, snow: 0.9 };
  if (code === 77) return { clouds: 0.8, dark: 0.25, snow: 0.3 };
  if (code >= 95) return { clouds: 1, dark: 0.95, rain: 0.9, lightning: 0.8 };
  return { clouds: 0.5, dark: 0.2 };
}

/** Turn a weather bundle into background layer intensities. */
export function sceneFor(b: WeatherBundle): Scene {
  const c = b.current;
  const sky = skyFor(c.weatherCode);
  const day = b.daily[0];

  // Measured precipitation can push a rain scene up, never turn a dry one wet.
  let rain = sky.rain ?? 0;
  if (rain > 0 && c.precipitation >= 2) rain = Math.max(rain, 0.85);

  const fog = sky.fog ?? 0;
  const open = clamp(1 - sky.clouds * 1.1 - fog * 0.5);

  // Wind blows TOWARD direction + 180; +1 is rightwards, -1 leftwards.
  const windSpeed = clamp(c.windSpeed / 50);
  const wind = Math.sin(((c.windDirection + 180) * Math.PI) / 180) * windSpeed;

  return {
    ...CALM_SCENE,
    daylight: c.isDay ? 1 : 0,
    clouds: sky.clouds,
    cloudDark: sky.dark,
    rain,
    snow: sky.snow ?? 0,
    fog,
    lightning: sky.lightning ?? 0,
    stars: c.isDay ? 0 : open,
    sun: c.isDay ? open : 0,
    twilight: twilightAt(c.time, day?.sunrise, day?.sunset) * (1 - sky.clouds * 0.6),
    wind,
    windSpeed,
  };
}
