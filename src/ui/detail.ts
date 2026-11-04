import type { Settings, WeatherBundle } from "../types";
import { icon } from "../icons";
import type { DetailContent } from "./detail-common";
import { windView, precipitationView, humidityView, feelsView, pressureView, visibilityView } from "./detail-weather";
import { uvView, airView, sunView } from "./detail-air-sun";
import { dailyView, radarView } from "./detail-forecast";

export type DetailKind =
  | "wind"
  | "uv"
  | "precipitation"
  | "humidity"
  | "feels"
  | "pressure"
  | "visibility"
  | "air"
  | "sun"
  | "daily"
  | "radar";

type View = (b: WeatherBundle, s: Settings) => DetailContent | null;

const VIEWS: Record<DetailKind, View> = {
  wind: windView,
  uv: uvView,
  precipitation: precipitationView,
  humidity: humidityView,
  feels: feelsView,
  pressure: pressureView,
  visibility: visibilityView,
  air: airView,
  sun: sunView,
  daily: dailyView,
  radar: radarView,
};

let overlay: HTMLElement | null = null;
let restoreFocus: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function teardown(): void {
  if (keyHandler) window.removeEventListener("keydown", keyHandler);
  keyHandler = null;
  overlay?.remove();
  overlay = null;
  restoreFocus?.focus();
  restoreFocus = null;
}

export function closeDetail(): void {
  if (!overlay) return;
  teardown();
}

export function openDetail(kind: DetailKind, b: WeatherBundle, s: Settings): void {
  const content = VIEWS[kind](b, s);
  if (!content) return;
  closeDetail();

  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const root = document.createElement("div");
  root.className = "detail-overlay";

  const sheet = document.createElement("div");
  sheet.className = "detail-sheet";

  const head = document.createElement("div");
  head.className = "detail-head";
  head.innerHTML = `
    <button class="detail-back" type="button"><span class="detail-chev">\u2039</span>Back</button>
    <span class="detail-title-icon">${icon(content.icon, 15)}</span>
    <h2 class="card-title">${content.title}</h2>
  `;
  const back = head.querySelector<HTMLButtonElement>(".detail-back");
  back?.addEventListener("click", closeDetail);

  const body = document.createElement("div");
  body.className = "detail-body";
  body.appendChild(content.body);

  sheet.appendChild(head);
  sheet.appendChild(body);
  root.appendChild(sheet);

  root.addEventListener("click", (e) => {
    if (e.target === root) closeDetail();
  });
  keyHandler = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closeDetail();
  };
  window.addEventListener("keydown", keyHandler);

  document.body.appendChild(root);
  overlay = root;
  back?.focus();
}
