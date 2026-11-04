import type { Settings, WeatherBundle } from "../types";
import { clock, dayName } from "../format";
import { aqiCategory, aqiSentence, uvCategory } from "./cards";
import { renderChart } from "./chart";
import type { DetailContent } from "./detail-common";
import { hasDetail, headline, hhmm, noDetailNote, nowIndex, section, sentence, statGrid } from "./detail-common";

export function uvView(b: WeatherBundle): DetailContent {
  const uv = b.current.uvIndex;
  const value = uv < 10 ? uv.toFixed(1) : String(Math.round(uv));
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(value, "", uvCategory(uv)));

  // Sun-protection window: first and last hour where UV >= 3 today.
  const today = b.detail.uvIndex.slice(0, 24);
  let first = -1;
  let last = -1;
  today.forEach((v, i) => {
    if (v >= 3) {
      if (first < 0) first = i;
      last = i;
    }
  });
  const window =
    first >= 0 && last >= 0 && b.detail.time[first] && b.detail.time[last]
      ? `Use sun protection from ${hhmm(b.detail.time[first])} to ${hhmm(b.detail.time[last])}.`
      : "No sun protection needed today.";
  body.appendChild(sentence(window));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    body.appendChild(
      section(
        "UV Index",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values: b.detail.uvIndex, color: "#ffd479", kind: "area", label: "UV" }],
          min: 0,
          max: Math.max(11, ...b.detail.uvIndex),
          format: (v) => v.toFixed(1),
          bands: [
            { from: 0, to: 3, color: "#6fd08c" },
            { from: 3, to: 6, color: "#ffd479" },
            { from: 6, to: 8, color: "#ff9d7a" },
            { from: 8, to: 11, color: "#ff6b6b" },
            { from: 11, to: 14, color: "#c77dff" },
          ],
        })
      )
    );
  }

  // Hour of today's peak.
  let peakIdx = -1;
  let peakVal = -1;
  today.forEach((v, i) => {
    if (v > peakVal) {
      peakVal = v;
      peakIdx = i;
    }
  });
  const peak = b.daily[0]?.uvIndexMax ?? uv;
  body.appendChild(
    statGrid([
      { label: "Peak today", value: peak.toFixed(1) },
      { label: "At", value: peakIdx >= 0 && b.detail.time[peakIdx] ? hhmm(b.detail.time[peakIdx]) : "--" },
      { label: "Peak tomorrow", value: (b.daily[1]?.uvIndexMax ?? 0).toFixed(1) },
      { label: "Category", value: uvCategory(peak) },
    ])
  );

  return { title: "UV Index", icon: "uv", body };
}

function airNowIndex(b: WeatherBundle): number {
  const key = b.current.time.slice(0, 13);
  const i = b.air!.hourly.time.findIndex((t) => t.slice(0, 13) === key);
  return i >= 0 ? i : 0;
}

const POLLUTANTS: Array<{ name: string; key: "pm25" | "pm10" | "ozone" | "no2" | "so2" | "co"; ref: number }> = [
  { name: "PM2.5", key: "pm25", ref: 35 },
  { name: "PM10", key: "pm10", ref: 50 },
  { name: "Ozone", key: "ozone", ref: 120 },
  { name: "Nitrogen dioxide", key: "no2", ref: 100 },
  { name: "Sulphur dioxide", key: "so2", ref: 40 },
  { name: "Carbon monoxide", key: "co", ref: 10000 },
];

export function airView(b: WeatherBundle): DetailContent | null {
  const air = b.air;
  if (!air) return null;
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(String(air.usAqi), "", aqiCategory(air.usAqi)));
  body.appendChild(sentence(aqiSentence(air.usAqi)));

  if (air.hourly.time.length > 0) {
    body.appendChild(
      section(
        "Air quality",
        renderChart({
          times: air.hourly.time,
          nowIndex: airNowIndex(b),
          series: [{ values: air.hourly.usAqi, color: "#9be3b0", kind: "area", label: "AQI" }],
          min: 0,
          format: (v) => String(Math.round(v)),
          bands: [
            { from: 0, to: 50, color: "#6fd08c" },
            { from: 50, to: 100, color: "#ffd479" },
            { from: 100, to: 150, color: "#ff9d7a" },
            { from: 150, to: 200, color: "#ff6b6b" },
            { from: 200, to: 300, color: "#c77dff" },
          ],
        })
      )
    );
  }

  const list = document.createElement("div");
  list.className = "dt-pollutants";
  for (const p of POLLUTANTS) {
    const v = air[p.key];
    const frac = Math.min(1, v / p.ref);
    const color = frac < 0.5 ? "#6fd08c" : frac < 1 ? "#ffd479" : "#ff9d7a";
    const row = document.createElement("div");
    row.className = "dt-pollutant";
    row.innerHTML = `
      <span class="dt-pollutant-name">${p.name}</span>
      <span class="dt-pollutant-value">${v.toFixed(1)} <em>\u00B5g/m\u00B3</em></span>
      <span class="dt-pollutant-bar"><span style="width:${(frac * 100).toFixed(1)}%;background:${color}"></span></span>
    `;
    list.appendChild(row);
  }
  body.appendChild(section("Pollutants", list));
  body.appendChild(sentence("Bars show each pollutant against a typical daily guideline."));

  return { title: "Air Quality", icon: "leaf", body };
}

function timeParts(iso: string): number {
  const t = iso.length > 10 ? iso.slice(11, 16) : "00:00";
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function daylight(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} h ${m} min`;
}

export function sunView(b: WeatherBundle, s: Settings): DetailContent {
  const day = b.daily[0];
  const rise = day ? timeParts(day.sunrise) : 0;
  const set = day ? timeParts(day.sunset) : 0;
  const now = timeParts(b.current.time);
  const upcoming = now < rise ? "sunrise" : now < set ? "sunset" : "sunrise";
  const soonIso =
    upcoming === "sunset"
      ? day?.sunset ?? b.current.time
      : now >= set && b.daily[1]
        ? b.daily[1].sunrise
        : day?.sunrise ?? b.current.time;
  const sub = upcoming === "sunset" ? "Sunset" : "Sunrise";

  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(clock(soonIso, s), "", sub));

  const diff = (b.daily[1]?.daylightSeconds ?? 0) - (day?.daylightSeconds ?? 0);
  const diffText = b.daily[1] ? `${diff >= 0 ? "+" : "\u2212"}${Math.round(Math.abs(diff) / 60)} min` : "--";
  body.appendChild(
    statGrid([
      { label: "Sunrise", value: day ? clock(day.sunrise, s) : "--" },
      { label: "Sunset", value: day ? clock(day.sunset, s) : "--" },
      { label: "Daylight", value: day ? daylight(day.daylightSeconds) : "--" },
      { label: "Sunshine", value: day ? daylight(day.sunshineSeconds) : "--" },
      { label: "Tomorrow's daylight", value: diffText },
    ])
  );

  const list = document.createElement("div");
  list.className = "dt-days";
  list.innerHTML = `<div class="dt-days-head"><span>Day</span><span>Sunrise</span><span>Sunset</span><span>Daylight</span></div>`;
  b.daily.slice(0, 7).forEach((d, i) => {
    list.insertAdjacentHTML(
      "beforeend",
      `<div class="dt-days-row"><span>${dayName(d.date, i)}</span><span>${clock(d.sunrise, s)}</span><span>${clock(d.sunset, s)}</span><span>${daylight(d.daylightSeconds)}</span></div>`
    );
  });
  body.appendChild(section("Next days", list));

  return { title: "Sunrise & Sunset", icon: "sun", body };
}
