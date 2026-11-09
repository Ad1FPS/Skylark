import { toggleSettings } from "./settings";

interface AppWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

const ICONS = {
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  min: '<svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>',
  max: '<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1" /></svg>',
  close: '<svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>',
};

function appWindow(): AppWindow | null {
  const w = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow(): AppWindow } } }).__TAURI__;
  return w?.window?.getCurrentWindow() ?? null;
}

/** Custom window chrome: the native frame is off, so the app draws its own drag area and buttons. */
export function createTitlebar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "titlebar";
  bar.setAttribute("data-tauri-drag-region", "");

  const controls = document.createElement("div");
  controls.className = "titlebar-controls";

  const settings = document.createElement("button");
  settings.className = "titlebar-btn settings";
  settings.type = "button";
  settings.title = "Settings";
  settings.setAttribute("aria-label", "Settings");
  settings.innerHTML = ICONS.settings;
  settings.addEventListener("click", () => toggleSettings(settings));
  controls.appendChild(settings);

  const actions: [keyof typeof ICONS, string, (w: AppWindow) => Promise<void>][] = [
    ["min", "Minimize", (w) => w.minimize()],
    ["max", "Maximize", (w) => w.toggleMaximize()],
    ["close", "Close", (w) => w.close()],
  ];
  for (const [key, label, run] of actions) {
    const b = document.createElement("button");
    b.className = `titlebar-btn${key === "close" ? " close" : ""}`;
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = ICONS[key];
    b.addEventListener("click", () => {
      const w = appWindow();
      if (w) void run(w);
    });
    controls.appendChild(b);
  }
  bar.appendChild(controls);
  return bar;
}
