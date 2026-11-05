import type { Settings, WeatherBundle } from "../types";
import { icon } from "../icons";
import type { DetailContent } from "./detail-common";
import { windView, precipitationView, humidityView, feelsView, pressureView, visibilityView } from "./detail-weather";
import { uvView, airView, sunView } from "./detail-air-sun";
import { dayView } from "./detail-day";
import { moonView } from "./moon-card";
import { nowcastView } from "./detail-nowcast";
import { alertView } from "./alerts";
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
  | "day"
  | "moon"
  | "nowcast"
  | "alert";

type View = (b: WeatherBundle, s: Settings, arg?: number) => DetailContent | null;

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
  day: dayView,
  moon: moonView,
  nowcast: nowcastView,
  alert: alertView,
};

let popover: PopoverHandle | null = null;
let popoverAnchor: HTMLElement | null = null;

export function closeDetail(): void {
  popover?.close();
}

export function openDetail(kind: DetailKind, b: WeatherBundle, s: Settings, anchor?: HTMLElement, arg?: number): void {
  if (popover && (!anchor || popoverAnchor === anchor)) {
    closeDetail();
    return;
  }
  const content = VIEWS[kind](b, s, arg);
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
