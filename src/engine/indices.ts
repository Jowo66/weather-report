import type { FrostbiteRisk } from './types';

/** Saturation vapour pressure over water, kPa (Magnus–Tetens). */
export function pSat(t: number): number {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
}

/** ECCC wind chill. Reported only when T ≤ 0 °C and wind ≥ 5 km/h; otherwise returns T. */
export function windChill(t: number, windKmh: number): number {
  if (t > 0 || windKmh < 5) return t;
  const v = windKmh ** 0.16;
  return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v;
}

export function windChillReported(t: number, windKmh: number): boolean {
  return t <= 0 && windKmh >= 5;
}

/** ECCC humidex. */
export function humidex(t: number, rh: number): number {
  const e = (6.112 * 10 ** ((7.5 * t) / (237.7 + t)) * rh) / 100;
  return t + 0.5555 * (e - 10);
}

/** ECCC wind-chill risk tiers for exposed skin. */
export function frostbiteRisk(wc: number): FrostbiteRisk {
  if (wc > -28) return null;
  if (wc > -40) return 'high';
  if (wc > -48) return 'very_high';
  if (wc > -55) return 'severe';
  return 'extreme';
}

/** "Forecast feels-like" display rule (TDD §4.11). */
export function forecastFeelsLike(t: number, rh: number, windKmh: number): number {
  if (windChillReported(t, windKmh)) return windChill(t, windKmh);
  const hx = humidex(t, rh);
  if (t >= 20 && hx >= 25) return hx;
  return t;
}
