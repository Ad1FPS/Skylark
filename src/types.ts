// Mirrors src-tauri/src/weather.rs (camelCase over IPC). Metric units: C, km/h, m, hPa, mm.

export interface Location {
  name: string;
  country: string;
  admin1: string | null;
  latitude: number;
  longitude: number;
}

export interface Current {
  time: string;
  temperature: number;
  apparent: number;
  humidity: number;
  isDay: boolean;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  visibility: number;
  uvIndex: number;
  precipitation: number;
}

export interface Hour {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitationProbability: number | null;
  isDay: boolean;
}

export interface Day {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbabilityMax: number | null;
  precipitationSum: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
  windSpeedMax: number;
  windGustsMax: number;
  apparentMax: number;
  apparentMin: number;
  daylightSeconds: number;
  sunshineSeconds: number;
  precipitationHours: number;
}

/** Parallel arrays, 48 hourly steps from 00:00 of the location's current day. */
export interface Detail {
  time: string[];
  temperature: number[];
  apparent: number[];
  humidity: number[];
  dewPoint: number[];
  precipitation: number[];
  precipitationProbability: number[];
  cloudCover: number[];
  windSpeed: number[];
  windGusts: number[];
  windDirection: number[];
  pressure: number[];
  visibility: number[];
  uvIndex: number[];
}

/** Parallel arrays, 240 hourly steps from 00:00 of the current local day (24 per day). */
export interface Week {
  time: string[];
  temperature: number[];
  apparent: number[];
  precipitationProbability: number[];
  weatherCode: number[];
  isDay: boolean[];
}

export interface AirHourly {
  time: string[];
  usAqi: number[];
  pm25: number[];
  pm10: number[];
  ozone: number[];
  no2: number[];
  so2: number[];
  co: number[];
}

export interface Air {
  usAqi: number;
  pm25: number;
  pm10: number;
  ozone: number;
  no2: number;
  so2: number;
  co: number;
  hourly: AirHourly;
}

/** One 15-minute step of the point precipitation forecast (mm in that step). */
export interface Minute {
  time: string;
  precipitation: number;
}

export interface WeatherBundle {
  location: Location;
  fetchedAt: number;
  stale: boolean;
  timezone: string;
  utcOffsetSeconds: number;
  current: Current;
  minutely: Minute[];
  /** Empty for bundles cached before this field existed. */
  detail: Detail;
  /** Empty for bundles cached before this field existed. */
  week: Week;
  hourly: Hour[];
  daily: Day[];
  air: Air | null;
}

export interface Settings {
  temp: "c" | "f";
  wind: "kmh" | "mph" | "ms";
  clock: "12" | "24";
  /** Background animation frame rate cap. */
  fps: "30" | "60";
  /** Radar source: "auto" tries each provider in order. */
  radar: "auto" | "librewxr" | "rainviewer";
  /** Condition icons: line drawings or coloured artwork. */
  icons: "mono" | "color";
  /** "on": closing the window hides it (instant reopen, about 110 MB stays in use) instead of freeing the webview. */
  keepAlive: "off" | "on";
  /** "on": a system notification for new moderate-or-worse official alerts at the current location. */
  alertNotifications: "off" | "on";
}
