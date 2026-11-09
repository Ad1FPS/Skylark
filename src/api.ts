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

export async function getNormal(lat: number, lon: number, date: string): Promise<number | null> {
  try {
    const v = await invoke<number | null>("get_normal", { latitude: lat, longitude: lon, date });
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export interface WindGrid {
  times: number[];
  cols: number;
  rows: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  u: number[][];
  v: number[][];
}

export async function getWindGrid(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  cols: number,
  rows: number,
): Promise<WindGrid | null> {
  try {
    const grid = await invoke<WindGrid>("get_wind_grid", { latMin, latMax, lonMin, lonMax, cols, rows });
    return grid && Array.isArray(grid.times) && grid.times.length > 0 ? grid : null;
  } catch {
    return null;
  }
}

export interface Alert {
  id: string;
  event: string;
  severity: "minor" | "moderate" | "severe" | "extreme";
  headline: string;
  description: string;
  instruction: string | null;
  onset: number | null;
  ends: number | null;
  sender: string;
  source: string;
}

export interface AlertsResponse {
  /** False when the location's country has no official alert provider. */
  covered: boolean;
  alerts: Alert[];
}

export async function getAlerts(location: Location): Promise<AlertsResponse> {
  try {
    const response = await invoke<AlertsResponse>("get_alerts", { location });
    const alerts = Array.isArray(response?.alerts) ? response.alerts : [];
    return { covered: response?.covered === true, alerts };
  } catch {
    // Leave coverage optimistic on failures so a network error is not mistaken for an unsupported country.
    return { covered: true, alerts: [] };
  }
}

/** Tells the backend whether closing the window should only hide it. */
export async function setKeepAlive(on: boolean): Promise<void> {
  try {
    await invoke<void>("set_keep_alive", { on });
  } catch {
    /* not running inside the app */
  }
}

/** Tells the backend whether new official alerts should raise a system notification. */
export async function setAlertNotifications(on: boolean): Promise<void> {
  try {
    await invoke<void>("set_alert_notifications", { on });
  } catch {
    /* not running inside the app */
  }
}
