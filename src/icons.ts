import type { Kind } from "./theme";

export type IconName =
  | "clear-day"
  | "clear-night"
  | "partly-day"
  | "partly-night"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm"
  | "sun"
  | "moon"
  | "wind"
  | "drop"
  | "eye"
  | "gauge"
  | "thermo"
  | "uv"
  | "sunrise"
  | "sunset"
  | "leaf"
  | "search"
  | "menu"
  | "plus"
  | "close"
  | "refresh"
  | "cog";

const ATTR =
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const SOFT = 'fill="currentColor" fill-opacity=".18"';

const PATHS: Record<IconName, string> = {
  "clear-day": `<circle cx="12" cy="12" r="4" ${SOFT}/><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>`,
  "clear-night": `<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z" ${SOFT}/><path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>`,
  "partly-day": `<circle cx="8" cy="8" r="3" ${SOFT}/><circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.6 3.6l1 1"/><path d="M17 18h-8a3 3 0 0 1 0-6 4 4 0 0 1 7.5 1.2A2.8 2.8 0 0 1 17 18Z" ${SOFT}/><path d="M17 18h-8a3 3 0 0 1 0-6 4 4 0 0 1 7.5 1.2A2.8 2.8 0 0 1 17 18Z"/>`,
  "partly-night": `<path d="M15 8a5 5 0 0 1-6-6 5 5 0 1 0 6 6Z" ${SOFT}/><path d="M15 8a5 5 0 0 1-6-6 5 5 0 1 0 6 6Z"/><path d="M17 18h-8a3 3 0 0 1 0-6 4 4 0 0 1 7.5 1.2A2.8 2.8 0 0 1 17 18Z"/>`,
  cloudy: `<path d="M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 11a3.5 3.5 0 0 0 0 7Z" ${SOFT}/><path d="M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 11a3.5 3.5 0 0 0 0 7Z"/>`,
  fog: `<path d="M6 10h10a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.7 1" ${SOFT}/><path d="M6 10h10a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.7 1"/><path d="M4 14h16M4 18h16"/>`,
  drizzle: `<path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z" ${SOFT}/><path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z"/><path d="M8 16l-1 2M12 16l-1 2M16 16l-1 2"/>`,
  rain: `<path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z" ${SOFT}/><path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z"/><path d="M8 16v3M12 16v3M16 16v3"/>`,
  snow: `<path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z" ${SOFT}/><path d="M7 13h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 7 3 3 0 0 0 7 13Z"/><path d="M8 16v3M12 16v3M16 16v3M7 17l2 1M11 17l2 1M15 17l2 1"/>`,
  storm: `<path d="M7 12h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 6 3 3 0 0 0 7 12Z" ${SOFT}/><path d="M7 12h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 6 3 3 0 0 0 7 12Z"/><path d="M13 14l-3 4h3l-2 4"/>`,
  sun: `<circle cx="12" cy="12" r="4" ${SOFT}/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`,
  moon: `<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z" ${SOFT}/><path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>`,
  wind: `<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>`,
  drop: `<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" ${SOFT}/><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>`,
  eye: `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>`,
  gauge: `<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/>`,
  thermo: `<path d="M12 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0V4Z" transform="translate(-2 0)"/>`,
  uv: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2"/>`,
  sunrise: `<path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 3v5M9 6l3-3 3 3"/>`,
  sunset: `<path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 3v5M9 5l3 3 3-3"/>`,
  leaf: `<path d="M5 19c0-8 6-13 14-13 0 8-6 13-14 13Z" ${SOFT}/><path d="M5 19c0-8 6-13 14-13 0 8-6 13-14 13Z"/><path d="M5 19c3-3 6-6 10-8"/>`,
  search: `<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>`,
  menu: `<path d="M4 6h16M4 12h16M4 18h16"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  refresh: `<path d="M20 11a8 8 0 0 0-14-4l-2 2M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2M20 19v-4h-4"/>`,
  cog: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2"/>`,
};

export function icon(name: IconName, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${ATTR} aria-hidden="true">${PATHS[name]}</svg>`;
}

export function conditionIcon(kind: Kind, isDay: boolean, size = 24): string {
  switch (kind) {
    case "clear":
      return icon(isDay ? "clear-day" : "clear-night", size);
    case "partly":
      return icon(isDay ? "partly-day" : "partly-night", size);
    case "cloudy":
      return icon("cloudy", size);
    case "fog":
      return icon("fog", size);
    case "drizzle":
      return icon("drizzle", size);
    case "rain":
      return icon("rain", size);
    case "snow":
      return icon("snow", size);
    case "storm":
      return icon("storm", size);
  }
}
