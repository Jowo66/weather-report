import { ZONE_IDS, type EngineConfig } from './constants';
import { coverageOf, type GarmentPhysics } from './garments';
import type { Context, EngineWeather, ZoneId } from './types';

const UPPER: ReadonlySet<ZoneId> = new Set(['head', 'torso', 'arms']);

/** Steady-state fabric wetness per zone, 0…1 (TDD §4.6). */
export function wetnessByZone(
  w: EngineWeather,
  ctx: Pick<Context, 'umbrella'>,
  outfit: readonly GarmentPhysics[],
  cfg: EngineConfig,
): Record<ZoneId, number> {
  const rate = w.precipMmH * (w.tAir < -1 ? cfg.SNOW_WETTING_FACTOR : 1);
  const out = {} as Record<ZoneId, number>;
  for (const z of ZONE_IDS) {
    const r = rate * (ctx.umbrella && UPPER.has(z) ? cfg.UMBRELLA_UPPER_FACTOR : 1);
    const shielded = outfit.some((g) => g.waterproof && coverageOf(g, z) >= 0.5);
    out[z] = shielded ? 0 : Math.min(1, r / cfg.WET_SATURATION_MM_H);
  }
  return out;
}
