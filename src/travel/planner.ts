import { GARMENT_BY_ID } from '../data/garments';
import {
  evaluate,
  recommend,
  type Activity,
  type ComfortState,
  type EngineWeather,
  type GarmentId,
} from '../engine';
import type { NormalDay, DayPart } from '../services/climateNormals';
import { DAY_PART_HOURS } from '../services/climateNormals';
import type { Forecast } from '../services/types';
import { localParts, localIsoDate } from './time';

export type TripProfile = 'walking' | 'mixed' | 'static';
export const PROFILE_ACTIVITY: Record<TripProfile, Activity> = {
  walking: 'walking',
  mixed: 'strolling',
  static: 'standing',
};

export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening'];

export interface PartConditions {
  weather: EngineWeather;
  /** For P25–P75 ranges on normal days; equal to tAir for forecast days. */
  tLow: number;
  tHigh: number;
  uvIndex: number;
}

export interface DayConditions {
  date: string;
  source: 'forecast' | 'normal';
  parts: Record<DayPart, PartConditions>;
  precipProbability: number;
  uvMax: number;
}

export interface PartPlan {
  outfit: GarmentId[];
  perceived: number;
  perceivedLow: number;
  perceivedHigh: number;
  state: ComfortState;
}

export interface DayPlan {
  date: string;
  source: 'forecast' | 'normal';
  parts: Record<DayPart, PartPlan>;
  /** The warmest part's outfit: what you leave the house with (one item per slot). */
  outfit: GarmentId[];
  /** Union of every part's outfit: what the day needs packed. */
  items: GarmentId[];
  /** Changes for the other parts relative to `outfit`, e.g. "afternoon: take off the sweater". */
  notes: { part: DayPart; add: GarmentId[]; remove: GarmentId[] }[];
  precipProbability: number;
  uvMax: number;
}

/** Day conditions from the hourly forecast at local 08:00 / 14:00 / 20:00. */
export function forecastDay(f: Forecast, date: string): DayConditions | null {
  const parts = {} as Record<DayPart, PartConditions>;
  for (const part of DAY_PARTS) {
    const hour = DAY_PART_HOURS[part];
    const s = f.hourly.find((h) => {
      const lp = localParts(h.time, f.timezone);
      return localIsoDate(h.time, f.timezone) === date && lp.hour === hour;
    });
    if (!s) return null;
    parts[part] = {
      weather: {
        tAir: s.tAir,
        rh: s.rh,
        windKmh: s.windKmh,
        ghi: s.ghi,
        dni: s.dni,
        dhi: s.dhi,
        sunAlt: s.sunAltDeg,
        precipMmH: s.precipMmH,
        snowDepthM: s.snowDepthM,
      },
      tLow: s.tAir,
      tHigh: s.tAir,
      uvIndex: s.uvIndex,
    };
  }
  const daily = f.daily.find((d) => localIsoDate(d.time + 12 * 3600, f.timezone) === date);
  return {
    date,
    source: 'forecast',
    parts,
    precipProbability: (daily?.precipProbabilityMax ?? 0) / 100,
    uvMax: daily?.uvIndexMax ?? Math.max(...DAY_PARTS.map((p) => parts[p].uvIndex)),
  };
}

export function normalDay(n: NormalDay): DayConditions {
  const parts = {} as Record<DayPart, PartConditions>;
  for (const part of DAY_PARTS) {
    const p = n.parts[part];
    const ok = Number.isFinite(p.t50);
    parts[part] = {
      weather: {
        tAir: ok ? p.t50 : 15,
        rh: Number.isFinite(p.rh) ? p.rh : 60,
        windKmh: Number.isFinite(p.windKmh) ? p.windKmh : 10,
        ghi: Number.isFinite(p.ghi) ? p.ghi : 0,
        dni: Number.isFinite(p.dni) ? p.dni : 0,
        dhi: Number.isFinite(p.dhi) ? p.dhi : 0,
        sunAlt: p.sunAltDeg,
        // Typical hour is usually dry; rain gear comes from the probability in packing extras.
        precipMmH: Number.isFinite(p.precipMmH) ? p.precipMmH : 0,
        snowDepthM: Number.isFinite(p.snowDepthM) ? p.snowDepthM : 0,
      },
      tLow: ok ? p.t25 : 15,
      tHigh: ok ? p.t75 : 15,
      uvIndex: p.ghi / 100,
    };
  }
  return {
    date: n.date,
    source: 'normal',
    parts,
    precipProbability: n.precipProbability,
    uvMax: n.uvMaxEstimate,
  };
}

/** Per-day plan: recommend() for each day part, then the union with layering notes (TDD §6.2). */
export function planDay(c: DayConditions, profile: TripProfile, personalOffset = 0): DayPlan {
  const ctx = {
    activity: PROFILE_ACTIVITY[profile],
    shade: false,
    umbrella: false,
    personalOffset,
  };
  const parts = {} as Record<DayPart, PartPlan>;
  for (const part of DAY_PARTS) {
    const pc = c.parts[part];
    const rec = recommend(pc.weather, ctx);
    const lo = evaluate({ ...pc.weather, tAir: pc.tLow }, rec.outfit, ctx).perceived;
    const hi = evaluate({ ...pc.weather, tAir: pc.tHigh }, rec.outfit, ctx).perceived;
    parts[part] = {
      outfit: rec.outfit,
      perceived: rec.perceived,
      perceivedLow: Math.min(lo, hi),
      perceivedHigh: Math.max(lo, hi),
      state: rec.state,
    };
  }
  const items = [...new Set(DAY_PARTS.flatMap((p) => parts[p].outfit))];
  const clo = (o: readonly GarmentId[]) => o.reduce((a, g) => a + GARMENT_BY_ID[g].clo, 0);
  const basePart = DAY_PARTS.reduce((a, p) =>
    clo(parts[p].outfit) > clo(parts[a].outfit) ? p : a,
  );
  const base = parts[basePart].outfit;
  const notes = DAY_PARTS.filter((p) => p !== basePart)
    .map((part) => ({
      part,
      add: parts[part].outfit.filter((g) => !base.includes(g)),
      remove: base.filter((g) => !parts[part].outfit.includes(g)),
    }))
    .filter((n) => n.add.length || n.remove.length);
  return {
    date: c.date,
    source: c.source,
    parts,
    outfit: base,
    items,
    notes,
    precipProbability: c.precipProbability,
    uvMax: c.uvMax,
  };
}

export interface ConditionsSummary {
  tLow: number;
  tHigh: number;
  humidity: 'dry' | 'moderate' | 'humid';
  rainyDays: number;
  totalDays: number;
  uv: 'low' | 'moderate' | 'high' | 'very high';
  anyNormals: boolean;
}

/** "Typically 16 to 22°C · moderate humidity · rain on ~4 of 10 days · UV high." */
export function summarize(days: readonly DayConditions[]): ConditionsSummary {
  const temps = days.flatMap((d) => DAY_PARTS.flatMap((p) => [d.parts[p].tLow, d.parts[p].tHigh]));
  const rh = days.flatMap((d) => DAY_PARTS.map((p) => d.parts[p].weather.rh));
  const meanRh = rh.reduce((a, b) => a + b, 0) / Math.max(1, rh.length);
  const uvMax = Math.max(0, ...days.map((d) => d.uvMax));
  return {
    tLow: Math.min(...temps),
    tHigh: Math.max(...temps),
    humidity: meanRh < 40 ? 'dry' : meanRh > 70 ? 'humid' : 'moderate',
    rainyDays: Math.round(days.reduce((a, d) => a + d.precipProbability, 0)),
    totalDays: days.length,
    uv: uvMax < 3 ? 'low' : uvMax < 6 ? 'moderate' : uvMax < 8 ? 'high' : 'very high',
    anyNormals: days.some((d) => d.source === 'normal'),
  };
}

export { GARMENT_BY_ID };
