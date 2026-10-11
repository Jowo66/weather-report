import raw from './backdrops.json';

export type Backdrop = 'city' | 'arctic' | 'beach';
export type BackdropPref = Backdrop | 'auto';

export interface BackdropConditions {
  tAir: number;
  snowDepthM: number;
  isDay: boolean;
  cloudCover: number;
  precipMmH: number;
  /** WMO code; 0–1 is clear / mainly clear. */
  weatherCode: number;
}

interface Rule {
  backdrop: Backdrop;
  when: Partial<{
    snowDepthMGt: number;
    tAirLte: number;
    tAirGte: number;
    isDay: boolean;
    cloudCoverLt: number;
    precipMmHLt: number;
    /** Clear or mainly clear (WMO 0–1), or under 40% cloud, and dry. */
    sunny: boolean;
  }>;
}

const CONFIG = raw as { default: Backdrop; rules: Rule[] };

function matches(r: Rule, c: BackdropConditions): boolean {
  const w = r.when;
  if (w.snowDepthMGt !== undefined && !(c.snowDepthM > w.snowDepthMGt)) return false;
  if (w.tAirLte !== undefined && !(c.tAir <= w.tAirLte)) return false;
  if (w.tAirGte !== undefined && !(c.tAir >= w.tAirGte)) return false;
  if (w.isDay !== undefined && c.isDay !== w.isDay) return false;
  if (w.cloudCoverLt !== undefined && !(c.cloudCover < w.cloudCoverLt)) return false;
  if (w.precipMmHLt !== undefined && !(c.precipMmH < w.precipMmHLt)) return false;
  if (w.sunny !== undefined) {
    const sunny = (c.weatherCode <= 1 || c.cloudCover < 40) && c.precipMmH < 0.1;
    if (sunny !== w.sunny) return false;
  }
  return true;
}

/** Backdrop from conditions (TDD §8.6): first matching rule, else the default. Visual only. */
export function chooseBackdrop(
  c: BackdropConditions | null,
  pref: BackdropPref = 'auto',
): Backdrop {
  if (pref !== 'auto') return pref;
  if (!c) return CONFIG.default;
  return CONFIG.rules.find((r) => matches(r, c))?.backdrop ?? CONFIG.default;
}
