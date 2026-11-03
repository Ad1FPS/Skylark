import type { Settings, WeatherBundle } from "../types";
import { describe } from "../theme";
import { hourLabel, temp } from "../format";
import { conditionIcon } from "../icons";

const COL_W = 56;
const GAP = 4;
const SPARK_TOP = 24; // aligns roughly with temperature row inside the column
const SPARK_H = 40;

export function renderHourly(b: WeatherBundle, s: Settings): HTMLElement {
  const hours = b.hourly.slice(0, 24);
  const card = document.createElement("section");
  card.className = "card";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = "HOURLY FORECAST";
  card.appendChild(title);

  const scroll = document.createElement("div");
  scroll.className = "hourly-scroll";

  // Sparkline sized to content width.
  const contentW = hours.length * (COL_W + GAP) - GAP;
  const svg = sparkline(hours.map((h) => h.temperature));

  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    const cond = describe(h.weatherCode, h.isDay);
    const col = document.createElement("div");
    col.className = "hour-col" + (i === 0 ? " is-now" : "");
    const label = i === 0 ? "Now" : hourLabel(h.time, s);
    const rain = (h.precipitationProbability ?? 0) >= 20
      ? `<div class="hour-rain">${h.precipitationProbability}%</div>`
      : `<div class="hour-rain"></div>`;
    col.innerHTML = `
      <div class="hour-label">${label}</div>
      ${conditionIcon(cond.kind, h.isDay, 22)}
      <div class="hour-temp">${temp(h.temperature, s)}&deg;</div>
      ${rain}
    `;
    scroll.appendChild(col);
  }

  // Insert sparkline absolutely positioned behind temps.
  const svgWrap = document.createElement("div");
  svgWrap.className = "hourly-spark";
  svgWrap.style.width = `${contentW}px`;
  svgWrap.style.height = `${SPARK_H}px`;
  svgWrap.innerHTML = svg;
  scroll.insertBefore(svgWrap, scroll.firstChild);

  card.appendChild(scroll);
  return card;
}

function sparkline(values: number[]): string {
  const n = values.length;
  if (n === 0) return "";
  const w = n * (COL_W + GAP) - GAP;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;
  const h = SPARK_H;
  const pts = values.map((v, i) => {
    const x = i * (COL_W + GAP) + COL_W / 2;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }

  const dots = pts
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="rgba(255,255,255,.75)"/>`)
    .join("");

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" aria-hidden="true">
    <path d="${d}" stroke="rgba(255,255,255,.55)" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

/** keeps sparkline vertical position consistent */
export const HOURLY_SPARK_TOP = SPARK_TOP;
