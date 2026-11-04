import type { Settings, WeatherBundle } from "../types";
import { compass, esc, tempDeg, tempColor, clock, localClock } from "../format";
import { icon } from "../icons";
import { renderMoonCard } from "./moon-card";
import { renderAveragesCard } from "./averages-card";
import { renderWindMap } from "./windmap";

const AQI_STOPS: Array<[number, string]> = [
  [0, "#4ade80"],
  [50, "#facc15"],
  [100, "#fb923c"],
  [150, "#ef4444"],
  [200, "#a855f7"],
  [300, "#a855f7"],
];

const UV_STOPS: Array<[number, string]> = [
  [0, "#4ade80"],
  [2, "#4ade80"],
  [3, "#facc15"],
  [5, "#facc15"],
  [6, "#fb923c"],
  [7, "#fb923c"],
  [8, "#ef4444"],
  [10, "#ef4444"],
  [11, "#a855f7"],
];

function rampGradient(stops: Array<[number, string]>, max: number): string {
  const parts = stops.map(([v, c]) => `${c} ${Math.round((v / max) * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function makeCard(title: string, iconName: Parameters<typeof icon>[0], extra = ""): HTMLElement {
  const card = document.createElement("section");
  card.className = `card info${extra ? " " + extra : ""}`;
  const h = document.createElement("h2");
  h.className = "card-title";
  h.innerHTML = `${icon(iconName, 13)}<span>${esc(title)}</span>`;
  card.appendChild(h);
  return card;
}

export function aqiCategory(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

export function aqiSentence(aqi: number): string {
  if (aqi <= 50) return "Air quality is satisfactory today.";
  if (aqi <= 100) return "Air quality is acceptable; sensitive people should take care.";
  if (aqi <= 150) return "Sensitive groups may feel effects from the air.";
  if (aqi <= 200) return "Everyone may begin to feel effects from the air.";
  if (aqi <= 300) return "Health alert: air is very unhealthy.";
  return "Health warning: hazardous air.";
}

export function uvCategory(uv: number): string {
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very high";
  return "Extreme";
}

export function rampBar(gradient: string, pos: number): string {
  const pct = Math.max(0, Math.min(100, pos * 100));
  return `<div class="ramp"><div class="ramp-fill" style="background:${gradient}"></div><div class="ramp-dot" style="left:${pct}%"></div></div>`;
}

function airCard(b: WeatherBundle): HTMLElement {
  const aqi = b.air!.usAqi;
  const card = makeCard("Air Quality", "leaf", "span-2");
  const body = document.createElement("div");
  body.className = "info-body";
  body.innerHTML = `
    <div class="value">${aqi}</div>
    <div class="sub">${esc(aqiCategory(aqi))}</div>
    <div class="sentence">${esc(aqiSentence(aqi))}</div>
    ${rampBar(rampGradient(AQI_STOPS, 300), Math.min(aqi, 300) / 300)}
  `;
  card.appendChild(body);
  return card;
}

function uvCard(b: WeatherBundle): HTMLElement {
  const uv = Math.round(b.current.uvIndex);
  const peak = Math.round(b.daily[0]?.uvIndexMax ?? uv);
  const card = makeCard("UV Index", "uv");
  const body = document.createElement("div");
  body.className = "info-body";
  body.innerHTML = `
    <div class="value">${uv}</div>
    <div class="sub">${esc(uvCategory(uv))}</div>
    <div class="sentence">Peak today: ${peak}</div>
    ${rampBar(rampGradient(UV_STOPS, 11), Math.min(uv, 11) / 11)}
  `;
  card.appendChild(body);
  return card;
}

function timeParts(iso: string): number {
  const t = iso.length > 10 ? iso.slice(11, 16) : "00:00";
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function sunCard(b: WeatherBundle, s: Settings): HTMLElement {
  const day = b.daily[0];
  const rise = day ? timeParts(day.sunrise) : 0;
  const set = day ? timeParts(day.sunset) : 0;
  const now = timeParts(b.current.time);
  // Before sunset the next event is sunset (shown big); after it, the coming sunrise.
  const upcoming = now < rise ? "sunrise" : now < set ? "sunset" : "sunrise";
  const card = makeCard(upcoming === "sunset" ? "Sunset" : "Sunrise", upcoming);
  const aside = document.createElement("span");
  aside.className = "card-aside";
  aside.textContent = localClock(b.utcOffsetSeconds, s);
  card.querySelector(".card-title")?.appendChild(aside);
  const tick = window.setInterval(() => {
    if (!aside.isConnected) window.clearInterval(tick);
    else aside.textContent = localClock(b.utcOffsetSeconds, s);
  }, 15000);
  const body = document.createElement("div");
  body.className = "info-body";
  // A 24 h sine: above the horizon between sunrise and sunset, below it overnight.
  const w = 180;
  const h = 40;
  const horizon = h * 0.52;
  const nightLen = rise + 1440 - set || 1;
  const yAt = (m: number): number => {
    if (m >= rise && m <= set) return horizon - Math.sin((Math.PI * (m - rise)) / (set - rise || 1)) * (horizon - 4);
    const p = ((m >= set ? m - set : m + 1440 - set) / nightLen) * Math.PI;
    return horizon + Math.sin(p) * (h - horizon - 4);
  };
  const xAt = (m: number): number => (m / 1440) * w;
  let dayPath = "";
  let nightPath = "";
  for (let m = 0; m <= 1440; m += 10) {
    const pt = `${xAt(m).toFixed(1)} ${yAt(m).toFixed(1)}`;
    if (m >= rise && m <= set) dayPath += `${dayPath ? "L" : "M"}${pt} `;
    else nightPath += `${m === 0 || (m - 10 >= rise && m - 10 <= set) ? "M" : "L"}${pt} `;
  }
  const cx = xAt(now);
  const cy = yAt(now);

  const main = day ? clock(upcoming === "sunset" ? day.sunset : day.sunrise, s) : "--";
  const other = day ? clock(upcoming === "sunset" ? day.sunrise : day.sunset, s) : "--";
  const otherLabel = upcoming === "sunset" ? "Sunrise" : "Sunset";

  body.innerHTML = `
    <div class="value">${esc(main)}</div>
    <div class="sun-chart">
    <svg class="sun-arc" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${nightPath}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.6"/>
      <path d="${dayPath}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.6"/>
      <line x1="0" y1="${horizon}" x2="${w}" y2="${horizon}" stroke="rgba(255,255,255,.4)" stroke-width="1"/>
    </svg>
    <div class="sun-dot" style="left:${((cx / w) * 100).toFixed(2)}%;top:${cy.toFixed(1)}px"></div>
    </div>
    <div class="sentence">${otherLabel}: ${esc(other)}</div>
  `;
  card.appendChild(body);
  return card;
}

function windCard(b: WeatherBundle, s: Settings): HTMLElement {
  const card = makeCard("Wind", "wind");
  const body = document.createElement("div");
  body.className = "info-body wind";
  const dir = b.current.windDirection;
  const deg = ((dir % 360) + 360) % 360;
  const speed = b.current.windSpeed;
  const wv = unitOf(s);
  const converted = Math.round(wv.conv(speed));

  const cx = 60;
  const cy = 60;
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const inner = i % 3 === 0 ? 48 : 52;
    const x1 = cx + Math.sin(a) * inner;
    const y1 = cy - Math.cos(a) * inner;
    const x2 = cx + Math.sin(a) * 56;
    const y2 = cy - Math.cos(a) * 56;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,.4)" stroke-width="${i % 3 === 0 ? 1.6 : 1}"/>`;
  }

  const letters = [
    { t: "N", x: cx, y: 12 },
    { t: "E", x: 112, y: cy + 4 },
    { t: "S", x: cx, y: 116 },
    { t: "W", x: 8, y: cy + 4 },
  ]
    .map((l) => `<text x="${l.x}" y="${l.y}" font-size="10" fill="rgba(255,255,255,.7)" text-anchor="middle" font-family="inherit">${l.t}</text>`)
    .join("");

  body.innerHTML = `
    <div class="wind-compass">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
        <circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
        ${ticks}
        ${letters}
        <g transform="rotate(${deg} 60 60)">
          <path d="M60 30 L66 46 L60 42 L54 46 Z" fill="#fff"/>
          <line x1="60" y1="42" x2="60" y2="64" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/>
        </g>
        <circle cx="${cx}" cy="${cy}" r="2" fill="#fff"/>
      </svg>
    </div>
    <div class="value">${converted}<span class="unit">${esc(wv.unit)}</span></div>
    <div class="sub">${esc(compass(deg))}</div>
  `;
  card.appendChild(body);
  return card;
}

function unitOf(s: Settings): { unit: string; conv: (kmh: number) => number } {
  if (s.wind === "mph") return { unit: "mph", conv: (k) => k * 0.621371 };
  if (s.wind === "ms") return { unit: "m/s", conv: (k) => k / 3.6 };
  return { unit: "km/h", conv: (k) => k };
}

function precipCard(b: WeatherBundle): HTMLElement {
  const card = makeCard("Precipitation", "drop");
  const body = document.createElement("div");
  body.className = "info-body";
  let max = 0;
  for (const h of b.hourly) {
    const p = h.precipitationProbability;
    if (p != null && p > max) max = p;
  }
  body.innerHTML = `
    <div class="value">${b.current.precipitation.toFixed(1)}<span class="unit">mm</span></div>
    <div class="sub">now</div>
    <div class="sentence">Up to ${max}% chance in the next 24 h</div>
  `;
  card.appendChild(body);
  return card;
}

function feelsCard(b: WeatherBundle, s: Settings): HTMLElement {
  const card = makeCard("Feels Like", "thermo");
  const body = document.createElement("div");
  body.className = "info-body";
  const diff = b.current.apparent - b.current.temperature;
  let sentence: string;
  if (diff < -1) sentence = "Wind is making it feel cooler.";
  else if (diff > 1) sentence = "Feels warmer than the actual temperature.";
  else sentence = "Similar to the actual temperature.";
  // Slider from -8 to +8 degrees of difference; the pill sits where the feel differs from reality.
  const shown = Math.round(diff);
  const pos = Math.max(0, Math.min(100, 50 + (diff / 8) * 50));
  const label = shown > 0 ? `+${shown}\u00B0` : `${shown}\u00B0`;
  body.innerHTML = `
    <div class="feels-head">
      <div class="value">${esc(tempDeg(b.current.apparent, s))}</div>
      <div class="feels-actual">Actual: ${esc(tempDeg(b.current.temperature, s))}</div>
    </div>
    <div class="feels-track" aria-hidden="true"><span class="feels-pill${diff < -0.5 ? " cold" : diff > 0.5 ? " warm" : ""}" style="left:${pos.toFixed(1)}%">${esc(label)}</span></div>
    <div class="sentence">${esc(sentence)}</div>
  `;
  card.appendChild(body);
  return card;
}

/** Dew point in C via the Magnus formula. */
function dewPoint(tempC: number, rh: number): number {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(rh, 1) / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

function humidityCard(b: WeatherBundle, s: Settings): HTMLElement {
  const h = b.current.humidity;
  const card = makeCard("Humidity", "drop");
  const body = document.createElement("div");
  body.className = "info-body";
  body.innerHTML = `
    <div class="value">${h}%</div>
    <div class="bar-fill"><div style="width:${Math.max(0, Math.min(100, h))}%"></div></div>
    <div class="sub">The dew point is ${tempDeg(dewPoint(b.current.temperature, h), s)} right now.</div>
  `;
  card.appendChild(body);
  return card;
}

function visibilityCard(b: WeatherBundle): HTMLElement {
  const km = b.current.visibility / 1000;
  const txt = km >= 10 ? String(Math.round(km)) : km.toFixed(1);
  let sentence: string;
  if (km >= 10) sentence = "Clear view.";
  else if (km >= 2) sentence = "Reduced visibility.";
  else sentence = "Poor visibility.";
  const card = makeCard("Visibility", "eye");
  const body = document.createElement("div");
  body.className = "info-body";
  body.innerHTML = `
    <div class="value">${esc(txt)}<span class="unit">km</span></div>
    <div class="sentence">${esc(sentence)}</div>
  `;
  card.appendChild(body);
  return card;
}

function pressureCard(b: WeatherBundle): HTMLElement {
  const p = Math.round(b.current.pressure);
  const card = makeCard("Pressure", "gauge");
  const body = document.createElement("div");
  body.className = "info-body";
  // Half-circle gauge, centre (80,78) radius 70, 950 hPa at the left end and 1050 at the right.
  const t = Math.max(0, Math.min(1, (p - 950) / 100));
  const px = (80 - 70 * Math.cos(Math.PI * t)).toFixed(1);
  const py = (78 - 70 * Math.sin(Math.PI * t)).toFixed(1);
  const arc = (x: string, y: string) => `M10 78 A 70 70 0 0 1 ${x} ${y}`;
  body.innerHTML = `
    <div class="value">${p}<span class="unit">hPa</span></div>
    <svg class="gauge-arc" viewBox="0 0 160 86" width="100%" height="72" aria-hidden="true">
      <path d="${arc("150", "78")}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="5" stroke-linecap="round"/>
      <path d="${arc(px, py)}" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${px}" cy="${py}" r="6" fill="#fff"/>
    </svg>
    <div class="gauge-labels"><span>Low</span><span>High</span></div>
  `;
  card.appendChild(body);
  return card;
}

/** Marks a tile as clickable; main.ts opens the matching detail view. */
function tag(card: HTMLElement, kind: string): HTMLElement {
  card.dataset.detail = kind;
  return card;
}

export function renderCards(b: WeatherBundle, s: Settings): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (b.air) out.push(tag(airCard(b), "air"));
  out.push(tag(uvCard(b), "uv"));
  out.push(renderAveragesCard(b, s));
  out.push(tag(sunCard(b, s), "sun"));
  out.push(tag(windCard(b, s), "wind"));
  out.push(renderWindMap(b, s));
  out.push(tag(renderMoonCard(b, s), "moon"));
  out.push(tag(precipCard(b), "precipitation"));
  out.push(tag(feelsCard(b, s), "feels"));
  out.push(tag(humidityCard(b, s), "humidity"));
  out.push(tag(visibilityCard(b), "visibility"));
  out.push(tag(pressureCard(b), "pressure"));
  return out;
}

// Keep tempColor referenced for future ramps without unused-import failures.
void tempColor;
