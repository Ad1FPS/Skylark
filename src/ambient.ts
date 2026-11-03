import "./styles/ambient.css";
import type { Kind } from "./theme";

let root: HTMLDivElement | null = null;
let lastKey = "";

/** Deterministic 0..1 generator (mulberry32) so positions never churn between renders. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stars(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "amb-stars";
  const rand = rng(1337);
  const group = (cls: string, n: number): string => {
    const shadows: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = (rand() * 100).toFixed(2);
      const y = (rand() * 70).toFixed(2);
      shadows.push(`${x}vw ${y}vh 0 0 rgba(255,255,255,${(0.4 + rand() * 0.4).toFixed(2)})`);
    }
    const g = document.createElement("div");
    g.className = cls;
    g.style.boxShadow = shadows.join(", ");
    el.appendChild(g);
    return cls;
  };
  group("amb-stars-a", 20);
  group("amb-stars-b", 20);
  return el;
}

function clouds(count: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "amb-clouds";
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "amb-cloud";
    c.style.top = `${5 + i * (80 / count) + (i % 2 ? 4 : 0)}%`;
    c.style.animationDuration = `${90 + i * 18}s`;
    c.style.animationDelay = `${-i * 7}s`;
    el.appendChild(c);
  }
  return el;
}

function bands(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "amb-fog";
  for (let i = 0; i < 3; i++) {
    const b = document.createElement("div");
    b.className = i % 2 ? "amb-band alt" : "amb-band";
    b.style.top = `${18 + i * 26}%`;
    b.style.animationDuration = `${70 + i * 25}s`;
    el.appendChild(b);
  }
  return el;
}

function rain(kind: Kind): HTMLDivElement {
  const el = document.createElement("div");
  el.className = kind === "storm" ? "amb-rain storm" : `amb-rain ${kind}`;
  for (let i = 0; i < 2; i++) {
    const layer = document.createElement("div");
    layer.className = i ? "amb-rain-layer far" : "amb-rain-layer";
    el.appendChild(layer);
  }
  return el;
}

function snow(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "amb-snow";
  for (let i = 0; i < 2; i++) {
    const layer = document.createElement("div");
    layer.className = i ? "amb-snow-layer big" : "amb-snow-layer";
    el.appendChild(layer);
  }
  return el;
}

function build(kind: Kind, isDay: boolean): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = `amb-layer amb-${kind}${isDay ? " day" : " night"}`;
  switch (kind) {
    case "clear":
      wrap.appendChild(isDay ? Object.assign(document.createElement("div"), { className: "amb-glow" }) : stars());
      break;
    case "partly":
      wrap.appendChild(clouds(3));
      break;
    case "cloudy":
      wrap.appendChild(clouds(5));
      break;
    case "fog":
      wrap.appendChild(bands());
      break;
    case "drizzle":
    case "rain":
      wrap.appendChild(rain(kind));
      break;
    case "snow":
      wrap.appendChild(snow());
      break;
    case "storm":
      wrap.appendChild(rain(kind));
      wrap.appendChild(Object.assign(document.createElement("div"), { className: "amb-flash" }));
      break;
  }
  return wrap;
}

export function setAmbient(kind: Kind, isDay: boolean): void {
  const key = `${kind}-${isDay}`;
  if (root && key === lastKey) return;
  lastKey = key;

  if (!root) {
    root = document.createElement("div");
    root.className = "ambient";
    root.setAttribute("aria-hidden", "true");
    const sky = document.querySelector(".sky");
    if (sky?.parentNode === document.body) sky.after(root);
    else document.body.appendChild(root);
    if (document.visibilityState === "hidden") root.classList.add("paused");
    document.addEventListener("visibilitychange", () => {
      root?.classList.toggle("paused", document.visibilityState === "hidden");
    });
  }

  const next = build(kind, isDay);
  const old = root.lastElementChild;
  root.appendChild(next);
  if (!old) return;
  old.classList.add("out");
  const done = () => old.remove();
  old.addEventListener("transitionend", done, { once: true });
  window.setTimeout(done, 700);
}
