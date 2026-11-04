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

/** 0..1: how far the sun has travelled between sunrise and sunset, or the moon between sunset and the next sunrise. */
function bodyProgress(now: string, sunrise?: string, sunset?: string): number {
  if (!sunrise || !sunset) return 0.6;
  const t = minutes(now);
  const rise = minutes(sunrise);
  const set = minutes(sunset);
  if (t >= rise && t <= set) return clamp((t - rise) / (set - rise || 1));
  if (t > set) return clamp((t - set) / (rise + 1440 - set || 1));
  return clamp((t - (set - 1440)) / (rise - (set - 1440) || 1));
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

export interface SceneInput {
  code: number;
  isDay: boolean;
  /** Measured precipitation in mm. */
  precipitation: number;
  /** Wind speed in km/h and the direction it blows FROM in degrees. */
  windKmh: number;
  windFrom: number;
  /** Dawn/dusk strength 0..1 before cloud dimming. */
  twilight: number;
  /** Sun or moon progress across the sky, 0..1 (see bodyProgress). Defaults to a high-right position. */
  bodyT?: number;
}

/** Turn raw conditions into background layer intensities. */
export function sceneForCode(i: SceneInput): Scene {
  const sky = skyFor(i.code);

  // Measured precipitation can push a rain scene up, never turn a dry one wet.
  let rain = sky.rain ?? 0;
  if (rain > 0 && i.precipitation >= 2) rain = Math.max(rain, 0.85);

  const fog = sky.fog ?? 0;
  const open = clamp(1 - sky.clouds * 1.1 - fog * 0.5);

  // Wind blows TOWARD direction + 180; +1 is rightwards, -1 leftwards.
  const windSpeed = clamp(i.windKmh / 50);
  const wind = Math.sin(((i.windFrom + 180) * Math.PI) / 180) * windSpeed;

  return {
    ...CALM_SCENE,
    daylight: i.isDay ? 1 : 0,
    clouds: sky.clouds,
    cloudDark: sky.dark,
    rain,
    snow: sky.snow ?? 0,
    fog,
    lightning: sky.lightning ?? 0,
    stars: i.isDay ? 0 : clamp(1 - sky.clouds * 0.9 - fog * 0.5),
    sun: i.isDay ? open : 0,
    twilight: clamp(i.twilight) * (1 - sky.clouds * 0.6),
    wind,
    windSpeed,
    // The sun or moon rides an arc: low at the left horizon, highest at mid-journey, low at the right.
    bodyX: 0.1 + 0.8 * (i.bodyT ?? 0.62),
    bodyY: 0.46 - 0.34 * Math.sin(Math.PI * (i.bodyT ?? 0.62)),
  };
}

export function sceneFor(b: WeatherBundle): Scene {
  const c = b.current;
  const day = b.daily[0];
  return sceneForCode({
    code: c.weatherCode,
    isDay: c.isDay,
    precipitation: c.precipitation,
    windKmh: c.windSpeed,
    windFrom: c.windDirection,
    twilight: twilightAt(c.time, day?.sunrise, day?.sunset),
    bodyT: bodyProgress(c.time, day?.sunrise, day?.sunset),
  });
}
