const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const J2000 = 2451545.0;
const SYNODIC = 29.530588853;

function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

function julianDay(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

/** Geocentric ecliptic longitude/latitude (degrees) and distance (km) of the Moon (Meeus ch. 47, truncated). */
function moonEcliptic(jd: number): { lon: number; lat: number; dist: number } {
  const T = (jd - J2000) / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  const d = D * RAD;
  const m = M * RAD;
  const mp = Mp * RAD;
  const f = F * RAD;

  // Main longitude terms (degrees).
  const lonTerms =
    6.288774 * Math.sin(mp) +
    1.274027 * Math.sin(2 * d - mp) +
    0.658314 * Math.sin(2 * d) +
    0.213618 * Math.sin(2 * mp) -
    0.185116 * E * Math.sin(m) -
    0.114332 * Math.sin(2 * f);
  const lon = norm360(Lp + lonTerms);

  // Main latitude terms (degrees).
  const lat =
    5.128122 * Math.sin(f) +
    0.280602 * Math.sin(mp + f) +
    0.277693 * Math.sin(mp - f) +
    0.173237 * Math.sin(2 * d - f);

  // Main distance terms (km): 385000.56 + sum.
  const distTerms =
    -20905.355 * Math.cos(mp) -
    3699.111 * Math.cos(2 * d - mp) -
    2955.968 * Math.cos(2 * d) -
    569.925 * Math.cos(2 * mp) +
    246.158 * E * Math.cos(m) -
    204.586 * Math.cos(2 * f);
  const dist = 385000.56 + distTerms;

  return { lon, lat, dist };
}

/** Apparent geocentric longitude of the Sun (degrees), Meeus ch. 25. */
function sunLongitude(jd: number): number {
  const T = (jd - J2000) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T);
  const M = norm360(357.52911 + 35999.05029 * T);
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M * RAD) +
    0.019993 * Math.sin(2 * M * RAD) +
    0.000289 * Math.sin(3 * M * RAD);
  return norm360(L0 + C);
}

/** Phase angle 0..1: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
function phaseOf(jd: number): number {
  const sun = sunLongitude(jd);
  const { lon } = moonEcliptic(jd);
  return norm360(lon - sun) / 360;
}

function illuminationOf(jd: number): number {
  const sun = sunLongitude(jd) * RAD;
  const { lon, lat, dist } = moonEcliptic(jd);
  const m = lon * RAD;
  const b = lat * RAD;
  // Elongation from the Sun as seen from Earth, corrected by the distances.
  const cosEl = Math.cos(b) * Math.cos(m - sun);
  const el = Math.acos(Math.max(-1, Math.min(1, cosEl)));
  const sunDist = 149597870.7;
  const phaseAngle = Math.atan2(sunDist * Math.sin(el), dist - sunDist * Math.cos(el));
  return (1 + Math.cos(phaseAngle)) / 2;
}

function phaseName(phase: number): string {
  const p = phase % 1;
  if (p < 0.02 || p >= 0.98) return "New Moon";
  if (p < 0.23) return "Waxing Crescent";
  if (p < 0.27) return "First Quarter";
  if (p < 0.48) return "Waxing Gibbous";
  if (p < 0.52) return "Full Moon";
  if (p < 0.73) return "Waning Gibbous";
  if (p < 0.77) return "Last Quarter";
  return "Waning Crescent";
}

/** Geocentric equatorial RA (hours) and Dec (degrees). */
function equatorial(jd: number): { ra: number; dec: number } {
  const { lon, lat } = moonEcliptic(jd);
  const T = (jd - J2000) / 36525;
  // Obliquity of the ecliptic.
  const eps = (23.439291 - 0.0130042 * T) * RAD;
  const l = lon * RAD;
  const b = lat * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
  return { ra: norm360(ra * DEG) / 15, dec: dec * DEG };
}

function siderealTime(jd: number): number {
  const T = (jd - J2000) / 36525;
  const gmst = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T;
  return norm360(gmst);
}

/** Altitude (degrees) of the Moon for the observer. */
function altitude(jd: number, latDeg: number, lonDeg: number): number {
  const { ra, dec } = equatorial(jd);
  const lst = norm360(siderealTime(jd) + lonDeg);
  const ha = norm360(lst - ra * 15) * RAD;
  const decR = dec * RAD;
  const latR = latDeg * RAD;
  const sinAlt =
    Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
}

const HORIZON = 0.125;

function findEvent(
  startMs: number,
  latDeg: number,
  lonDeg: number,
  wantRise: boolean,
): Date | null {
  const stepMs = 10 * 60 * 1000;
  let prevMs = startMs;
  let prevAlt = altitude(julianDay(new Date(prevMs)), latDeg, lonDeg) - HORIZON;
  const end = startMs + 24 * 3600 * 1000;
  while (prevMs < end) {
    const ms = prevMs + stepMs;
    const alt = altitude(julianDay(new Date(ms)), latDeg, lonDeg) - HORIZON;
    const rising = prevAlt < 0 && alt >= 0;
    const setting = prevAlt >= 0 && alt < 0;
    if (wantRise ? rising : setting) {
      // Linear interpolation for the crossing.
      const t = prevAlt / (prevAlt - alt);
      const cross = prevMs + t * stepMs;
      return new Date(Math.round(cross / 60000) * 60000);
    }
    prevMs = ms;
    prevAlt = alt;
  }
  return null;
}

function refinePhase(fromMs: number, target: number): Date {
  // Bisection on the wrapped phase difference to `target`.
  const phaseAbs = (ms: number): number => {
    const jd = julianDay(new Date(ms));
    return phaseOf(jd);
  };
  const diff = (ms: number): number => {
    let d = phaseAbs(ms) - target;
    while (d < -0.5) d += 1;
    while (d >= 0.5) d -= 1;
    return d;
  };
  let lo = fromMs;
  let hi = fromMs + 12 * 3600 * 1000;
  // Expand until the difference flips sign at the target crossing.
  let guard = 0;
  while (diff(lo) > 0 && guard++ < 400) {
    lo -= 3600 * 1000;
  }
  while (diff(hi) < 0 && guard++ < 400) {
    hi += 3600 * 1000;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (diff(mid) < 0) lo = mid;
    else hi = mid;
    if (hi - lo < 60 * 1000) break;
  }
  return new Date(Math.round((lo + hi) / 2 / 60000) * 60000);
}

function nextPhase(from: Date, target: number): Date {
  // target: 0.5 (full) or 0.0 (new). Step forward in 6 h steps until we pass it.
  const startMs = from.getTime();
  const stepMs = 6 * 3600 * 1000;
  const phase = (ms: number): number => phaseOf(julianDay(new Date(ms)));
  const rel = (p: number): number => {
    let d = p - target;
    while (d < 0) d += 1;
    while (d >= 1) d -= 1;
    return d;
  };
  let prevMs = startMs;
  let prev = rel(phase(prevMs));
  const maxMs = startMs + 40 * 24 * 3600 * 1000;
  while (prevMs < maxMs) {
    const ms = prevMs + stepMs;
    const cur = rel(phase(ms));
    if (cur < prev) {
      // Wrapped past the target: refine between the two samples.
      return refinePhase(prevMs, target);
    }
    prevMs = ms;
    prev = cur;
  }
  return new Date(startMs + SYNODIC * 86400000);
}

export interface MoonInfo {
  phase: number;
  illumination: number;
  waxing: boolean;
  name: string;
  distanceKm: number;
  moonrise: Date | null;
  moonset: Date | null;
  nextFullMoon: Date;
  nextNewMoon: Date;
}

export function moonInfo(at: Date, latDeg: number, lonDeg: number, utcOffsetSeconds: number): MoonInfo {
  const jd = julianDay(at);
  const phase = phaseOf(jd);
  const { dist } = moonEcliptic(jd);

  // Local calendar day: midnight local = UTC midnight of the shifted date minus offset.
  const shifted = new Date(at.getTime() + utcOffsetSeconds * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const localMidnightUtc = Date.UTC(year, month, day) - utcOffsetSeconds * 1000;

  const moonrise = findEvent(localMidnightUtc, latDeg, lonDeg, true);
  const moonset = findEvent(localMidnightUtc, latDeg, lonDeg, false);

  return {
    phase,
    illumination: illuminationOf(jd),
    waxing: phase < 0.5,
    name: phaseName(phase),
    distanceKm: dist,
    moonrise,
    moonset,
    nextFullMoon: nextPhase(at, 0.5),
    nextNewMoon: nextPhase(at, 0.0),
  };
}
