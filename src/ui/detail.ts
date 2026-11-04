import type { Settings, WeatherBundle } from "../types";
import { icon } from "../icons";
import type { DetailContent } from "./detail-common";
import { windView, precipitationView, humidityView, feelsView, pressureView, visibilityView } from "./detail-weather";
import { uvView, airView, sunView } from "./detail-air-sun";
import { dailyView, radarView } from "./detail-forecast";
import type { PopoverHandle } from "./popover";
import { openPopover } from "./popover";

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

let popover: PopoverHandle | null = null;
let popoverAnchor: HTMLElement | null = null;

export function closeDetail(): void {
  popover?.close();
}

export function openDetail(kind: DetailKind, b: WeatherBundle, s: Settings, anchor?: HTMLElement): void {
  if (popover && (!anchor || popoverAnchor === anchor)) {
    closeDetail();
    return;
  }
  const content = VIEWS[kind](b, s);
  if (!content) return;
  closeDetail();

  const target = anchor ?? document.body;
  popoverAnchor = target;
  popover = openPopover({
    anchor: target,
    title: content.title,
    iconHtml: icon(content.icon, 15),
    body: content.body,
    onClose: () => {
      popover = null;
      popoverAnchor = null;
    },
  });
}
