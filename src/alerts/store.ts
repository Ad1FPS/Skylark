import type { Alert } from "../api";
import { getAlerts } from "../api";
import type { Location } from "../types";

export const SEVERITY_ORDER = ["extreme", "severe", "moderate", "minor"] as const;

const COLORS: Record<Alert["severity"], string> = {
  minor: "#f5d76e",
  moderate: "#ff9f43",
  severe: "#ff5a4f",
  extreme: "#e0245e",
};

const FRESH_MS = 5 * 60 * 1000;

interface Entry {
  alerts: Alert[];
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Alert[]>>();
const subscribers = new Set<(loc: Location) => void>();

function keyOf(loc: Location): string {
  return `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
}

export function severityColor(sev: Alert["severity"]): string {
  return COLORS[sev] ?? COLORS.minor;
}

export function worstSeverity(alerts: Alert[]): Alert["severity"] | null {
  let best: Alert["severity"] | null = null;
  let bestRank: number = SEVERITY_ORDER.length;
  for (const a of alerts) {
    const rank = SEVERITY_ORDER.indexOf(a.severity);
    if (rank >= 0 && rank < bestRank) {
      bestRank = rank;
      best = a.severity;
    }
  }
  return best;
}

export function peekAlerts(loc: Location): Alert[] {
  return cache.get(keyOf(loc))?.alerts ?? [];
}

function signature(alerts: Alert[]): string {
  return alerts.map((a) => `${a.id}:${a.severity}`).join("|");
}

function notifyAll(loc: Location): void {
  for (const fn of subscribers) fn(loc);
}

export function loadAlerts(loc: Location, force?: boolean): Promise<Alert[]> {
  const key = keyOf(loc);
  const prev = cache.get(key);

  if (!force && prev && Date.now() - prev.at < FRESH_MS) {
    return Promise.resolve(prev.alerts);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const prevAlerts = prev?.alerts ?? [];

  const p = getAlerts(loc)
    .then(({ alerts }) => {
      const changed = signature(alerts) !== signature(prevAlerts);
      cache.set(key, { alerts, at: Date.now() });
      if (changed) notifyAll(loc);
      return alerts;
    })
    .catch(() => prevAlerts)
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}

export function onAlertsChange(fn: (loc: Location) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Compares two locations by the same key the cache uses. */
export function sameKey(a: Location, b: Location): boolean {
  return keyOf(a) === keyOf(b);
}
