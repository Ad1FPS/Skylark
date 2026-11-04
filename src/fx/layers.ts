import type { Layer } from "./types";
import { createGlow } from "./glow";
import { createStars } from "./stars";
import { createClouds } from "./clouds";
import { createFog } from "./fog";
import { createRain } from "./rain";
import { createSnow } from "./snow";
import { createLightning } from "./lightning";

/** Back to front draw order. */
export function createLayers(): Layer[] {
  return [createGlow(), createStars(), createClouds(), createFog(), createRain(), createSnow(), createLightning()];
}
