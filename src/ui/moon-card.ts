import type { Settings, WeatherBundle } from "../types";
import { esc } from "../format";
import { icon } from "../icons";
import { statGrid, type DetailContent } from "./detail-common";
import { moonInfo, type MoonInfo } from "../astro/moon";

/** Combine the local ISO date fields of `b.current.time` with the bundle offset to get a UTC instant. */
function currentInstant(b: WeatherBundle): Date {
  const iso = b.current.time;
  const y = parseInt(iso.slice(0, 4), 10) || 1970;
  const mo = (parseInt(iso.slice(5, 7), 10) || 1) - 1;
  const d = parseInt(iso.slice(8, 10), 10) || 1;
  const h = parseInt(iso.slice(11, 13), 10) || 0;
  const mi = parseInt(iso.slice(14, 16), 10) || 0;
  return new Date(Date.UTC(y, mo, d, h, mi) - b.utcOffsetSeconds * 1000);
}

function localClock(d: Date, offsetSeconds: number, s: Settings): string {
  const local = new Date(d.getTime() + offsetSeconds * 1000);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  if (s.clock === "12") {
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function daysUntil(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

/** Pick the next moon event (set before rise) relative to `now`. */
function nextEvent(info: MoonInfo, now: Date): { label: string; at: Date } | null {
  const set = info.moonset && info.moonset.getTime() >= now.getTime() ? info.moonset : null;
  const rise = info.moonrise;
  if (set && (!rise || set.getTime() <= rise.getTime())) return { label: "Moonset", at: set };
  if (rise && rise.getTime() >= now.getTime()) return { label: "Moonrise", at: rise };
  if (rise) return { label: "Moonrise", at: rise };
  if (info.moonset) return { label: "Moonset", at: info.moonset };
  return null;
}

/** Inline SVG moon disc; lit side on the right when waxing, left when waning. */
export function moonSvg(info: MoonInfo, size: number): string {
  const r = size / 2 - 2;
  const c = size / 2;
  const lit = Math.max(0, Math.min(1, info.illumination));
  // Terminator x-radius: full when half-lit, zero at new/full.
  const rx = Math.abs(1 - 2 * lit) * r;
  const gid = `mg${Math.round(size)}${Math.round(lit * 100)}${info.waxing ? "w" : "d"}`;
  // Which half is dark: waxing lights the right half (dark on left), waning lights the left (dark on right).
  const litRight = info.waxing;
  // The dark side background is fully dark; the lit side is revealed by the terminator ellipse.
  // We draw a dark overlay covering the unlit portion:
  //  - if lit < 0.5 the terminator bulges into the lit half (dark is majority)
  //  - if lit > 0.5 the terminator bulges into the dark half (lit is majority)
  const darkArcX = litRight ? c - r : c + r;
  const termX = litRight ? c + rx : c - rx;
  const bulge = lit > 0.5;
  const rxNow = rx;
  // Overlay path: half of the disc on the dark side plus a terminator semicircle.
  // sweep flag: choose so it wraps the dark side.
  const half = litRight ? 0 : 1; // sweep direction for the dark half ellipse
  const term = bulge ? (litRight ? 1 : 1) : litRight ? 0 : 0;
  // Build using cubic approximation of ellipse halves via arcs.
  const darkPath = litRight
    ? `M${c} ${c - r} A ${r} ${r} 0 0 0 ${c} ${c + r} A ${rxNow} ${r} 0 0 ${bulge ? 1 : 0} ${c} ${c - r} Z`
    : `M${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} A ${rxNow} ${r} 0 0 ${bulge ? 0 : 1} ${c} ${c - r} Z`;
  void half;
  void term;
  void darkArcX;
  void termX;

  const maria = [
    { cx: c - r * 0.28, cy: c - r * 0.22, rr: r * 0.26 },
    { cx: c + r * 0.18, cy: c + r * 0.28, rr: r * 0.2 },
    { cx: c + r * 0.32, cy: c - r * 0.3, rr: r * 0.16 },
  ]
    .map((m) => `<circle cx="${m.cx.toFixed(1)}" cy="${m.cy.toFixed(1)}" r="${m.rr.toFixed(1)}" fill="rgba(120,120,140,.22)"/>`)
    .join("");

  return `<svg class="moon-disc" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <radialGradient id="${gid}" cx="38%" cy="34%" r="70%">
        <stop offset="0%" stop-color="#f4f1e6"/>
        <stop offset="100%" stop-color="#c9ccd8"/>
      </radialGradient>
      <clipPath id="${gid}c"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>
    </defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${gid})"/>
    <g clip-path="url(#${gid}c)">${maria}</g>
    <path d="${darkPath}" fill="rgba(10,16,30,.82)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
  </svg>`;
}

export function renderMoonCard(b: WeatherBundle, s: Settings): HTMLElement {
  const at = currentInstant(b);
  const info = moonInfo(at, b.location.latitude, b.location.longitude, b.utcOffsetSeconds);

  const card = document.createElement("section");
  card.className = "card info moon-card";
  card.dataset.detail = "moon";
  const h = document.createElement("h2");
  h.className = "card-title";
  h.innerHTML = `${icon("moon", 13)}<span>${esc(info.name.toUpperCase())}</span>`;
  card.appendChild(h);

  const body = document.createElement("div");
  body.className = "moon-body";

  const next = nextEvent(info, at);
  const nextLabel = next ? next.label : "Moonrise";
  const nextValue = next ? localClock(next.at, b.utcOffsetSeconds, s) : "--";

  const fullDays = daysUntil(at, info.nextFullMoon);

  const list = document.createElement("div");
  list.className = "moon-rows";
  const rows = [
    ["Illumination", `${Math.round(info.illumination * 100)} %`],
    [nextLabel, nextValue],
    ["Full Moon", `${fullDays} ${fullDays === 1 ? "DAY" : "DAYS"}`],
  ];
  list.innerHTML = rows
    .map(
      ([label, value]) =>
        `<div class="moon-row"><span class="moon-label">${esc(label)}</span><span class="moon-value">${esc(value)}</span></div>`,
    )
    .join("");
  body.appendChild(list);

  const disc = document.createElement("div");
  disc.className = "moon-disc-wrap";
  disc.innerHTML = moonSvg(info, 56);
  body.appendChild(disc);

  card.appendChild(body);
  return card;
}

function fmtDistance(km: number): string {
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export function moonView(b: WeatherBundle, s: Settings): DetailContent | null {
  const at = currentInstant(b);
  const offset = b.utcOffsetSeconds;
  const info = moonInfo(at, b.location.latitude, b.location.longitude, offset);

  const body = document.createElement("div");
  body.className = "dt dt-moon";

  const localDate = new Date(at.getTime() + offset * 1000);
  const dateLine = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(localDate);

  const headline = document.createElement("div");
  headline.className = "moon-hero";
  headline.innerHTML = `
    <div class="moon-hero-disc">${moonSvg(info, 170)}</div>
    <h3 class="moon-phase">${esc(info.name)}</h3>
    <div class="moon-date">${esc(dateLine)}</div>
  `;
  body.appendChild(headline);

  const grids = statGrid([
    { label: "Illumination", value: `${Math.round(info.illumination * 100)} %` },
    { label: "Moonrise", value: info.moonrise ? localClock(info.moonrise, offset, s) : "No moonrise" },
    { label: "Moonset", value: info.moonset ? localClock(info.moonset, offset, s) : "No moonset" },
    { label: "Next Full Moon", value: `${daysUntil(at, info.nextFullMoon)} days` },
    { label: "Next New Moon", value: `${daysUntil(at, info.nextNewMoon)} days` },
    { label: "Distance", value: fmtDistance(info.distanceKm) },
  ]);
  body.appendChild(grids);

  return { title: "Moon", icon: "moon", body };
}
