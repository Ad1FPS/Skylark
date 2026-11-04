import type { Settings, WeatherBundle } from "../types";
import { temp } from "../format";
import { getNormal } from "../api";

const CHART_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3v11h12"/><path d="M3.5 11l3-4 3 2 3-5.5"/></svg>`;

export function renderAveragesCard(b: WeatherBundle, s: Settings): HTMLElement {
  const card = document.createElement("section");
  card.className = "card info averages";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.innerHTML = `${CHART_ICON}<span>AVERAGES</span>`;
  card.appendChild(title);

  const body = document.createElement("div");
  body.className = "info-body";
  body.innerHTML = `
    <div class="avg-diff">&ndash;</div>
    <div class="avg-caption">from average daily high</div>
    <div class="avg-grid">
      <div class="avg-col">
        <span class="avg-label">Today</span>
        <span class="avg-value">H:&ndash;</span>
      </div>
      <div class="avg-col">
        <span class="avg-label">Average</span>
        <span class="avg-value">H:&ndash;</span>
      </div>
    </div>
  `;
  card.appendChild(body);

  const diffEl = body.querySelector<HTMLElement>(".avg-diff");
  const captionEl = body.querySelector<HTMLElement>(".avg-caption");
  const gridEl = body.querySelector<HTMLElement>(".avg-grid");
  const todayEl = body.querySelectorAll<HTMLElement>(".avg-value")[0] ?? null;
  const normalEl = body.querySelectorAll<HTMLElement>(".avg-value")[1] ?? null;

  const day = b.daily[0];
  if (!day || !diffEl || !captionEl || !gridEl || !todayEl || !normalEl) {
    return card;
  }

  const today = day.tempMax;
  const date = day.date;

  const apply = (normalC: number | null): void => {
    if (!card.isConnected) return;
    todayEl.textContent = `H:${temp(today, s)}\u00B0`;
    if (normalC === null) {
      diffEl.textContent = "No data";
      diffEl.classList.add("avg-muted");
      captionEl.textContent = "";
      captionEl.hidden = true;
      gridEl.hidden = true;
      return;
    }
    const diff = Math.round(Number(temp(today, s))) - Math.round(Number(temp(normalC, s)));
    if (diff > 0) {
      diffEl.textContent = `+${diff}\u00B0`;
      captionEl.textContent = "above average daily high";
    } else if (diff < 0) {
      diffEl.textContent = `${diff}\u00B0`;
      captionEl.textContent = "below average daily high";
    } else {
      diffEl.textContent = "0\u00B0";
      captionEl.textContent = "from average daily high";
    }
    normalEl.textContent = `H:${temp(normalC, s)}\u00B0`;
    captionEl.hidden = false;
    gridEl.hidden = false;
  };

  void getNormal(b.location.latitude, b.location.longitude, date)
    .then(apply)
    .catch(() => apply(null));

  return card;
}
