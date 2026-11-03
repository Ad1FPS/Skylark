/** Everything the animated background needs to know, all fields 0..1 unless noted. */
export interface Scene {
  /** Star visibility: night and a clear-ish sky. */
  stars: number;
  /** Cloud coverage. */
  clouds: number;
  /** How dark and grey the clouds are (rain, storm). */
  cloudDark: number;
  rain: number;
  snow: number;
  fog: number;
  /** Lightning frequency and strength. */
  lightning: number;
  /** Daytime sun glow (clear skies only). */
  sun: number;
  /** Dawn and dusk horizon glow. */
  twilight: number;
  /** Signed horizontal wind: negative blows left, positive blows right, magnitude is strength. */
  wind: number;
  /** Absolute wind strength. */
  windSpeed: number;
  /** 1 by day, 0 by night. Layers use this (not a boolean) so everything crossfades at dusk. */
  daylight: number;
}

export const CALM_SCENE: Scene = {
  stars: 0,
  clouds: 0,
  cloudDark: 0,
  rain: 0,
  snow: 0,
  fog: 0,
  lightning: 0,
  sun: 0,
  twilight: 0,
  wind: 0,
  windSpeed: 0,
  daylight: 1,
};

/** One independently animated effect (clouds, rain, stars, ...). The engine owns the canvas and the loop. */
export interface Layer {
  /** Frame rate this layer needs for the scene right now. 0 means it has nothing to draw. */
  fps(scene: Scene): number;
  /** Canvas size in CSS pixels. Called on creation and on every resize. */
  resize(width: number, height: number): void;
  /** Advance by `dt` seconds. `quality` is a particle budget multiplier in 0.25..1. */
  update(dt: number, scene: Scene, quality: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface Fx {
  /** Ease toward a new scene over about a second or two. */
  setScene(scene: Scene): void;
  /** Start or stop all rendering. Stopping also clears the canvas. */
  setEnabled(on: boolean): void;
}
