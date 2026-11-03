import type { Settings, WeatherBundle } from "../types";
import { describe, skyGradient } from "../theme";
import { clock, esc, hourLabel, temp, tempDeg } from "../format";
import { conditionIcon } from "../icons";

export function renderHero(b: WeatherBundle, s: Settings): HTMLElement {
  const c = b.current;
  const cond = describe(c.weatherCode, c.isDay);
  const today = b.daily[0];

  const location = esc(b.location.name);
  const sub = [b.location.admin1, b.location.country].filter(Boolean).map((x) => esc(x as string)).join(", ");

  let summary = `Feels like ${tempDeg(c.apparent, s)}.`;
  const wetHour = b.hourly.find((h) => (h.precipitationProbability ?? 0) >= 40);
  if (wetHour) summary += ` Rain likely around ${hourLabel(wetHour.time, s)}.`;

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
    <div class="hero-city">${location}${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="hero-temp">${temp(c.temperature, s)}<sup>&deg;</sup></div>
    <div class="hero-cond">${conditionIcon(cond.kind, c.isDay, 20)} ${esc(cond.label)}</div>
    <div class="hero-hl">${hl}</div>
    <div class="hero-summary">${esc(summary)}</div>
    ${stale}
  `;
  // ensure the icon doesn't break the flow (keep it inline)
  const condEl = wrap.querySelector(".hero-cond");
  if (condEl) condEl.innerHTML = condEl.innerHTML;
  return wrap;
}

/** Exposed for potential callers that need the local time string. */
export function localClock(iso: string, s: Settings): string {
  return clock(iso, s);
}
