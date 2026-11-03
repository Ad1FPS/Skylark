import type { Settings, WeatherBundle } from "../types";
import { describe } from "../theme";
import { dayName, temp, tempColor } from "../format";
import { conditionIcon } from "../icons";

export function renderDaily(b: WeatherBundle, s: Settings): HTMLElement {
  const days = b.daily.slice(0, 10);
  const card = document.createElement("section");
  card.className = "card daily";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = "10-DAY FORECAST";
  card.appendChild(title);

  const gmins = days.map((d) => d.tempMin);
  const gmaxs = days.map((d) => d.tempMax);
  const lo = Math.min(...gmins);
  const hi = Math.max(...gmaxs);
  const span = hi - lo || 1;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const cond = describe(d.weatherCode, true);
    const row = document.createElement("div");
    row.className = "daily-row";

    const left = ((d.tempMin - lo) / span) * 100;
    const width = ((d.tempMax - d.tempMin) / span) * 100;
    const fill = `background:linear-gradient(90deg, ${tempColor(d.tempMin)}, ${tempColor(d.tempMax)});left:${left}%;width:${width}%`;

    const rain = (d.precipitationProbabilityMax ?? 0) >= 20
      ? `<div class="daily-rain">${d.precipitationProbabilityMax}%</div>`
      : `<div></div>`;

    row.innerHTML = `
      <div class="daily-day">${dayName(d.date, i)}</div>
      <div>${conditionIcon(cond.kind, true, 26)}</div>
      ${rain}
      <div class="daily-min">${temp(d.tempMin, s)}&deg;</div>
      <div class="daily-bar"><div class="daily-bar-fill" style="${fill}"></div></div>
      <div class="daily-max">${temp(d.tempMax, s)}&deg;</div>
    `;
    card.appendChild(row);
  }

  return card;
}
