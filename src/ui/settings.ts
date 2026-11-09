import type { Settings } from "../types";
import { state, set, subscribe } from "../state";
import { saveSettings } from "../format";
import { icon } from "../icons";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkUpdate, installUpdate, type UpdateInfo } from "../api";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const appVersion = getVersion().catch(() => "");

interface Seg {
  label: string;
  value: string;
  active: boolean;
}

let isOpen = false;
let backdrop: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let trigger: HTMLElement | null = null;
let autostart: boolean | null = null;
let lastSettings = state.settings;

type UpdatePhase = "idle" | "checking" | "up-to-date" | "available" | "installing" | "error";

let updatePhase: UpdatePhase = "idle";
let updateError = "Could not check for updates";
/** The backend's short reason, shown on hover so a failed check can be diagnosed. */
let updateErrorDetail = "";
let availableUpdate: UpdateInfo | null = null;
let updateStatusEl: HTMLElement | null = null;
let updateCheckBtn: HTMLButtonElement | null = null;
let updateInstallBtn: HTMLButtonElement | null = null;

function paintUpdate(): void {
  const status = updateStatusEl;
  const check = updateCheckBtn;
  const install = updateInstallBtn;
  if (!status || !check || !install) return;

  const busy = updatePhase === "checking" || updatePhase === "installing";
  check.disabled = busy;
  install.disabled = busy;

  let text = "";
  switch (updatePhase) {
    case "checking":
      text = "Checking...";
      break;
    case "up-to-date":
      text = "You're up to date";
      break;
    case "available":
      text = `Version ${availableUpdate?.version ?? ""} is available`;
      break;
    case "installing":
      text = "Installing...";
      break;
    case "error":
      text = updateError;
      break;
  }
  status.textContent = text;
  status.title = updatePhase === "error" ? updateErrorDetail : "";
  status.hidden = text === "";
  status.classList.toggle("muted", updatePhase === "error");

  check.hidden = updatePhase === "available" || updatePhase === "installing";
  install.hidden = updatePhase !== "available" && updatePhase !== "installing";
  install.textContent = updatePhase === "installing" ? "Installing..." : "Install and restart";
}

async function runUpdateCheck(): Promise<void> {
  if (updatePhase === "checking" || updatePhase === "installing") return;
  updatePhase = "checking";
  paintUpdate();
  try {
    const found = await checkUpdate();
    availableUpdate = found;
    updatePhase = found ? "available" : "up-to-date";
  } catch (err) {
    availableUpdate = null;
    updateError = "Could not check for updates";
    updateErrorDetail = String(err);
    updatePhase = "error";
  }
  paintUpdate();
}

async function runInstall(): Promise<void> {
  if (updatePhase === "checking" || updatePhase === "installing") return;
  updatePhase = "installing";
  paintUpdate();
  try {
    await installUpdate();
    // Normally the app restarts before this resolves; if it does not, the update is installed.
    availableUpdate = null;
    updatePhase = "up-to-date";
  } catch (err) {
    updateError = "Could not install the update";
    updateErrorDetail = String(err);
    updatePhase = "error";
  }
  paintUpdate();
}

function appendUpdate(box: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "about-update";

  updateStatusEl = document.createElement("div");
  updateStatusEl.className = "about-update-status";
  updateStatusEl.setAttribute("role", "status");
  updateStatusEl.setAttribute("aria-live", "polite");

  updateCheckBtn = document.createElement("button");
  updateCheckBtn.type = "button";
  updateCheckBtn.className = "about-update-btn";
  updateCheckBtn.textContent = "Check for updates";
  updateCheckBtn.addEventListener("click", () => void runUpdateCheck());

  updateInstallBtn = document.createElement("button");
  updateInstallBtn.type = "button";
  updateInstallBtn.className = "about-update-btn";
  updateInstallBtn.textContent = "Install and restart";
  updateInstallBtn.addEventListener("click", () => void runInstall());

  wrap.append(updateStatusEl, updateCheckBtn, updateInstallBtn);
  box.appendChild(wrap);
  paintUpdate();
}

function externalLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    void openUrl(href).catch(() => {});
  });
  return link;
}

function appendAbout(box: HTMLElement): void {
  const version = document.createElement("div");
  version.className = "about-version";
  version.textContent = "Skylark";
  void appVersion.then((v) => {
    if (v) version.textContent = `Skylark ${v}`;
  });
  box.appendChild(version);

  appendUpdate(box);

  const repo = document.createElement("div");
  repo.className = "about-repo";
  repo.appendChild(externalLink("https://github.com/Ad1FPS/Skylark", "github.com/Ad1FPS/Skylark"));
  box.appendChild(repo);

  const sourcesTitle = document.createElement("div");
  sourcesTitle.className = "about-sources-title";
  sourcesTitle.textContent = "Data sources";
  box.appendChild(sourcesTitle);

  const sources = document.createElement("ul");
  sources.className = "about-sources";
  const add = (...parts: (string | Node)[]): void => {
    const line = document.createElement("li");
    for (const part of parts) line.append(part);
    sources.appendChild(line);
  };
  add("Weather data by ", externalLink("https://open-meteo.com/", "Open-Meteo.com"), ", licence ", externalLink(CC_BY, "CC BY 4.0"));
  add("Radar by ", externalLink("https://librewxr.net/", "LibreWXR"), ", ", externalLink(CC_BY, "CC BY 4.0"), "; Italian radar: Radar-DPC (Dipartimento della Protezione Civile)");
  add("Map data \u00A9 ", externalLink("https://www.openstreetmap.org/copyright", "OpenStreetMap contributors"));
  add("US alerts: ", externalLink("https://www.weather.gov/", "National Weather Service"));
  add("Canadian alerts: ", externalLink("https://weather.gc.ca/", "Environment and Climate Change Canada"));
  add("German alerts: Deutscher Wetterdienst via ", externalLink("https://brightsky.dev/", "Bright Sky"));
  add("European alerts: ", externalLink("https://meteoalarm.org", "MeteoAlarm (EUMETNET)"));
  add(
    "Region lookup: ",
    externalLink("https://nominatim.openstreetmap.org/", "Nominatim"),
    " \u00A9 ",
    externalLink("https://www.openstreetmap.org/copyright", "OpenStreetMap contributors"),
  );
  add("IP location: ", externalLink("https://ipwho.is/", "ipwho.is"));
  box.appendChild(sources);
}

function segmented(items: Seg[], onPick: (v: string) => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "seg";
  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `seg-btn${it.active ? " active" : ""}`;
    btn.textContent = it.label;
    btn.addEventListener("click", () => onPick(it.value));
    box.appendChild(btn);
  }
  return box;
}

function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const r = document.createElement("div");
  r.className = "settings-row";
  const text = document.createElement("div");
  text.className = "settings-label";
  text.textContent = label;
  if (hint) text.title = hint;
  r.append(text, control);
  return r;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const sec = document.createElement("section");
  sec.className = "settings-section";
  const head = document.createElement("div");
  head.className = "settings-section-title";
  head.textContent = title;
  sec.append(head, ...children);
  return sec;
}

function aboutSection(): HTMLElement {
  const sec = document.createElement("section");
  sec.className = "settings-section";
  const head = document.createElement("div");
  head.className = "settings-section-title";
  head.textContent = "About";
  sec.appendChild(head);
  appendAbout(sec);
  return sec;
}

function update(s: Settings): void {
  set({ settings: s });
  saveSettings(s);
}

function render(): void {
  if (!bodyEl) return;
  const s = state.settings;

  const units = section(
    "Units",
    row("Temperature", segmented([
      { label: "\u00B0C", value: "c", active: s.temp === "c" },
      { label: "\u00B0F", value: "f", active: s.temp === "f" },
    ], (v) => update({ ...state.settings, temp: v as Settings["temp"] }))),
    row("Wind", segmented([
      { label: "km/h", value: "kmh", active: s.wind === "kmh" },
      { label: "mph", value: "mph", active: s.wind === "mph" },
      { label: "m/s", value: "ms", active: s.wind === "ms" },
    ], (v) => update({ ...state.settings, wind: v as Settings["wind"] }))),
    row("Clock", segmented([
      { label: "24h", value: "24", active: s.clock === "24" },
      { label: "12h", value: "12", active: s.clock === "12" },
    ], (v) => update({ ...state.settings, clock: v as Settings["clock"] }))),
  );

  const appearance = section(
    "Appearance",
    row("Weather icons", segmented([
      { label: "Mono", value: "mono", active: s.icons === "mono" },
      { label: "Color", value: "color", active: s.icons === "color" },
    ], (v) => update({ ...state.settings, icons: v as Settings["icons"] }))),
    row("Frame rate", segmented([
      { label: "30 fps", value: "30", active: s.fps === "30" },
      { label: "60 fps", value: "60", active: s.fps === "60" },
    ], (v) => update({ ...state.settings, fps: v as Settings["fps"] }))),
  );

  const behaviour = section(
    "Behaviour",
    row(
      "Keep ready when closed",
      segmented([
        { label: "Off", value: "off", active: s.keepAlive === "off" },
        { label: "On", value: "on", active: s.keepAlive === "on" },
      ], (v) => update({ ...state.settings, keepAlive: v as Settings["keepAlive"] })),
      "On: closing the window only hides it, so it reopens instantly but about 110 MB stays in use. Off: the window is freed (about 6 MB) and takes a moment to reopen.",
    ),
  );
  // Only offered inside the real app; the browser preview has no autostart plugin.
  if (autostart !== null) {
    behaviour.appendChild(row(
      "Start with Windows",
      segmented([
        { label: "Off", value: "off", active: !autostart },
        { label: "On", value: "on", active: autostart },
      ], (v) => void setAutostart(v === "on")),
    ));
  }

  const coverage = document.createElement("div");
  coverage.className = "settings-note";
  coverage.textContent = "Official alerts are available for the US, Canada, Germany and 38 other European countries.";
  const alerts = section(
    "Alerts",
    row(
      "Alert notifications",
      segmented([
        { label: "Off", value: "off", active: s.alertNotifications === "off" },
        { label: "On", value: "on", active: s.alertNotifications === "on" },
      ], (v) => update({ ...state.settings, alertNotifications: v as Settings["alertNotifications"] })),
      "Show a system notification when a new official weather warning (moderate or worse) is issued for your current location. Available in the US, Canada, Germany and most of Europe.",
    ),
    coverage,
  );

  bodyEl.replaceChildren(units, appearance, behaviour, alerts, aboutSection());
  if (isOpen && !panel?.contains(document.activeElement)) panel?.focus();
}

async function setAutostart(on: boolean): Promise<void> {
  try {
    if (on) await enable();
    else await disable();
    autostart = (await isEnabled()) === true;
  } catch {
    /* keep the previous state */
  }
  if (isOpen) render();
}

function build(): void {
  const overlay = document.createElement("div");
  overlay.className = "settings-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "settings-panel";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.tabIndex = -1;

  const head = document.createElement("div");
  head.className = "settings-head";
  const title = document.createElement("h2");
  title.className = "settings-title";
  title.id = "settings-title";
  title.textContent = "Settings";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "settings-close";
  close.title = "Close";
  close.setAttribute("aria-label", "Close settings");
  close.innerHTML = icon("close", 16);
  close.addEventListener("click", closeSettings);
  head.append(title, close);

  const body = document.createElement("div");
  body.className = "settings-body";

  dialog.append(head, body);
  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSettings();
  });
  document.body.appendChild(overlay);

  backdrop = overlay;
  panel = dialog;
  bodyEl = body;
}

export function openSettings(from?: HTMLElement): void {
  if (!panel) build();
  trigger = from ?? document.querySelector<HTMLElement>(".titlebar-btn.settings");
  render();
  isOpen = true;
  backdrop?.classList.add("open");
  panel?.focus();
}

export function closeSettings(): void {
  if (!isOpen) return;
  isOpen = false;
  backdrop?.classList.remove("open");
  if (trigger?.isConnected) trigger.focus();
  trigger = null;
}

export function toggleSettings(from?: HTMLElement): void {
  if (isOpen) closeSettings();
  else openSettings(from);
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (isOpen && e.key === "Escape") {
    e.preventDefault();
    closeSettings();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "," || e.code === "Comma")) {
    e.preventDefault();
    if (isOpen) closeSettings();
    else openSettings();
  }
});

void isEnabled()
  .then((v) => {
    if (typeof v === "boolean") {
      autostart = v;
      if (isOpen) render();
    }
  })
  .catch(() => {});

subscribe((s) => {
  if (s.settings !== lastSettings) {
    lastSettings = s.settings;
    if (isOpen) render();
  }
});
