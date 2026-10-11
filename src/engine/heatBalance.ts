import { ZONE_IDS, type EngineConfig } from './constants';
import { coverageOf, localClo, type GarmentPhysics } from './garments';
import { pSat } from './indices';
import type { ZoneId } from './types';

export interface ZoneClothing {
  clo: number;
  i_m: number;
  windproof: boolean;
}

/** Effective local clo and vapour permeability for zone z (TDD §4.7). */
export function zoneClothing(
  outfit: readonly GarmentPhysics[],
  z: ZoneId,
  wetZ: number,
  v: number,
  cfg: EngineConfig,
): ZoneClothing {
  const items = outfit.filter((g) => coverageOf(g, z) > 0);
  if (items.length === 0) return { clo: 0, i_m: cfg.I_M_SKIN, windproof: false };
  const windproof = items.some((g) => g.windproof && coverageOf(g, z) >= 0.5);
  const fWind =
    1 - ((windproof ? cfg.WIND_PENETRATION_WP : cfg.WIND_PENETRATION) * Math.min(v, 10)) / 10;
  let clo = 0;
  let r = 0;
  let re = 0;
  for (const g of items) {
    const lc = localClo(g, z, cfg);
    clo += lc * (1 - g.wetLoss * wetZ);
    r += lc;
    re += lc / g.i_m;
  }
  return { clo: clo * fWind, i_m: re > 0 ? r / re : cfg.I_M_SKIN, windproof };
}

/** ISO 7730 convective coefficient: max(forced, natural). */
export function hConv(v: number, dt = 0): number {
  return Math.max(12.1 * Math.sqrt(Math.max(v, 0.1)), 2.38 * Math.abs(dt) ** 0.25);
}

export interface ZoneFlux extends ZoneClothing {
  q: number;
  eMax: number;
}

export interface HeatBalance {
  load: number;
  dry: number;
  resp: number;
  eMax: number;
  eDif: number;
  rainEvap: number;
  tSk: number;
  tOp: number;
  hC: number;
  zones: Record<ZoneId, ZoneFlux>;
}

/** Per-zone fluxes and whole-body load terms, W/m² (TDD §4.8). */
export function heatBalance(
  tAir: number,
  tMrt: number,
  v: number,
  rh: number,
  met: number,
  outfit: readonly GarmentPhysics[],
  wet: Record<ZoneId, number> | null,
  cfg: EngineConfig,
): HeatBalance {
  const m = met * 58.15;
  const tSk = 35.7 - 0.0275 * m;
  const pA = (rh / 100) * pSat(tAir);
  const pSk = pSat(tSk);
  const hC = hConv(v, 0.6 * (tSk - tAir));
  const tOp = (cfg.H_R * tMrt + hC * tAir) / (cfg.H_R + hC);
  const zones = {} as Record<ZoneId, ZoneFlux>;
  let dry = 0;
  let emax = 0;
  let rainEvap = 0;
  for (const z of ZONE_IDS) {
    const a = cfg.zoneArea[z];
    const wz = wet ? wet[z] : 0;
    const zc = zoneClothing(outfit, z, wz, v, cfg);
    const fCl = 1 + 0.31 * zc.clo;
    const rCl = zc.clo * cfg.CLO;
    const rA = 1 / (fCl * (hC + cfg.H_R));
    const q = (tSk - tOp) / (rCl + rA);
    const rE = rCl / (zc.i_m * cfg.LR) + 1 / (cfg.LR * fCl * hC);
    const eMax = Math.max(0, pSk - pA) / rE;
    const eRain = cfg.RAIN_EVAP_EFFICIENCY * wz * Math.max(0, pSat(tAir) - pA) * cfg.LR * fCl * hC;
    zones[z] = { ...zc, q, eMax };
    dry += a * q;
    emax += a * eMax;
    rainEvap += a * eRain;
  }
  const resp = 0.0014 * m * (34 - tAir) + 0.0173 * m * (5.87 - pA);
  const eDif = cfg.SIGMA_SKIN_DIFF * emax;
  const load = m - dry - resp - eDif - rainEvap;
  return { load, dry, resp, eMax: emax, eDif, rainEvap, tSk, tOp, hC, zones };
}

/** Cold side: heat deficit (W/m², ≤ 0). Warm side: required regulatory wettedness × 100. */
export function strainIndex(hb: Pick<HeatBalance, 'load' | 'eMax'>, cfg: EngineConfig): number {
  if (hb.load <= 0) return hb.load;
  return (100 * hb.load) / Math.max((1 - cfg.SIGMA_SKIN_DIFF) * hb.eMax, 1e-6);
}
