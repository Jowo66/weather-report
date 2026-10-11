import { ZONE_IDS, resolveConfig, type EngineConfig } from './constants';
import { GARMENTS } from './garments';
import { heatBalance, strainIndex } from './heatBalance';
import { humidex, windChill } from './indices';
import { indexToTemperature, referenceTable } from './perceived';
import { solarDeltaTmrt } from './solar';
import { comfortState } from './states';
import { wetnessByZone } from './wetness';
import { zoneResults } from './zones';
import type { ComfortResult, Context, EngineWeather, Flag, GarmentId } from './types';

/** Air speed at body height relative to the person, m/s (TDD §4.4). */
export function relativeAirSpeed(windKmh: number, vWalk: number, cfg: EngineConfig): number {
  const vBody = Math.max(cfg.V_MIN, (cfg.WIND_HEIGHT_FACTOR * windKmh) / 3.6);
  return Math.hypot(vBody, vWalk);
}

export function evaluate(
  w: EngineWeather,
  outfitIds: readonly GarmentId[],
  ctx: Context,
  cfgOverride?: Partial<EngineConfig>,
): ComfortResult {
  const cfg = resolveConfig(cfgOverride);
  const outfit = outfitIds.map((id) => GARMENTS[id]);
  const { met, vWalk } = cfg.activity[ctx.activity];
  const vRel = relativeAirSpeed(w.windKmh, vWalk, cfg);
  const tMrt = w.tAir + solarDeltaTmrt(w, ctx);
  const wet = wetnessByZone(w, ctx, outfit, cfg);
  const hb = heatBalance(w.tAir, tMrt, vRel, w.rh, met, outfit, wet, cfg);
  const idx = strainIndex(hb, cfg);
  const perceived = indexToTemperature(idx, referenceTable(cfg)) + ctx.personalOffset;
  const wc = windChill(w.tAir, w.windKmh);
  const zones = zoneResults(hb, wet, perceived, wc, ctx.personalOffset, cfg);

  const wReq = hb.load > 0 ? hb.load / Math.max(hb.eMax, 1e-6) : 0;
  let wetArea = 0;
  let cloEffective = 0;
  for (const z of ZONE_IDS) {
    wetArea += cfg.zoneArea[z] * wet[z];
    cloEffective += cfg.zoneArea[z] * hb.zones[z].clo;
  }
  const flags: Flag[] = [];
  if (perceived >= 34 && wReq > 0.5) flags.push('heat_strain');
  if (perceived >= 40 || wReq >= 1.0) flags.push('heat_danger');
  if (ZONE_IDS.some((z) => zones[z].frostbite)) flags.push('frostbite_risk');
  if (w.tAir < 10 && wetArea >= 0.4 && perceived < 5) flags.push('hypothermia_risk');
  if (w.precipMmH >= 0.5 && !ctx.umbrella && !outfit.some((g) => g.waterproof)) {
    flags.push('suggest_rain_gear');
  }

  let cloTotal = 0;
  for (const g of outfit) cloTotal += g.clo;

  return {
    perceived,
    state: comfortState(perceived),
    index: idx,
    loadWm2: hb.load,
    requiredWettedness: wReq,
    cloTotal,
    cloEffective,
    vRel,
    tMrt,
    wetArea,
    humidex: humidex(w.tAir, w.rh),
    windChill: wc,
    zones,
    flags,
  };
}
