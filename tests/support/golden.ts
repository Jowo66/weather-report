import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Activity, Context, EngineWeather, GarmentId } from '../../src/engine';

/** snake_case shapes as written by reference/thermo_ref.py --golden. */
export interface PyWeather {
  t_air: number;
  rh: number;
  wind_kmh: number;
  ghi: number;
  dni: number;
  dhi: number;
  sun_alt: number;
  precip_mm_h: number;
  snow_depth_m: number;
}
export interface PyContext {
  activity: Activity;
  shade: boolean;
  umbrella: boolean;
  personal_offset: number;
}
export interface PyZone {
  clo: number;
  wetness: number;
  t_felt: number;
  state: string;
  exposed: boolean;
  frostbite: string | null;
}
export interface PyResult {
  perceived: number;
  state: string;
  index: number;
  load_w_m2: number;
  required_wettedness: number;
  clo_total: number;
  clo_effective: number;
  v_rel: number;
  t_mrt: number;
  wet_area: number;
  humidex: number;
  wind_chill: number;
  zones: Record<string, PyZone>;
  flags: string[];
}
export interface PyEvalVector {
  id?: string;
  description?: string;
  input: { weather: PyWeather; outfit: GarmentId[]; context: PyContext };
  expected: PyResult;
}
export interface PyRecommendVector {
  input: { weather: PyWeather; context: PyContext };
  expected: {
    level: number;
    outfit: GarmentId[];
    perceived: number;
    state: string;
    met_target: boolean;
    cold_zones: string[];
    advice: string[];
  };
}
export interface GoldenFile {
  engine_version: string;
  reference_table: [number, number][];
  cases: PyEvalVector[];
  grid: PyEvalVector[];
  recommend: PyRecommendVector[];
}

export function loadGolden(): GoldenFile {
  const path = fileURLToPath(new URL('../../reference/golden_vectors.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as GoldenFile;
}

export function toWeather(w: PyWeather): EngineWeather {
  return {
    tAir: w.t_air,
    rh: w.rh,
    windKmh: w.wind_kmh,
    ghi: w.ghi,
    dni: w.dni,
    dhi: w.dhi,
    sunAlt: w.sun_alt,
    precipMmH: w.precip_mm_h,
    snowDepthM: w.snow_depth_m,
  };
}

export function toContext(c: PyContext): Context {
  return {
    activity: c.activity,
    shade: c.shade,
    umbrella: c.umbrella,
    personalOffset: c.personal_offset,
  };
}
