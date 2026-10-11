import { ZONE_IDS, type EngineConfig } from './constants';
import { evaluate } from './evaluate';
import type {
  Advice,
  ComfortResult,
  Context,
  EngineWeather,
  GarmentId,
  Recommendation,
  ZoneId,
  ZoneState,
} from './types';

export const TORSO_LADDER: readonly (readonly GarmentId[])[] = [
  ['tank_top'],
  ['t_shirt'],
  ['long_sleeve'],
  ['t_shirt', 'hoodie'],
  ['long_sleeve', 'light_jacket'],
  ['long_sleeve', 'sweater', 'light_jacket'],
  ['thermal_top', 'long_sleeve', 'winter_coat'],
  ['thermal_top', 'sweater', 'winter_coat'],
];

export const LEGS_LADDER: readonly (readonly GarmentId[])[] = [
  ['shorts'],
  ['jeans'],
  ['thermal_bottoms', 'jeans'],
  ['thermal_bottoms', 'snow_pants'],
];

export const ACCESSORY_SETS: readonly (readonly GarmentId[])[] = [
  [],
  ['gloves', 'toque'],
  ['gloves', 'toque', 'scarf'],
];

export const COMFORT_LOW = 18.0;

/** Social-norm eligibility, °C (TDD §5.2). */
export const ELIGIBLE_MAX_T: Partial<Record<GarmentId, number>> = {
  gloves: 8,
  toque: 8,
  scarf: 2,
  winter_coat: 10,
  snow_pants: -5,
  thermal_bottoms: 5,
  thermal_top: 8,
};
export const ELIGIBLE_MIN_T: Partial<Record<GarmentId, number>> = { tank_top: 25, shorts: 21 };

const COLD_ZONE: ReadonlySet<ZoneState> = new Set(['cold', 'freezing', 'numb']);

export function eligible(outfit: readonly GarmentId[], t: number): boolean {
  return outfit.every((g) => t <= (ELIGIBLE_MAX_T[g] ?? 99) && t >= (ELIGIBLE_MIN_T[g] ?? -99));
}

/** Matches Python's round(x, 2), which the reference applies before comparing perceived values. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

interface Candidate {
  cost: number;
  ok: boolean;
  level: number;
  outfit: GarmentId[];
  result: ComfortResult;
}

/**
 * Cheapest outfit that reaches COMFORT_LOW with no cold zone (TDD §6.1).
 * cost = torso level + 0.5 per accessory + 0.25 per legs level.
 */
export function recommend(
  w: EngineWeather,
  ctx: Context,
  cfg?: Partial<EngineConfig>,
): Recommendation {
  const winterFeet = w.tAir <= 0 || w.snowDepthM > 0.01;
  const rain: GarmentId[] = w.precipMmH >= 0.5 && !ctx.umbrella ? ['rain_shell'] : [];
  const candidates: Candidate[] = [];
  TORSO_LADDER.forEach((torso, level) => {
    for (const acc of ACCESSORY_SETS) {
      let legsLvl = w.tAir >= ELIGIBLE_MIN_T.shorts! ? 0 : 1;
      let feet: GarmentId[] = winterFeet ? ['wool_socks', 'winter_boots'] : ['socks', 'sneakers'];
      let outfit: GarmentId[];
      let r: ComfortResult;
      for (;;) {
        outfit = [...torso, ...LEGS_LADDER[legsLvl]!, ...feet, ...acc, ...rain];
        r = evaluate(w, outfit, ctx, cfg);
        const next = LEGS_LADDER[legsLvl + 1];
        if (COLD_ZONE.has(r.zones.legs.state) && next && eligible(next, w.tAir)) {
          legsLvl += 1;
          continue;
        }
        if (COLD_ZONE.has(r.zones.feet.state) && !feet.includes('winter_boots')) {
          feet = ['wool_socks', 'winter_boots'];
          continue;
        }
        break;
      }
      const ok =
        round2(r.perceived) >= COMFORT_LOW &&
        !ZONE_IDS.some((z) => COLD_ZONE.has(r.zones[z].state)) &&
        r.zones.hands.state !== 'cool' &&
        r.zones.head.state !== 'cool';
      if (eligible(outfit, w.tAir)) {
        candidates.push({
          cost: level + 0.5 * acc.length + 0.25 * legsLvl,
          ok,
          level,
          outfit,
          result: r,
        });
      }
    }
  });
  if (candidates.length === 0) {
    const outfit: GarmentId[] = [...TORSO_LADDER[0]!, ...LEGS_LADDER[0]!, 'socks', 'sneakers'];
    candidates.push({
      cost: 0,
      ok: false,
      level: 0,
      outfit,
      result: evaluate(w, outfit, ctx, cfg),
    });
  }
  // First minimum / first maximum, like Python's min()/max().
  const good = candidates.filter((c) => c.ok);
  let best: Candidate;
  if (good.length > 0) {
    best = good.reduce((a, c) => (c.cost < a.cost ? c : a));
  } else {
    best = candidates.reduce((a, c) =>
      round2(c.result.perceived) > round2(a.result.perceived) ? c : a,
    );
  }
  const r = best.result;
  const advice: Advice[] = [];
  if (w.precipMmH >= 0.5) advice.push('umbrella');
  // The reference uses GHI ≥ 500 W/m² as a UV proxy; the UI layer should prefer the API's UV index ≥ 3.
  if (w.ghi >= 500) advice.push('sun_protection');
  if (round2(r.perceived) >= 29) advice.push('seek_shade_hydrate');
  if (!best.ok || r.flags.length > 0) advice.push('limit_exposure');
  return {
    level: best.level,
    outfit: best.outfit,
    perceived: r.perceived,
    state: r.state,
    metTarget: best.ok,
    coldZones: ZONE_IDS.filter((z): z is ZoneId => COLD_ZONE.has(r.zones[z].state)),
    advice,
  };
}
