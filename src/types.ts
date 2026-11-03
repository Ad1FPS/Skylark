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
}

export interface Air {
  usAqi: number;
  pm25: number;
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
  hourly: Hour[];
  daily: Day[];
  air: Air | null;
}

export interface Settings {
  temp: "c" | "f";
  wind: "kmh" | "mph" | "ms";
  clock: "12" | "24";
}
