interface AppWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

const ICONS = {
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
