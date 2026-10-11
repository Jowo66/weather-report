import { ZONE_IDS, type EngineConfig } from './constants';
import { GARMENTS, localClo } from './garments';
import { frostbiteRisk } from './indices';
import { hConv, type HeatBalance } from './heatBalance';
import { zoneState } from './states';
import type { ZoneId, ZoneResult } from './types';

const EXTREMITIES: ReadonlySet<ZoneId> = new Set(['hands', 'feet']);
const FROSTBITE_ZONES: ReadonlySet<ZoneId> = new Set(['head', 'hands']);

/** Zone felt temperatures against the same reference person, with skin-tissue resistance (TDD §4.10). */
export function zoneResults(
  hb: HeatBalance,
  wet: Record<ZoneId, number>,
  perceived: number,
  windChillValue: number,
  personalOffset: number,
  cfg: EngineConfig,
): Record<ZoneId, ZoneResult> {
  const refOutfit = cfg.REF_OUTFIT.map((id) => GARMENTS[id]);
  const hCRef = hConv(cfg.REF_V_ZONE);
  const vaso = Math.min(cfg.VASO_MAX, Math.max(0, cfg.VASO_GAIN * (cfg.VASO_START - perceived)));
  const out = {} as Record<ZoneId, ZoneResult>;
  for (const z of ZONE_IDS) {
    const zz = hb.zones[z];
    let cloRef = 0;
    for (const g of refOutfit) cloRef += localClo(g, z, cfg);
    const fCl = 1 + 0.31 * zz.clo;
    const fClRef = 1 + 0.31 * cloRef;
    const rAct = cfg.R_TISSUE + zz.clo * cfg.CLO + 1 / (fCl * (hb.hC + cfg.H_R));
    const rRef = cfg.R_TISSUE + cloRef * cfg.CLO + 1 / (fClRef * (hCRef + cfg.H_R));
    let tFelt = hb.tSk - ((hb.tSk - hb.tOp) * rRef) / rAct;
    if (wet[z] > 0) tFelt -= cfg.WET_CHILL * wet[z];
    if (EXTREMITIES.has(z)) tFelt -= vaso;
    tFelt += personalOffset;
    const exposed = zz.clo < 0.1;
    out[z] = {
      clo: zz.clo,
      wetness: wet[z],
      tFelt,
      state: zoneState(tFelt, z, cfg),
      exposed,
      frostbite: exposed && FROSTBITE_ZONES.has(z) ? frostbiteRisk(windChillValue) : null,
    };
  }
  return out;
}
