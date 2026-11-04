import type { SceneInput } from "../scene";

const CONDITIONS: Array<[string, number]> = [
  ["Clear", 0],
  ["Partly cloudy", 2],
  ["Overcast", 3],
  ["Fog", 45],
  ["Drizzle", 53],
  ["Rain", 63],
  ["Heavy rain", 65],
  ["Snow", 73],
  ["Heavy snow", 75],
  ["Thunderstorm", 95],
];

/** Dev-only panel to preview every weather and time-of-day combination (http://localhost:1420/?fx=1). */
export function initFxDebug(apply: (input: SceneInput) => void): void {
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:999;width:210px;padding:10px;border-radius:12px;" +
    "background:rgba(0,0,0,.6);color:#fff;font:12px system-ui;display:grid;gap:6px";
  panel.innerHTML = `
    <select id="fxd-cond">${CONDITIONS.map(([n, c]) => `<option value="${c}">${n}</option>`).join("")}</select>
    <label><input id="fxd-night" type="checkbox"> Night</label>
    <label>Twilight <input id="fxd-tw" type="range" min="0" max="1" step="0.05" value="0"></label>
    <label>Wind km/h <input id="fxd-wind" type="range" min="0" max="80" step="1" value="10"></label>
    <select id="fxd-dir"><option value="270">West wind (blows right)</option><option value="90">East wind (blows left)</option></select>
    <pre id="fxd-stats" style="margin:0;font:11px monospace"></pre>`;
  document.body.appendChild(panel);

  const q = <T extends HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  const run = (): void =>
    apply({
      code: Number(q<HTMLSelectElement>("fxd-cond").value),
      isDay: !q<HTMLInputElement>("fxd-night").checked,
      precipitation: 0,
      windKmh: Number(q<HTMLInputElement>("fxd-wind").value),
      windFrom: Number(q<HTMLSelectElement>("fxd-dir").value),
      twilight: Number(q<HTMLInputElement>("fxd-tw").value),
    });
  panel.addEventListener("input", run);
  setInterval(() => {
    const stats = (window as unknown as Record<string, unknown>).__fxStats;
    q("fxd-stats").textContent = stats ? JSON.stringify(stats) : "";
  }, 500);
  run();
}
