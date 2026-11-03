import type { Layer } from "./types";
import { createClouds } from "./clouds";
import { createStars } from "./stars";

/** Back to front draw order. */
export function createLayers(): Layer[] {
  return [createStars(), createClouds()];
}
