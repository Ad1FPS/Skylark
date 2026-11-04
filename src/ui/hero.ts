import type { Settings, WeatherBundle } from "../types";
import { describe, skyGradient } from "../theme";
import { clock, esc, temp, tempDeg } from "../format";
import { conditionIcon } from "../icons";

export function renderHero(b: WeatherBundle, s: Settings): HTMLElement {
  const c = b.current;
  const cond = describe(c.weatherCode, c.isDay);
  const today = b.daily[0];

  const location = esc(b.location.name);
  const sub = [b.location.admin1, b.location.country].filter(Boolean).map((x) => esc(x as string)).join(", ");

  let summary = `Feels like ${tempDeg(c.apparent, s)}.`;
  const wetIdx = b.minutely.slice(0, 9).findIndex((m) => m.precipitation >= 0.1);
  if (wetIdx === 0) {
    summary += " Raining now.";
  } else if (wetIdx > 0) {
    summary += ` Rain in ${wetIdx * 15} min.`;
  } else {
    const wetHour = b.hourly.find((h) => (h.precipitationProbability ?? 0) >= 40);
    if (wetHour) summary += ` Rain likely around ${clock(wetHour.time, s)}.`;
  }

  const stale = b.stale
    ? `<div class="pill">Offline, showing saved data</div>`
    : "";

  const hl = today
    ? `H ${temp(today.tempMax, s)}&deg;&nbsp;&nbsp;L ${temp(today.tempMin, s)}&deg;`
    : "";

  const wrap = document.createElement("section");
  wrap.className = "hero";
  wrap.dataset.sky = skyGradient(cond.kind, c.isDay);
  wrap.innerHTML = `
    <div class="hero-city">${location}</div>
    ${sub ? `<div class="hero-meta">${sub}</div>` : ""}
    <div class="hero-temp">${temp(c.temperature, s)}<sup>&deg;</sup></div>
    <div class="hero-cond">${conditionIcon(cond.kind, c.isDay, 30)} ${esc(cond.label)}</div>
    <div class="hero-hl">${hl}</div>
    <div class="hero-summary">${esc(summary)}</div>
    ${stale}
  `;
  return wrap;
}
