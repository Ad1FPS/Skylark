import { invoke } from "@tauri-apps/api/core";
import type { Location, WeatherBundle } from "./types";

export function searchCity(query: string): Promise<Location[]> {
  return invoke<Location[]>("search_city", { query });
}

export function getCached(location: Location): Promise<WeatherBundle | null> {
  return invoke<WeatherBundle | null>("get_cached", { location });
}

export function getWeather(location: Location, force: boolean): Promise<WeatherBundle> {
  return invoke<WeatherBundle>("get_weather", { location, force });
}

export function getSaved(): Promise<Location[]> {
  return invoke<Location[]>("get_saved");
}

export function saveLocation(location: Location): Promise<Location[]> {
  return invoke<Location[]>("save_location", { location });
}

export function removeLocation(latitude: number, longitude: number): Promise<Location[]> {
  return invoke<Location[]>("remove_location", { latitude, longitude });
}

export function locateIp(): Promise<Location> {
  return invoke<Location>("locate_ip");
}

export function setCurrentLocation(location: Location): Promise<void> {
  return invoke<void>("set_current_location", { location });
}
