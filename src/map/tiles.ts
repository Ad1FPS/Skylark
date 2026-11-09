/**
 * OSM tiles are proxied through Rust so the app can send its required User-Agent
 * and cache them on disk. Browser dev previews use the public tile server directly.
 */
export function osmTileUrl(z: number, x: number, y: number): string {
  const path = `${z}/${x}/${y}.png`;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return `http://osmtile.localhost/${path}`;
  }
  return `https://tile.openstreetmap.org/${path}`;
}
