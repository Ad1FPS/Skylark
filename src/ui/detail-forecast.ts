import type { Settings, WeatherBundle } from "../types";
import { renderRadar } from "./radar";
import type { DetailContent } from "./detail-common";

export function radarView(b: WeatherBundle, s: Settings): DetailContent {
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(renderRadar(b, s, { large: true }));
  return { title: "Radar", icon: "drop", body };
}
