import type { EngineConfig } from './constants';
import type { ComfortState, ZoneId, ZoneState } from './types';

/** Perceived °C lower bounds, hottest first (TDD §4.11). */
export const COMFORT_BANDS: readonly (readonly [number, ComfortState])[] = [
  [40, 'dangerous_heat'],
  [34, 'overheated'],
  [29, 'hot'],
  [26, 'warm'],
  [20, 'comfortable'],
  [15, 'cool'],
  [8, 'chilly'],
  [0, 'cold'],
  [-10, 'very_cold'],
  [-Infinity, 'freezing'],
];

export const ZONE_BANDS: readonly (readonly [number, ZoneState])[] = [
  [34, 'hot'],
  [28, 'warm'],
  [10, 'ok'],
  [0, 'cool'],
  [-10, 'cold'],
  [-25, 'freezing'],
  [-Infinity, 'numb'],
];

export function comfortState(perceived: number): ComfortState {
  for (const [lo, s] of COMFORT_BANDS) if (perceived >= lo) return s;
  return 'freezing';
}

/** Zone state; the tolerance applies on the cold side only (tFelt < 10). */
export function zoneState(tFelt: number, z: ZoneId, cfg: EngineConfig): ZoneState {
  const t = tFelt < 10 ? tFelt + cfg.zoneTolerance[z] : tFelt;
  for (const [lo, s] of ZONE_BANDS) if (t >= lo) return s;
  return 'numb';
}
