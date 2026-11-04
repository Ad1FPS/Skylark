import { CALM_SCENE, type Fx, type Layer, type Scene } from "./types";
import { createLayers } from "./layers";

const MAX_PIXELS = 1_000_000;
const MAX_FPS = 30;
const UNFOCUSED_FPS = 15;
const SETTLE = 0.005;
const QUALITY_STEPS = [1, 0.6, 0.35, 0.25];

const SCENE_KEYS = Object.keys(CALM_SCENE) as (keyof Scene)[];

/** Move every scene field a bit toward the target. */
function ease(current: Scene, target: Scene, dt: number): void {
  const k = 1 - Math.exp(-dt / 1.2);
  for (const key of SCENE_KEYS) {
    const c = current[key];
    const t = target[key];
    if (Math.abs(t - c) < 1e-4) current[key] = t;
    else current[key] = c + (t - c) * k;
  }
}

function settled(current: Scene, target: Scene): boolean {
  for (const key of SCENE_KEYS) if (Math.abs(current[key] - target[key]) > SETTLE) return false;
  return true;
}

export function createFx(parent: HTMLElement): Fx {
  const canvas = document.createElement("canvas");
  canvas.className = "fx";
  canvas.setAttribute("aria-hidden", "true");
  parent.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const layers: Layer[] = createLayers();

  const current: Scene = { ...CALM_SCENE };
  const target: Scene = { ...CALM_SCENE };

  // WebView2 reports reduce when Windows "Show animations" is off, so the OS flag is ignored here;
  // only a deliberate dev override (?still) gives the single static pose.
  const reduced = location.search.includes("still");

  let enabled = true;
  let rendered = false;
  let raf = 0;
  let lastFrame = 0;
  let lastRealtime = 0;
  let cssW = 1;
  let cssH = 1;

  // Quality governor.
  let quality = 1;
  let qualityFrame = 0;
  let qualitySum = 0;

  // Dev stats.
  let frameCount = 0;
  let statTime = 0;
  let avgMs = 0;

  function resize(): void {
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    cssW = w;
    cssH = h;
    let scale = 1;
    if (w * h > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (w * h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(canvas.width / w, canvas.height / h);
    }
    for (const layer of layers) layer.resize(w, h);
    // Resizing the bitmap clears it; repaint at once so there is no blank frame.
    if (rendered) drawOnce();
    wake();
  }

  function clear(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
  }

  function drawOnce(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    for (const layer of layers) {
      if (layer.fps(current) > 0) layer.draw(ctx);
    }
  }

  function frame(now: number): void {
    raf = 0;
    if (!enabled || document.hidden) return;

    const wanted = wantedFps();
    if (wanted <= 0 && settled(current, target)) {
      clear();
      rendered = false;
      return;
    }

    const interval = wanted > 0 ? 1000 / wanted : 0;
    if (lastFrame && now - lastFrame < interval - 1) {
      schedule();
      return;
    }

    const real = lastRealtime ? (now - lastRealtime) / 1000 : 0;
    lastRealtime = now;
    const dt = Math.min(0.1, Math.max(0, real || 1 / maxFpsOfLayers()));
    lastFrame = now;

    if (real > 0) ease(current, target, dt);

    const t0 = performance.now();
    for (const layer of layers) {
      if (layer.fps(current) > 0) layer.update(dt, current, quality);
    }
    drawOnce();
    measure(performance.now() - t0);

    rendered = true;
    frameCount++;
    if (now - statTime > 1000) publishStats(now);

    schedule();
  }

  function measure(ms: number): void {
    qualitySum += ms;
    qualityFrame++;
    if (qualityFrame < 45) return;
    avgMs = qualitySum / qualityFrame;
    if (avgMs > 4) {
      const idx = QUALITY_STEPS.indexOf(quality);
      if (idx >= 0 && idx < QUALITY_STEPS.length - 1) quality = QUALITY_STEPS[idx + 1];
    }
    qualitySum = 0;
    qualityFrame = 0;
  }

  function maxFpsOfLayers(): number {
    let max = 0;
    for (const layer of layers) {
      const f = layer.fps(current);
      if (f > max) max = f;
    }
    return max || 1;
  }

  function wantedFps(): number {
    let wanted = 0;
    for (const layer of layers) {
      const f = layer.fps(current);
      if (f > wanted) wanted = f;
    }
    if (wanted > MAX_FPS) wanted = MAX_FPS;
    if (document.hasFocus && !document.hasFocus() && wanted > UNFOCUSED_FPS) wanted = UNFOCUSED_FPS;
    return wanted;
  }

  function schedule(): void {
    if (raf || !enabled || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  function wake(): void {
    if (!enabled || document.hidden) return;
    if (reduced) {
      reducedPose();
      return;
    }
    schedule();
  }

  /** Reduced motion: jump to the target, give the layers a natural pose, draw once, stop. */
  function reducedPose(): void {
    Object.assign(current, target);
    for (let i = 0; i < 30; i++) {
      for (const layer of layers) {
        if (layer.fps(current) > 0) layer.update(0.1, current, quality);
      }
    }
    drawOnce();
    rendered = true;
    lastFrame = 0;
    lastRealtime = 0;
  }

  function publishStats(now: number): void {
    if (!import.meta.env.DEV) return;
    const fps = (frameCount * 1000) / (now - statTime);
    const stats = { fps: Math.round(fps), avgMs: Math.round(avgMs * 100) / 100, quality, layers };
    (window as unknown as Record<string, unknown>).__fxStats = stats;
    frameCount = 0;
    statTime = now;
  }

  // While the window is dragged the old bitmap just stretches; the real resize waits for it to settle.
  let resizeTimer = 0;
  const observer = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });
  observer.observe(parent);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      lastFrame = 0;
      lastRealtime = 0;
      wake();
    }
  });

  window.addEventListener("focus", () => {
    lastFrame = 0;
    wake();
  });

  resize();

  return {
    setScene(scene: Scene): void {
      Object.assign(target, scene);
      if (!rendered) Object.assign(current, target);
      lastFrame = 0;
      wake();
    },
    setEnabled(on: boolean): void {
      enabled = on;
      canvas.style.display = on ? "" : "none";
      if (!on) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        clear();
        rendered = false;
      } else {
        resize();
      }
    },
  };
}
