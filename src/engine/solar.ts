import type { Context, EngineWeather } from './types';

const DEG = Math.PI / 180;

/** ASHRAE 55-2023 Appendix C (SolarCal), outdoor variant. Returns ΔTmrt in K (TDD §4.5). */
export function solarDeltaTmrt(w: EngineWeather, ctx: Pick<Context, 'shade' | 'umbrella'>): number {
  if (w.ghi <= 0 || w.sunAlt <= 0) return 0;
  const fEff = 0.725;
  const hR = 6.012;
  const aSw = 0.67;
  const aLw = 0.95;
  const fSvv = ctx.shade ? 0.5 : 1.0;
  const fBes = ctx.shade ? 0.0 : ctx.umbrella ? 0.2 : 1.0;
  const albedo = w.snowDepthM > 0.01 ? 0.7 : 0.2;
  const b = Math.min(w.sunAlt, 90);
  const fP = 0.308 * Math.cos(b * (0.998 - (b * b) / 50000) * DEG);
  const erf =
    (0.5 * fEff * fSvv * (w.dhi + w.ghi * albedo) + fP * fEff * fBes * w.dni) * (aSw / aLw);
  return erf / (fEff * hR);
}
