import type { Location, Settings, WeatherBundle } from "./types";
import { loadSettings } from "./format";

export interface State {
  settings: Settings;
  saved: Location[];
  current: Location | null;
  bundle: WeatherBundle | null;
  loading: boolean;
  error: string | null;
}

export const state: State = {
  settings: loadSettings(),
  saved: [],
  current: null,
  bundle: null,
  loading: false,
  error: null,
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
