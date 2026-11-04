import type { Settings, WeatherBundle } from "../types";
import { renderChart } from "./chart";
import type { DetailContent } from "./detail-common";
import { section, sentence } from "./detail-common";
import { nowcastSummary } from "./nowcast";

/** Intensity bands in mm per hour: light, moderate, heavy. */
export const RAIN_BANDS = [
  { from: 0, to: 2.5, color: "#7cc4ff" },
  { from: 2.5, to: 7.6, color: "#4aa3f5" },
  { from: 7.6, to: 50, color: "#2f6fe0" },
];

export function nowcastView(b: WeatherBundle, s: Settings): DetailContent | null {
  const steps = b.minutely.slice(0, 32);
  if (steps.length === 0) return null;
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(sentence(nowcastSummary(b, s)));
  body.appendChild(
    section(
      "Precipitation intensity",
      renderChart({
        times: steps.map((x) => x.time),
        nowIndex: 0,
        // The feed gives millimetres per 15 minutes; the bands are per hour.
        series: [{ values: steps.map((x) => x.precipitation * 4), color: "#4aa3f5", kind: "bars", label: "Rain (mm/h)" }],
        min: 0,
        max: 10,
        height: 150,
        xStep: 4,
        bands: RAIN_BANDS,
        format: (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v))),
      })
    )
  );
  const about = document.createElement("p");
  about.className = "dt-sentence";
  about.textContent =
    "Intensity is calculated from how much rain or snow falls per hour. Light is under 2.5 mm per hour, moderate up to 7.6 mm and heavy above that. A downpour can be heavy for a short time, while steady drizzle may stay light for hours.";
  body.appendChild(section("About precipitation intensity", about));
  return { title: "Rain Forecast", icon: "drop", body };
}
