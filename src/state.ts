import type { Location, Settings, WeatherBundle } from "./types";
import { loadSettings } from "./format";

/**
 * Lifecycle of the weather shown in the main pane. Exactly one phase at a time; every transition
 * happens in `loadWeather` in main.ts, and `#main[data-phase]` mirrors it for tests and tools.
 *
 *   idle ──select──▶ loading ──ok──▶ ready ──refresh──▶ loading ──fail──▶ ready (last bundle kept)
 *                       │                                  │
 *                       └──fail (no data at all)──▶ error ◀┘ (a refresh from error that fails stays error)
 *
 * A newer load always supersedes an older one: answers for a superseded load are dropped.
 * While loading, `bundle` may still hold cached or previous data, which stays on screen.
 */
export type LoadState =
  | { phase: "idle" }
  | { phase: "loading"; loc: Location }
  | { phase: "ready"; loc: Location }
  | { phase: "error"; loc: Location; message: string };

export interface State {
  settings: Settings;
  saved: Location[];
  current: Location | null;
  bundle: WeatherBundle | null;
  load: LoadState;
}

export const state: State = {
  settings: loadSettings(),
  saved: [],
  current: null,
  bundle: null,
  load: { phase: "idle" },
};

type Listener = (s: State) => void;
const listeners: Listener[] = [];

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

export function set(partial: Partial<State>): void {
  Object.assign(state, partial);
  for (const fn of listeners) fn(state);
}
