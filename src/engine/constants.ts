import type { Activity, GarmentId, ZoneId } from './types';

/** Mirrors ENGINE_VERSION in reference/thermo_ref.py. */
export const ENGINE_VERSION = '3.0.0';

export const ZONE_IDS: readonly ZoneId[] = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'];

/**
 * Every tunable constant of the model (TDD §4.3). The calibration panel (T-24)
 * overrides these through `Partial<EngineConfig>`.
 */
export interface EngineConfig {
  zoneArea: Record<ZoneId, number>;
  CLO: number;
  LR: number;
  H_R: number;
  SIGMA_SKIN_DIFF: number;
  WIND_HEIGHT_FACTOR: number;
  V_MIN: number;
  I_M_SKIN: number;
  REF_V: number;
  REF_V_ZONE: number;
  REF_RH: number;
  REF_MET: number;
  REF_OUTFIT: readonly GarmentId[];
  R_TISSUE: number;
  VASO_START: number;
  VASO_GAIN: number;
  VASO_MAX: number;
  WET_SATURATION_MM_H: number;
  SNOW_WETTING_FACTOR: number;
  UMBRELLA_UPPER_FACTOR: number;
  RAIN_EVAP_EFFICIENCY: number;
  WIND_PENETRATION: number;
  WIND_PENETRATION_WP: number;
  WET_CHILL: number;
  activity: Record<Activity, { met: number; vWalk: number }>;
  zoneTolerance: Record<ZoneId, number>;
}

const DEFAULTS: EngineConfig = {
  zoneArea: { head: 0.09, torso: 0.37, arms: 0.13, hands: 0.05, legs: 0.29, feet: 0.07 },
  CLO: 0.155,
  LR: 16.5,
  H_R: 4.7,
  SIGMA_SKIN_DIFF: 0.06,
  WIND_HEIGHT_FACTOR: 0.67,
  V_MIN: 0.5,
  I_M_SKIN: 1.0,
  REF_V: 0.5,
  REF_V_ZONE: 1.34,
  REF_RH: 50.0,
  REF_MET: 1.2,
  REF_OUTFIT: ['t_shirt', 'jeans', 'socks', 'sneakers'],
  R_TISSUE: 0.09,
  VASO_START: 17.0,
  VASO_GAIN: 0.3,
  VASO_MAX: 5.0,
  WET_SATURATION_MM_H: 2.0,
  SNOW_WETTING_FACTOR: 0.3,
  UMBRELLA_UPPER_FACTOR: 0.2,
  RAIN_EVAP_EFFICIENCY: 0.3,
  WIND_PENETRATION: 0.4,
  WIND_PENETRATION_WP: 0.1,
  WET_CHILL: 2.0,
  activity: {
    standing: { met: 1.2, vWalk: 0.0 },
    strolling: { met: 1.6, vWalk: 0.6 },
    walking: { met: 2.0, vWalk: 0.9 },
  },
  zoneTolerance: { hands: -3.0, feet: -3.0, head: 0.0, torso: 0.0, arms: 3.0, legs: 3.0 },
};

export const DEFAULT_CONFIG: Readonly<EngineConfig> = Object.freeze(DEFAULTS);

const resolved = new Map<string, EngineConfig>();

/**
 * Merge overrides onto the defaults. Results are memoised by value so the reference table
 * (keyed by config identity) is built once per distinct calibration, not once per call.
 */
export function resolveConfig(cfg?: Partial<EngineConfig>): EngineConfig {
  if (!cfg || Object.keys(cfg).length === 0) return DEFAULT_CONFIG;
  const key = JSON.stringify(cfg);
  let r = resolved.get(key);
  if (!r) {
    r = { ...DEFAULT_CONFIG, ...cfg };
    if (resolved.size > 64) resolved.clear();
    resolved.set(key, r);
  }
  return r;
}
