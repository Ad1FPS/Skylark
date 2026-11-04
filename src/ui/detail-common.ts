import type { WeatherBundle } from "../types";
import type { IconName } from "../icons";
import { esc } from "../format";

export interface DetailContent {
  title: string;
  icon: IconName;
  body: HTMLElement;
}

export function hasDetail(b: WeatherBundle): boolean {
  return b.detail.time.length > 0;
}

export function nowIndex(b: WeatherBundle): number {
  const key = b.current.time.slice(0, 13);
  const i = b.detail.time.findIndex((t) => t.slice(0, 13) === key);
  return i >= 0 ? i : 0;
}

export function hhmm(iso: string): string {
  return iso.length > 10 ? iso.slice(11, 16) : "00:00";
}

export function headline(value: string, unit: string, sub: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "dt-headline";
  el.innerHTML = `
    <div class="dt-value">${esc(value)}${unit ? `<span class="dt-unit">${esc(unit)}</span>` : ""}</div>
    <div class="dt-sub">${esc(sub)}</div>
  `;
  return el;
}

export function sentence(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "dt-sentence";
  p.textContent = text;
  return p;
}

export function statGrid(items: { label: string; value: string }[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "dt-stats";
  el.innerHTML = items
    .map((it) => `<div class="dt-stat"><span class="dt-stat-label">${esc(it.label)}</span><span class="dt-stat-value">${esc(it.value)}</span></div>`)
    .join("");
  return el;
}

export function section(title: string, child: HTMLElement): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const h = document.createElement("h2");
  h.className = "card-title";
  h.textContent = title;
  card.appendChild(h);
  card.appendChild(child);
  return card;
}

export function noDetailNote(): HTMLElement {
  const el = document.createElement("p");
  el.className = "dt-sentence dt-note";
  el.textContent = "Hourly detail appears after the next refresh.";
  return el;
}
