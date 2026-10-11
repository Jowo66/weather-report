import type { EngineConfig } from './constants';
import type { GarmentId, ZoneId } from './types';

/** Engine-side garment physics. Values must match GARMENTS in reference/thermo_ref.py. */
export interface GarmentPhysics {
  id: GarmentId;
  clo: number;
  coverage: Partial<Record<ZoneId, number>>;
  layer: 1 | 2 | 3 | 4 | 5;
  i_m: number;
  windproof: boolean;
  waterproof: boolean;
  wetLoss: number;
}

function g(
  id: GarmentId,
  clo: number,
  coverage: Partial<Record<ZoneId, number>>,
  layer: GarmentPhysics['layer'],
  opts: Partial<Pick<GarmentPhysics, 'i_m' | 'windproof' | 'waterproof' | 'wetLoss'>> = {},
): GarmentPhysics {
  return {
    id,
    clo,
    coverage,
    layer,
    i_m: opts.i_m ?? 0.38,
    windproof: opts.windproof ?? false,
    waterproof: opts.waterproof ?? false,
    wetLoss: opts.wetLoss ?? 0.4,
  };
}

const LIST: GarmentPhysics[] = [
  g('tank_top', 0.06, { torso: 0.8 }, 1),
  g('t_shirt', 0.08, { torso: 1.0, arms: 0.2 }, 1),
  g('long_sleeve', 0.25, { torso: 1.0, arms: 1.0 }, 2),
  g('thermal_top', 0.2, { torso: 1.0, arms: 1.0 }, 1, { wetLoss: 0.25 }),
  g('hoodie', 0.34, { torso: 1.0, arms: 1.0, head: 0.3 }, 3),
  g('sweater', 0.36, { torso: 1.0, arms: 1.0 }, 3, { wetLoss: 0.3 }),
  g('light_jacket', 0.3, { torso: 1.0, arms: 1.0 }, 4, { i_m: 0.25, windproof: true }),
  g('rain_shell', 0.15, { torso: 1.0, arms: 1.0, head: 0.6 }, 5, {
    i_m: 0.15,
    windproof: true,
    waterproof: true,
    wetLoss: 0.0,
  }),
  g('winter_coat', 0.7, { torso: 1.0, arms: 1.0, legs: 0.25 }, 5, { i_m: 0.2, windproof: true }),
  g('shorts', 0.08, { legs: 0.4 }, 2),
  g('jeans', 0.24, { legs: 1.0 }, 2, { wetLoss: 0.5 }),
  g('thermal_bottoms', 0.15, { legs: 1.0 }, 1, { wetLoss: 0.25 }),
  g('snow_pants', 0.5, { legs: 1.0 }, 5, {
    i_m: 0.18,
    windproof: true,
    waterproof: true,
    wetLoss: 0.0,
  }),
  g('toque', 0.05, { head: 0.6 }, 5, { wetLoss: 0.25 }),
  g('scarf', 0.05, { head: 0.3 }, 5),
  g('gloves', 0.06, { hands: 1.0 }, 5, { i_m: 0.25, windproof: true }),
  g('socks', 0.02, { feet: 1.0 }, 1),
  g('wool_socks', 0.06, { feet: 1.0 }, 1, { wetLoss: 0.2 }),
  g('sneakers', 0.02, { feet: 1.0 }, 5, { i_m: 0.25 }),
  g('winter_boots', 0.1, { feet: 1.0 }, 5, {
    i_m: 0.15,
    windproof: true,
    waterproof: true,
    wetLoss: 0.0,
  }),
];

export const GARMENTS: Readonly<Record<GarmentId, GarmentPhysics>> = Object.freeze(
  Object.fromEntries(LIST.map((x) => [x.id, x])) as Record<GarmentId, GarmentPhysics>,
);

export const GARMENT_IDS: readonly GarmentId[] = LIST.map((x) => x.id);

export function isGarmentId(id: string): id is GarmentId {
  return Object.prototype.hasOwnProperty.call(GARMENTS, id);
}

export function coverageOf(gm: GarmentPhysics, z: ZoneId): number {
  return gm.coverage[z] ?? 0;
}

/** Redistribute whole-body garment clo onto covered zones (area-weighted), TDD §4.7. */
export function localClo(gm: GarmentPhysics, z: ZoneId, cfg: EngineConfig): number {
  let a = 0;
  for (const [zone, c] of Object.entries(gm.coverage) as [ZoneId, number][]) {
    a += cfg.zoneArea[zone] * c;
  }
  return (gm.clo / a) * coverageOf(gm, z);
}
