export type Kind =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export interface Condition {
  label: string;
  kind: Kind;
}

/** WMO weather code to label and visual kind. */
export function describe(code: number, isDay = true): Condition {
  if (code === 0) return { label: isDay ? "Clear" : "Clear night", kind: "clear" };
  if (code === 1) return { label: isDay ? "Mostly clear" : "Mostly clear", kind: "clear" };
  if (code === 2) return { label: "Partly cloudy", kind: "partly" };
  if (code === 3) return { label: "Overcast", kind: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", kind: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", kind: "drizzle" };
  if (code === 61 || code === 80) return { label: "Light rain", kind: "rain" };
  if (code === 63 || code === 81) return { label: "Rain", kind: "rain" };
  if (code === 65 || code === 82) return { label: "Heavy rain", kind: "rain" };
  if (code === 66 || code === 67) return { label: "Freezing rain", kind: "rain" };
  if (code === 71 || code === 85) return { label: "Light snow", kind: "snow" };
  if (code === 73) return { label: "Snow", kind: "snow" };
  if (code === 75 || code === 86) return { label: "Heavy snow", kind: "snow" };
  if (code === 77) return { label: "Snow grains", kind: "snow" };
  if (code >= 95) return { label: "Thunderstorm", kind: "storm" };
  return { label: "Unknown", kind: "cloudy" };
}

type Sky = [top: string, mid: string, bottom: string];

const SKY: Record<string, Sky> = {
  "clear-day": ["#2f7fd8", "#5aa7ea", "#9cccf2"],
  "clear-night": ["#0b1230", "#16224f", "#2b3a78"],
  "partly-day": ["#3d7cc0", "#6c9fcf", "#a6c2dc"],
  "partly-night": ["#10183a", "#1d2a56", "#34437a"],
  "cloudy-day": ["#56677c", "#7d8ea1", "#a3b1c0"],
  "cloudy-night": ["#1a202c", "#272f3f", "#3a4458"],
  "fog-day": ["#6b7885", "#8693a0", "#a2adb8"],
  "fog-night": ["#1f252d", "#2e3640", "#444e5a"],
  "rain-day": ["#3b4a5e", "#566a80", "#7a8da0"],
  "rain-night": ["#12171f", "#1d2531", "#2c3746"],
  "snow-day": ["#6f8aa6", "#8fa8bf", "#b3c5d6"],
  "snow-night": ["#2b3648", "#44546b", "#6b7d94"],
  "storm-day": ["#2e3446", "#454d63", "#5f6a82"],
  "storm-night": ["#0d0f1a", "#181b2e", "#2a2f4a"],
};

/** Drizzle shares the rain sky. */
export function skyGradient(kind: Kind, isDay: boolean): string {
  const key = `${kind === "drizzle" ? "rain" : kind}-${isDay ? "day" : "night"}`;
  const [top, mid, bottom] = SKY[key];
  return `linear-gradient(180deg, ${top} 0%, ${mid} 55%, ${bottom} 100%)`;
}
