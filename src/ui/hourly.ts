import type { Settings, WeatherBundle } from "../types";
import { describe } from "../theme";
import { clock, hourLabel, temp, wind } from "../format";
import { conditionIcon, icon } from "../icons";

const COL_W = 56;
const GAP = 4;
const SPARK_H = 40;

type Mode = "conditions" | "precip" | "wind";

/** Kept across re-renders (unit changes rebuild the card). */
let mode: Mode = "conditions";

const MODES: { id: Mode; label: string; icon: "cloudy" | "drop" | "wind" }[] = [
  { id: "conditions", label: "Conditions", icon: "cloudy" },
  { id: "precip", label: "Chance of precipitation", icon: "drop" },
  { id: "wind", label: "Wind", icon: "wind" },
];

type Item =
  | { kind: "hour"; index: number }
  | { kind: "sun"; time: string; rising: boolean };

/** Hours in order, with sunrise and sunset dropped in where they happen. */
function buildItems(b: WeatherBundle, count: number): Item[] {
  const hours = b.hourly.slice(0, count);
  const events: { time: string; rising: boolean }[] = [];
  for (const d of b.daily.slice(0, 3)) {
    events.push({ time: d.sunrise, rising: true }, { time: d.sunset, rising: false });
  }
  const items: Item[] = [];
  for (let i = 0; i < hours.length; i++) {
    items.push({ kind: "hour", index: i });
    const next = hours[i + 1];
    if (!next) break;
    for (const e of events) {
      if (e.time > hours[i].time && e.time < next.time) items.push({ kind: "sun", ...e });
    }
  }
  return items;
}

export function renderHourly(b: WeatherBundle, s: Settings): HTMLElement {
  const hours = b.hourly.slice(0, 24);
  const items = buildItems(b, 24);
  const card = document.createElement("section");
  card.className = "card";
  card.dataset.detail = "day";
  card.dataset.day = "0";

  const head = document.createElement("div");
  head.className = "hourly-head";
  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = "HOURLY FORECAST";
  const modes = document.createElement("div");
  modes.className = "hourly-modes";
  for (const m of MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `hourly-mode${m.id === mode ? " active" : ""}`;
    btn.setAttribute("aria-label", m.label);
    btn.setAttribute("aria-pressed", String(m.id === mode));
    btn.innerHTML = icon(m.icon, 14);
    btn.addEventListener("click", (e) => {
      // The card itself opens the day popover; the mode buttons must not.
      e.stopPropagation();
      if (m.id === mode) return;
      mode = m.id;
      const keep = card.querySelector<HTMLElement>(".hourly-scroll")?.scrollLeft ?? 0;
      const fresh = renderHourly(b, s);
      card.replaceWith(fresh);
      const sc = fresh.querySelector<HTMLElement>(".hourly-scroll");
      if (sc) sc.scrollLeft = keep;
    });
    modes.appendChild(btn);
  }
  head.append(title, modes);
  card.appendChild(head);

  const scroll = document.createElement("div");
  scroll.className = "hourly-scroll";

  const cols: HTMLElement[] = [];
  /** Temperature per column; sun events have none, so the line passes over them. */
  const temps: (number | null)[] = [];

  for (const item of items) {
    const col = document.createElement("div");
    if (item.kind === "hour") {
      const h = hours[item.index];
      const cond = describe(h.weatherCode, h.isDay);
      col.className = "hour-col" + (item.index === 0 ? " is-now" : "");
      const label = item.index === 0 ? "Now" : hourLabel(h.time, s);
      const rain = (h.precipitationProbability ?? 0) >= 20
        ? `<div class="hour-rain">${h.precipitationProbability}%</div>`
        : `<div class="hour-rain"></div>`;
      if (mode === "conditions") {
        col.innerHTML = `
        <div class="hour-label">${label}</div>
        ${conditionIcon(cond.kind, h.isDay, 28)}
        <div class="hour-temp">${temp(h.temperature, s)}&deg;</div>
        ${rain}
      `;
      } else if (mode === "precip") {
        const p = h.precipitationProbability ?? 0;
        col.innerHTML = `
        <div class="hour-label">${label}</div>
        <span class="hour-drop" style="opacity:${(0.35 + 0.65 * (p / 100)).toFixed(2)}">${icon("drop", 24)}</span>
        <div class="hour-temp hour-metric">${p}<small>%</small></div>
        <div class="hour-rain"></div>
      `;
      } else {
        const at = b.detail.time.indexOf(h.time);
        const w = at >= 0 ? wind(b.detail.windSpeed[at], s) : null;
        const dir = at >= 0 ? b.detail.windDirection[at] : 0;
        col.innerHTML = `
        <div class="hour-label">${label}</div>
        <svg class="hour-arrow" viewBox="0 0 12 12" width="22" height="22" aria-hidden="true" style="transform:rotate(${dir + 180}deg)"><path d="M6 1 L9 10 L6 7.5 L3 10 Z" fill="rgba(255,255,255,.85)"/></svg>
        <div class="hour-temp hour-metric">${w ? w.value : "&ndash;"}<small>${w ? w.unit : ""}</small></div>
        <div class="hour-rain"></div>
      `;
      }
      temps.push(h.temperature);
    } else {
      col.className = "hour-col is-sun";
      col.innerHTML = `
        <div class="hour-label">${clock(item.time, s)}</div>
        ${icon(item.rising ? "sunrise" : "sunset", 28)}
        <div class="hour-temp hour-sun-name">${item.rising ? "Sunrise" : "Sunset"}</div>
        <div class="hour-rain"></div>
      `;
      temps.push(null);
    }
    scroll.appendChild(col);
    cols.push(col);
  }

  // Sparkline absolutely positioned behind the temperatures.
  const svgWrap = document.createElement("div");
  svgWrap.className = "hourly-spark";
  svgWrap.style.height = `${SPARK_H}px`;
  if (mode !== "conditions") svgWrap.style.display = "none";
  scroll.insertBefore(svgWrap, scroll.firstChild);

  // Columns stretch to fill a wide card and keep their minimum width (then scroll) in a narrow one.
  let colW = 0;
  const layout = (): void => {
    const avail = scroll.clientWidth;
    const next = Math.max(COL_W, Math.floor((avail + GAP) / items.length - GAP));
    if (next === colW) return;
    colW = next;
    for (const c of cols) {
      c.style.width = `${colW}px`;
      c.style.minWidth = `${colW}px`;
    }
    svgWrap.style.width = `${items.length * (colW + GAP) - GAP}px`;
    svgWrap.innerHTML = sparkline(temps, colW);
  };
  layout();
  new ResizeObserver(layout).observe(scroll);

  card.appendChild(scroll);
  return card;
}

function sparkline(values: (number | null)[], colW: number): string {
  const n = values.length;
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return "";
  const w = n * (colW + GAP) - GAP;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const pad = 6;
  const h = SPARK_H;
  const pts: (readonly [number, number])[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const x = i * (colW + GAP) + colW / 2;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    pts.push([x, y] as const);
  });

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
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
