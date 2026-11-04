import type { Settings, WeatherBundle } from "../types";
import { clock } from "../format";

const WET = 0.1;
const STEP_MIN = 15;
const MAX_STEPS = 32;

function isWet(mm: number): boolean {
  return mm >= WET;
}

function inLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function barColor(mm: number): string {
  if (mm < 0.25) return "#7cc4ff";
  if (mm < 1) return "#4aa3f5";
  return "#2f6fe0";
}

function barHeight(mm: number): number {
  const v = Math.sqrt(Math.min(1, mm / 2));
  return Math.max(3, 56 * v);
}

/** One sentence about the coming hours of rain, shared by the tile and its popover. */
export function nowcastSummary(b: WeatherBundle, s: Settings): string {
  const steps = b.minutely.slice(0, MAX_STEPS);
  const firstWet = steps.findIndex((x) => isWet(x.precipitation));
  const lastWet = (() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (isWet(steps[i].precipitation)) return i;
    }
    return -1;
  })();

  let summary: string;
  if (firstWet === 0) {
    if (lastWet < steps.length - 1) {
      const dry = steps[lastWet + 1];
      summary = `Rain now, ending around ${clock(dry.time, s)}.`;
    } else {
      summary = "Rain for the next 8 hours.";
    }
  } else if (firstWet > 0) {
    const mins = firstWet * STEP_MIN;
    summary = `Rain starting around ${clock(steps[firstWet].time, s)} (in ${inLabel(mins)}).`;
    if (lastWet < steps.length - 1) {
      const dry = steps[lastWet + 1];
      summary += ` Clears around ${clock(dry.time, s)}.`;
    }
  } else {
    summary = "No rain expected in the next 8 hours.";
  }
  return summary;
}

export function renderNowcast(b: WeatherBundle, s: Settings): HTMLElement | null {
  const steps = b.minutely.slice(0, MAX_STEPS);
  if (steps.length === 0) return null;

  const summary = nowcastSummary(b, s);

  const section = document.createElement("section");
  section.className = "nowcast";
  section.dataset.detail = "nowcast";

  const head = document.createElement("div");
  head.className = "nowcast-head";
  head.innerHTML = `
    <span class="nowcast-title">RAIN FORECAST</span>
    <span class="nowcast-range">Next 8 hours</span>
  `;

  const sum = document.createElement("div");
  sum.className = "nowcast-summary";
  sum.textContent = summary;

  const chart = document.createElement("div");
  chart.className = "nowcast-chart";
  for (const step of steps) {
    const bar = document.createElement("div");
    bar.className = "nowcast-bar";
    const wet = isWet(step.precipitation);
    const h = wet ? barHeight(step.precipitation) : 3;
    bar.style.height = `${h.toFixed(1)}px`;
    bar.style.background = wet ? barColor(step.precipitation) : "rgba(255,255,255,.15)";
    bar.title = `${clock(step.time, s)}: ${step.precipitation.toFixed(1)} mm`;
    chart.appendChild(bar);
  }

  const axis = document.createElement("div");
  axis.className = "nowcast-axis";
  for (const idx of [0, 8, 16, 24]) {
    const step = steps[idx];
    if (!step) continue;
    const lbl = document.createElement("span");
    lbl.textContent = idx === 0 ? "Now" : clock(step.time, s);
    axis.appendChild(lbl);
  }

  const legend = document.createElement("div");
  legend.className = "nowcast-legend";
  legend.innerHTML = `
    <span class="nowcast-dot" style="background:#7cc4ff"></span><span>Light</span>
    <span class="nowcast-dot" style="background:#4aa3f5"></span><span>Moderate</span>
    <span class="nowcast-dot" style="background:#2f6fe0"></span><span>Heavy</span>
  `;

  const note = document.createElement("div");
  note.className = "nowcast-note";
  note.textContent = "Point forecast for this location.";

  section.append(head, sum, chart, axis, legend, note);
  return section;
}
