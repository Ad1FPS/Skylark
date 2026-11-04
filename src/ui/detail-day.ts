import type { Settings, WeatherBundle } from "../types";
import { esc, temp, tempDeg } from "../format";
import { conditionIcon } from "../icons";
import { describe } from "../theme";
import { noDetailNote } from "./detail-common";
import type { DetailContent } from "./detail-common";
import { renderChart } from "./chart";

const ACCENT = "#7fd8e6";
const DAYS = 10;
const RIGHT_GUTTER = 46; // matches the chart's right-axis gutter for x padding
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

interface UtcParts {
  y: number;
  m: number;
  d: number;
}

function utcParts(isoDate: string): UtcParts {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  return { y, m: m || 1, d: d || 1 };
}

function weekdayInitial(isoDate: string): string {
  const { y, m, d } = utcParts(isoDate);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_INITIALS[(wd + 7) % 7];
}

function longDate(isoDate: string): string {
  const { y, m, d } = utcParts(isoDate);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function toDisplay(c: number, s: Settings): number {
  return Number(temp(c, s));
}

function slice(arr: number[], i: number): number[] {
  return arr.slice(i * 24, i * 24 + 24);
}

export function dayView(b: WeatherBundle, s: Settings, dayIndex = 0): DetailContent {
  const days = b.daily.slice(0, DAYS);
  const maxDay = Math.max(days.length - 1, 0);
  let selected = Math.min(Math.max(dayIndex, 0), maxDay);
  let mode: "actual" | "feels" = "actual";

  const body = document.createElement("div");
  body.className = "dt day";

  const strip = document.createElement("div");
  strip.className = "day-strip";

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-chip";
    btn.dataset.day = String(i);
    btn.innerHTML = `
      <span class="day-chip-wd">${esc(weekdayInitial(d.date))}</span>
      <span class="day-chip-num">${esc(String(utcParts(d.date).d))}</span>
    `;
    strip.appendChild(btn);
  }
  const chips = Array.from(strip.querySelectorAll<HTMLButtonElement>(".day-chip"));

  const navRow = document.createElement("div");
  navRow.className = "day-nav";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "day-nav-btn";
  prev.setAttribute("aria-label", "Previous day");
  prev.innerHTML = chevron(-1);
  const dateLabel = document.createElement("div");
  dateLabel.className = "day-nav-date";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "day-nav-btn";
  next.setAttribute("aria-label", "Next day");
  next.innerHTML = chevron(1);
  navRow.append(prev, dateLabel, next);

  body.append(strip, navRow);

  const headlineEl = document.createElement("div");
  headlineEl.className = "day-headline";
  body.appendChild(headlineEl);

  // Remaining content re-rendered on day / mode change.
  const content = document.createElement("div");
  content.className = "day-content";
  body.appendChild(content);

  const paint = (): void => {
    for (const chip of chips) {
      const i = Number(chip.dataset.day);
      chip.classList.toggle("is-active", i === selected);
      chip.classList.toggle("is-today", i === 0 && i !== selected);
    }
    const d = days[selected];
    dateLabel.textContent = d ? longDate(d.date) : "";
    prev.disabled = selected <= 0;
    next.disabled = selected >= maxDay;

    renderHeadline(headlineEl, b, s, selected);
    renderContent(content, b, s, selected, mode);
  };

  const select = (i: number): void => {
    if (i < 0 || i > maxDay || i === selected) return;
    selected = i;
    paint();
    window.dispatchEvent(new Event("resize"));
  };

  strip.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>(".day-chip");
    if (btn) select(Number(btn.dataset.day));
  });
  prev.addEventListener("click", () => select(selected - 1));
  next.addEventListener("click", () => select(selected + 1));

  content.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>(".day-seg-btn");
    if (!btn) return;
    const m = btn.dataset.mode;
    if (m !== "actual" && m !== "feels") return;
    if (m === mode) return;
    mode = m;
    renderContent(content, b, s, selected, mode);
    window.dispatchEvent(new Event("resize"));
  });

  paint();
  return { title: "Conditions", icon: "cloudy", body };
}

function chevron(dir: -1 | 1): string {
  const d = dir < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6";
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

function unitCaption(s: Settings): string {
  return s.temp === "f" ? "Fahrenheit (°F)" : "Celsius (°C)";
}

function renderHeadline(el: HTMLElement, b: WeatherBundle, s: Settings, i: number): void {
  const d = b.daily[i];
  if (!d) {
    el.innerHTML = "";
    return;
  }
  if (i === 0) {
    const isDay = b.current.isDay;
    const cond = describe(b.current.weatherCode, isDay);
    el.innerHTML = `
      <div class="day-now">
        ${conditionIcon(cond.kind, isDay, 40)}
        <div class="day-now-temp">${esc(tempDeg(b.current.temperature, s))}</div>
      </div>
      <div class="day-hl">H:${esc(temp(d.tempMax, s))}&deg; L:${esc(temp(d.tempMin, s))}&deg;</div>
      <div class="day-caption">${esc(cond.label)}</div>
    `;
    return;
  }
  const cond = describe(d.weatherCode, true);
  el.innerHTML = `
    <div class="day-now">
      ${conditionIcon(cond.kind, true, 40)}
      <div class="day-now-temp">${esc(temp(d.tempMax, s))}&deg;</div>
      <div class="day-now-low">${esc(temp(d.tempMin, s))}&deg;</div>
    </div>
    <div class="day-caption">${esc(cond.label)} · ${esc(unitCaption(s))}</div>
  `;
}

function renderContent(root: HTMLElement, b: WeatherBundle, s: Settings, i: number, mode: "actual" | "feels"): void {
  const d = b.daily[i];
  root.innerHTML = "";
  if (!d) return;

  if (b.week.time.length === 0) {
    root.appendChild(noDetailNote());
    return;
  }

  const hours: string[] = [];
  for (let h = 0; h < 24; h++) {
    const t = b.week.time[i * 24 + h];
    hours.push(t ?? `${d.date}T${String(h).padStart(2, "0")}:00`);
  }

  // Icon strip: one per 2 hours.
  const iconStrip = document.createElement("div");
  iconStrip.className = "day-icons";
  iconStrip.style.paddingRight = `${RIGHT_GUTTER}px`;
  for (let h = 0; h < 24; h += 2) {
    const idx = i * 24 + h;
    const code = b.week.weatherCode[idx] ?? d.weatherCode;
    const isDay = b.week.isDay[idx] ?? true;
    const cond = describe(code, isDay);
    const cell = document.createElement("span");
    cell.className = "day-icon";
    cell.innerHTML = conditionIcon(cond.kind, isDay, 18);
    iconStrip.appendChild(cell);
  }
  root.appendChild(iconStrip);

  // Temperature chart.
  const actual = slice(b.week.temperature, i).map((v) => toDisplay(v, s));
  const feels = slice(b.week.apparent, i).map((v) => toDisplay(v, s));
  const values = mode === "actual" ? actual : feels;
  const lo = Math.floor(Math.min(...values) - 3);
  const hi = Math.ceil(Math.max(...values) + 3);
  const nowHour = i === 0 ? Number(b.current.time.slice(11, 13)) : -1;

  root.appendChild(
    renderChart({
      times: hours,
      series: [{ values, color: "#6fe0f0", kind: "area", label: mode === "actual" ? "Temperature" : "Feels like" }],
      nowIndex: Number.isFinite(nowHour) ? nowHour : -1,
      min: lo,
      max: hi,
      yAxis: "right",
      extrema: true,
      height: 150,
      format: (v) => `${Math.round(v)}°`,
    })
  );

  // Segmented control.
  const seg = document.createElement("div");
  seg.className = "day-seg";
  seg.innerHTML = `
    <button type="button" class="day-seg-btn${mode === "actual" ? " is-active" : ""}" data-mode="actual">Actual</button>
    <button type="button" class="day-seg-btn${mode === "feels" ? " is-active" : ""}" data-mode="feels">Feels Like</button>
  `;
  root.appendChild(seg);

  const cap = document.createElement("div");
  cap.className = "day-caption";
  cap.textContent = mode === "actual" ? "The actual temperature." : "How the temperature feels, including wind and humidity.";
  root.appendChild(cap);

  // Chance of precipitation.
  const rain = slice(b.week.precipitationProbability, i);
  const chance = rain.length ? Math.max(...rain) : 0;
  const head = document.createElement("div");
  head.className = "day-sub";
  head.textContent = "Chance of Precipitation";
  root.appendChild(head);

  const line = document.createElement("div");
  line.className = "day-rain";
  const label = i === 0 ? "Today’s" : `${weekdayLong(b.daily[i].date)}’s`;
  line.textContent = `${label} chance: ${Math.round(chance)} %`;
  root.appendChild(line);

  root.appendChild(
    renderChart({
      times: hours,
      series: [{ values: rain, color: "#7cc4ff", kind: "bars", label: "Precipitation" }],
      nowIndex: -1,
      min: 0,
      max: 100,
      yAxis: "right",
      height: 110,
      format: (v) => `${Math.round(v)} %`,
    })
  );
}

function weekdayLong(isoDate: string): string {
  const { y, m, d } = utcParts(isoDate);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export { ACCENT };
