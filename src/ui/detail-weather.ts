import type { Settings, WeatherBundle } from "../types";
import { compass, tempDeg, wind } from "../format";
import { renderChart } from "./chart";
import { RAIN_BANDS } from "./detail-nowcast";
import type { DetailContent } from "./detail-common";
import { hasDetail, headline, hhmm, noDetailNote, nowIndex, section, sentence, statGrid } from "./detail-common";

function windText(v: number, s: Settings): string {
  const w = wind(v, s);
  return `${w.value} ${w.unit}`;
}

export function windView(b: WeatherBundle, s: Settings): DetailContent {
  const w = wind(b.current.windSpeed, s);
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(w.value, w.unit, compass(b.current.windDirection)));

  body.appendChild(sentence(`Gusts up to ${windText(b.daily[0]?.windGustsMax ?? b.current.windSpeed, s)} today.`));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    const chart = renderChart({
      times: b.detail.time,
      nowIndex: nowIndex(b),
      series: [
        { values: b.detail.windSpeed.map((v) => Number(wind(v, s).value)), color: "#7cc4ff", kind: "line", label: "Wind" },
        { values: b.detail.windGusts.map((v) => Number(wind(v, s).value)), color: "#ffd479", kind: "line", dashed: true, label: "Gusts" },
      ],
      format: (v) => `${Math.round(v)} ${w.unit}`,
    });
    body.appendChild(section("Speed", chart));
    body.appendChild(directionStrip(b));
  }

  body.appendChild(
    statGrid([
      { label: "Today max", value: windText(b.daily[0]?.windSpeedMax ?? 0, s) },
      { label: "Today gusts", value: windText(b.daily[0]?.windGustsMax ?? 0, s) },
      { label: "Direction", value: `${Math.round(b.current.windDirection)}\u00B0` },
      { label: "Tomorrow max", value: windText(b.daily[1]?.windSpeedMax ?? 0, s) },
    ])
  );

  return { title: "Wind", icon: "wind", body };
}

function directionStrip(b: WeatherBundle): HTMLElement {
  const el = document.createElement("div");
  el.className = "dt-dirs";
  const dirs = b.detail.windDirection;
  const times = b.detail.time;
  for (let i = 0; i < Math.min(24, dirs.length); i += 3) {
    const arrow = `<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" style="transform:rotate(${dirs[i] + 180}deg)"><path d="M6 1 L9 10 L6 7.5 L3 10 Z" fill="rgba(255,255,255,.7)"/></svg>`;
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="dt-dir"><div class="dt-dir-arrow">${arrow}</div><span>${hhmm(times[i])}</span></div>`
    );
  }
  return el;
}

export function precipitationView(b: WeatherBundle): DetailContent {
  const today = b.daily[0]?.precipitationSum ?? 0;
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(today.toFixed(1), "mm", "expected today"));

  const tomorrow = b.daily[1]?.precipitationSum ?? 0;
  let peak = 0;
  for (const p of b.detail.precipitationProbability) if (p > peak) peak = p;
  body.appendChild(sentence(`Tomorrow ${tomorrow.toFixed(1)} mm. Highest chance ${peak}%.`));
  body.appendChild(sentence("Bands show light (under 2.5 mm per hour), moderate (up to 7.6 mm) and heavy rain."));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    body.appendChild(
      section(
        "Rain per hour",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values: b.detail.precipitation, color: "#5aa9ff", kind: "bars", label: "Rain" }],
          format: (v) => `${v.toFixed(1)} mm`,
          bands: RAIN_BANDS,
        })
      )
    );
    body.appendChild(
      section(
        "Chance of rain",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values: b.detail.precipitationProbability, color: "#9be3b0", kind: "line", label: "Chance" }],
          min: 0,
          max: 100,
          format: (v) => `${Math.round(v)}%`,
        })
      )
    );
  }

  body.appendChild(
    statGrid([
      { label: "Today", value: `${today.toFixed(1)} mm` },
      { label: "Tomorrow", value: `${tomorrow.toFixed(1)} mm` },
      { label: "Wet hours today", value: String(b.daily[0]?.precipitationHours ?? 0) },
      { label: "Peak chance", value: `${peak}%` },
    ])
  );

  return { title: "Precipitation", icon: "drop", body };
}

function dewSentence(dewC: number, s: Settings): string {
  const label = dewC < 10 ? "Dry" : dewC < 16 ? "Comfortable" : dewC < 21 ? "Humid" : "Oppressive";
  return `${label}. Dew point ${tempDeg(dewC, s)}.`;
}

export function humidityView(b: WeatherBundle, s: Settings): DetailContent {
  // Dew point from detail if present, else fall back to the current temperature.
  const dew = b.detail.dewPoint[nowIndex(b)] ?? b.current.temperature;
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(String(b.current.humidity), "%", `Dew point ${tempDeg(dew, s)}`));
  body.appendChild(sentence(dewSentence(dew, s)));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    body.appendChild(
      section(
        "Humidity",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values: b.detail.humidity, color: "#7cc4ff", kind: "area", label: "Humidity" }],
          min: 0,
          max: 100,
          format: (v) => `${Math.round(v)}%`,
        })
      )
    );
    body.appendChild(
      section(
        "Dew point",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values: b.detail.dewPoint, color: "#ffd479", kind: "line", label: "Dew point" }],
          format: (v) => tempDeg(v, s),
        })
      )
    );
  }

  const today = b.detail.humidity.slice(0, 24);
  const lo = today.length ? Math.min(...today) : b.current.humidity;
  const hi = today.length ? Math.max(...today) : b.current.humidity;
  body.appendChild(
    statGrid([
      { label: "Low", value: `${Math.round(lo)}%` },
      { label: "High", value: `${Math.round(hi)}%` },
      { label: "Dew point", value: tempDeg(dew, s) },
    ])
  );

  return { title: "Humidity", icon: "drop", body };
}

export function feelsView(b: WeatherBundle, s: Settings): DetailContent {
  const diff = b.current.apparent - b.current.temperature;
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(tempDeg(b.current.apparent, s), "", `Actual ${tempDeg(b.current.temperature, s)}`));

  const text =
    Math.abs(diff) <= 1
      ? "Close to the actual temperature."
      : `Feels about ${Math.abs(Math.round(diff))}\u00B0 ${diff > 0 ? "warmer" : "cooler"} than the air temperature.`;
  body.appendChild(sentence(text));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    body.appendChild(
      section(
        "Temperature",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [
            { values: b.detail.temperature, color: "rgba(255,255,255,.6)", kind: "line", label: "Actual" },
            { values: b.detail.apparent, color: "#ffd479", kind: "line", label: "Feels like" },
          ],
          format: (v) => tempDeg(v, s),
        })
      )
    );
  }

  body.appendChild(
    statGrid([
      { label: "Feels high", value: tempDeg(b.daily[0]?.apparentMax ?? b.current.apparent, s) },
      { label: "Feels low", value: tempDeg(b.daily[0]?.apparentMin ?? b.current.apparent, s) },
      { label: "Actual high", value: tempDeg(b.daily[0]?.tempMax ?? b.current.temperature, s) },
      { label: "Actual low", value: tempDeg(b.daily[0]?.tempMin ?? b.current.temperature, s) },
    ])
  );

  return { title: "Feels Like", icon: "thermo", body };
}

export function pressureView(b: WeatherBundle): DetailContent {
  const now = nowIndex(b);
  const series = b.detail.pressure;
  const ref = now - 6 >= 0 ? now - 6 : now + 6 < series.length ? now + 6 : now;
  const change = (series[now] ?? b.current.pressure) - (series[ref] ?? b.current.pressure);
  const trend = change > 1.5 ? "Rising" : change < -1.5 ? "Falling" : "Steady";

  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(String(Math.round(b.current.pressure)), "hPa", trend));
  body.appendChild(sentence(`Change over 6 h: ${change > 0 ? "+" : ""}${change.toFixed(1)} hPa.`));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    const lo = Math.min(...series) - 2;
    const hi = Math.max(...series) + 2;
    body.appendChild(
      section(
        "Pressure",
        renderChart({
          times: b.detail.time,
          nowIndex: now,
          series: [{ values: series, color: "#7cc4ff", kind: "line", label: "Pressure" }],
          min: lo,
          max: hi,
          format: (v) => `${Math.round(v)}`,
        })
      )
    );
  }

  body.appendChild(
    statGrid([
      { label: "Min", value: series.length ? `${Math.round(Math.min(...series))} hPa` : "--" },
      { label: "Max", value: series.length ? `${Math.round(Math.max(...series))} hPa` : "--" },
      { label: "6 h change", value: `${change > 0 ? "+" : ""}${change.toFixed(1)} hPa` },
    ])
  );

  return { title: "Pressure", icon: "gauge", body };
}

function visibilityText(km: number): string {
  if (km >= 10) return "Clear view.";
  if (km >= 2) return "Reduced visibility.";
  return "Poor visibility.";
}

export function visibilityView(b: WeatherBundle): DetailContent {
  const km = b.current.visibility / 1000;
  const txt = km >= 10 ? String(Math.round(km)) : km.toFixed(1);
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(headline(txt, "km", visibilityText(km)));
  body.appendChild(sentence(`Currently ${txt} km of visibility.`));

  if (!hasDetail(b)) {
    body.appendChild(noDetailNote());
  } else {
    const values = b.detail.visibility.map((v) => v / 1000);
    body.appendChild(
      section(
        "Visibility",
        renderChart({
          times: b.detail.time,
          nowIndex: nowIndex(b),
          series: [{ values, color: "#9be3b0", kind: "area", label: "Visibility" }],
          min: 0,
          format: (v) => `${v.toFixed(1)} km`,
        })
      )
    );
  }

  const next = b.detail.visibility.slice(0, 24);
  const loIdx = next.length ? next.indexOf(Math.min(...next)) : -1;
  const hi = next.length ? Math.max(...next) / 1000 : km;
  body.appendChild(
    statGrid([
      { label: "Low", value: loIdx >= 0 ? `${(next[loIdx] / 1000).toFixed(1)} km` : "--" },
      { label: "When", value: loIdx >= 0 ? hhmm(b.detail.time[loIdx]) : "--" },
      { label: "High", value: `${hi.toFixed(1)} km` },
    ])
  );

  return { title: "Visibility", icon: "eye", body };
}
