import type { Settings, WeatherBundle } from "../types";
import type { Alert } from "../api";
import { icon } from "../icons";
import { loadAlerts, onAlertsChange, peekAlerts, sameKey, severityColor } from "../alerts/store";
import type { DetailContent } from "./detail-common";
import { section, sentence, statGrid } from "./detail-common";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

const SEVERITY_LABEL: Record<Alert["severity"], string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
};

const SOURCE_LABEL: Record<string, string> = {
  NWS: "US National Weather Service",
  DWD: "German Weather Service (DWD)",
};

function shifted(unix: number, offset: number): Date {
  return new Date((unix + offset) * 1000);
}

function sameDay(a: number, b: number, offset: number): boolean {
  const da = shifted(a, offset);
  const db = shifted(b, offset);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function clockTime(d: Date, clock: Settings["clock"]): string {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  if (clock === "24") {
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function untilLabel(ends: number | null, offset: number, clock: Settings["clock"]): string | null {
  if (ends === null) return null;
  const now = Date.now() / 1000;
  const d = shifted(ends, offset);
  const time = clockTime(d, clock);
  if (sameDay(ends, now, offset)) return `until ${time}`;
  return `until ${WEEKDAY.format(d)} ${time}`;
}

function leadLabel(onset: number | null, offset: number, clock: Settings["clock"]): string {
  if (onset === null || onset <= Date.now() / 1000) return "Now";
  const d = shifted(onset, offset);
  return `${WEEKDAY.format(d)} ${clockTime(d, clock)}`;
}

function endsLabel(ends: number | null, offset: number, clock: Settings["clock"]): string {
  if (ends === null) return "Further notice";
  const d = shifted(ends, offset);
  const time = clockTime(d, clock);
  const now = Date.now() / 1000;
  if (sameDay(ends, now, offset)) return time;
  return `${WEEKDAY.format(d)} ${time}`;
}

function pill(b: WeatherBundle, alert: Alert, index: number, s: Settings): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "alert-pill";
  btn.dataset.detail = "alert";
  btn.dataset.day = String(index);
  btn.style.setProperty("--sev", severityColor(alert.severity));

  const until = untilLabel(alert.ends, b.utcOffsetSeconds, s.clock);
  const aria = `${alert.severity} ${alert.event.toLowerCase()}${until ? `, ${until}` : ""}. Open details`;
  btn.setAttribute("aria-label", aria);

  const glyph = document.createElement("span");
  glyph.className = "alert-glyph";
  glyph.innerHTML = icon("alert", 14);

  const event = document.createElement("span");
  event.className = "alert-event";
  event.textContent = alert.event;

  btn.appendChild(glyph);
  btn.appendChild(event);

  if (until) {
    const u = document.createElement("span");
    u.className = "alert-until";
    u.textContent = until;
    btn.appendChild(u);
  }

  return btn;
}

export function renderAlertStrip(b: WeatherBundle, s: Settings): HTMLElement {
  const strip = document.createElement("div");
  strip.className = "alert-strip";

  const draw = (alerts: Alert[]): void => {
    strip.replaceChildren();
    if (alerts.length === 0) {
      strip.classList.add("empty");
      return;
    }
    strip.classList.remove("empty");
    const shown = alerts.slice(0, 5);
    for (let i = 0; i < shown.length; i++) {
      strip.appendChild(pill(b, shown[i], i, s));
    }
  };

  draw(peekAlerts(b.location));
  void loadAlerts(b.location);

  let unsub: (() => void) | null = null;
  const stop = (): void => {
    if (unsub) {
      unsub();
      unsub = null;
    }
  };

  const start = (): void => {
    if (unsub) return;
    unsub = onAlertsChange((loc) => {
      if (!strip.isConnected) {
        stop();
        return;
      }
      if (!sameKey(loc, b.location)) return;
      draw(peekAlerts(b.location));
    });
  };

  start();
  if (!strip.isConnected) {
    // Nobody can observe it yet; re-check once it is inserted.
    queueMicrotask(() => {
      if (strip.isConnected) start();
    });
  }

  return strip;
}

export function alertView(b: WeatherBundle, s: Settings, index = 0): DetailContent | null {
  const alerts = peekAlerts(b.location);
  const alert = alerts[index];
  if (!alert) return null;

  const body = document.createElement("div");
  body.className = "dt";

  const chip = document.createElement("span");
  chip.className = "alert-chip";
  chip.style.setProperty("--sev", severityColor(alert.severity));
  chip.textContent = `${SEVERITY_LABEL[alert.severity] ?? "Minor"} alert`;
  body.appendChild(chip);

  body.appendChild(
    statGrid([
      { label: "From", value: leadLabel(alert.onset, b.utcOffsetSeconds, s.clock) },
      { label: "Until", value: endsLabel(alert.ends, b.utcOffsetSeconds, s.clock) },
      { label: "Issued by", value: alert.sender },
      { label: "Source", value: SOURCE_LABEL[alert.source] ?? alert.source },
    ]),
  );

  if (alert.headline) {
    body.appendChild(sentence(alert.headline));
  }

  const details = document.createElement("p");
  details.className = "dt-sentence alert-text";
  details.textContent = alert.description;
  body.appendChild(section("Details", details));

  if (alert.instruction) {
    const what = document.createElement("p");
    what.className = "dt-sentence alert-text";
    what.textContent = alert.instruction;
    body.appendChild(section("What to do", what));
  }

  const note = document.createElement("p");
  note.className = "alert-note";
  note.textContent = "Shown as published by the issuing agency. In an emergency, follow your local authorities.";
  body.appendChild(note);

  return { title: alert.event, icon: "alert", body };
}
