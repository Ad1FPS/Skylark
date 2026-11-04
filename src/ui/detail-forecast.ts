import type { Day, Settings, WeatherBundle } from "../types";
import { compass, dayName, esc, temp, tempColor, tempDeg, wind } from "../format";
import { conditionIcon } from "../icons";
import { describe } from "../theme";
import { renderRadar } from "./radar";
import type { DetailContent } from "./detail-common";
import { headline, section, sentence, statGrid } from "./detail-common";

function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} h`;
}

function pick<T>(items: T[], score: (t: T) => number, best: "max" | "min"): { item: T; index: number } {
  let index = 0;
  for (let i = 1; i < items.length; i++) {
    if (best === "max" ? score(items[i]) > score(items[index]) : score(items[i]) < score(items[index])) index = i;
  }
  return { item: items[index], index };
}

function row(d: Day, i: number, lo: number, span: number, s: Settings): string {
  const cond = describe(d.weatherCode, true);
  const left = ((d.tempMin - lo) / span) * 100;
  const width = ((d.tempMax - d.tempMin) / span) * 100;
  const fill = `background:linear-gradient(90deg, ${tempColor(d.tempMin)}, ${tempColor(d.tempMax)});left:${left}%;width:${width}%`;
  const w = wind(d.windSpeedMax, s);
  const chance = d.precipitationProbabilityMax != null ? `${d.precipitationProbabilityMax}%` : "–";
  return `
    <div class="df-row">
      <div class="df-day">${esc(dayName(d.date, i))}</div>
      <div class="df-cond">${conditionIcon(cond.kind, true, 24)}<span>${esc(cond.label)}</span></div>
      <div class="df-rain">${chance}<small>${d.precipitationSum.toFixed(1)} mm</small></div>
      <div class="df-range">
        <span>${temp(d.tempMin, s)}&deg;</span>
        <div class="daily-bar"><div class="daily-bar-fill" style="${fill}"></div></div>
        <span>${temp(d.tempMax, s)}&deg;</span>
      </div>
      <div class="df-wind">${w.value}<small>${w.unit}</small></div>
      <div class="df-uv">${Math.round(d.uvIndexMax)}</div>
      <div class="df-sun">${hours(d.sunshineSeconds)}</div>
    </div>`;
}

export function dailyView(b: WeatherBundle, s: Settings): DetailContent {
  const days = b.daily.slice(0, 10);
  const body = document.createElement("div");
  body.className = "dt";

  const warm = pick(days, (d) => d.tempMax, "max");
  const cold = pick(days, (d) => d.tempMin, "min");
  const wet = pick(days, (d) => d.precipitationSum, "max");
  const windy = pick(days, (d) => d.windGustsMax, "max");

  body.appendChild(headline(tempDeg(warm.item.tempMax, s), "", `Warmest: ${dayName(warm.item.date, warm.index)}`));
  body.appendChild(
    sentence(
      wet.item.precipitationSum >= 0.1
        ? `Wettest day is ${dayName(wet.item.date, wet.index)} with ${wet.item.precipitationSum.toFixed(1)} mm.`
        : "No significant rain in the next 10 days."
    )
  );

  const lo = Math.min(...days.map((d) => d.tempMin));
  const hi = Math.max(...days.map((d) => d.tempMax));
  const table = document.createElement("div");
  table.className = "df-table";
  table.innerHTML =
    `<div class="df-row df-head"><div>Day</div><div>Conditions</div><div>Rain</div><div>Low / high</div><div>Wind</div><div>UV</div><div>Sun</div></div>` +
    days.map((d, i) => row(d, i, lo, hi - lo || 1, s)).join("");
  body.appendChild(section("Day by day", table));

  const gust = wind(windy.item.windGustsMax, s);
  body.appendChild(
    statGrid([
      { label: "Coldest night", value: `${tempDeg(cold.item.tempMin, s)} ${dayName(cold.item.date, cold.index)}` },
      { label: "Rain days (over 1 mm)", value: String(days.filter((d) => d.precipitationSum >= 1).length) },
      { label: "Strongest gusts", value: `${gust.value} ${gust.unit} ${dayName(windy.item.date, windy.index)}` },
      { label: "Total rain", value: `${days.reduce((a, d) => a + d.precipitationSum, 0).toFixed(1)} mm` },
      { label: "Today's wind", value: `${wind(b.current.windSpeed, s).value} ${wind(b.current.windSpeed, s).unit} ${compass(b.current.windDirection)}` },
    ])
  );

  return { title: "10-Day Forecast", icon: "sun", body };
}

export function radarView(b: WeatherBundle, s: Settings): DetailContent {
  const body = document.createElement("div");
  body.className = "dt";
  body.appendChild(renderRadar(b, s, { large: true }));
  return { title: "Radar", icon: "drop", body };
}
