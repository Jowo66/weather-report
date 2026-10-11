import { resolveConfig, type EngineConfig } from './constants';
import { evaluate } from './evaluate';
import type { Context, EngineWeather, GarmentId } from './types';

export type ExplanationFactor =
  | { kind: 'wind'; delta: number }
  | { kind: 'sun'; delta: number }
  | { kind: 'humidity'; delta: number }
  | { kind: 'rain'; delta: number }
  | { kind: 'activity'; delta: number }
  | { kind: 'garment'; garment: GarmentId; delta: number };

export interface Explanation {
  /** Top factors by |delta|, largest first (at most `limit`). */
  top: ExplanationFactor[];
  /** Every factor that was evaluated. */
  all: ExplanationFactor[];
}

/**
 * Counterfactual explanation (TDD §4.12): re-evaluate with one factor neutralised.
 * delta = actual perceived − counterfactual perceived, so a negative delta means the
 * factor makes you feel colder ("wind is taking 6 °C off").
 */
export function explain(
  w: EngineWeather,
  outfit: readonly GarmentId[],
  ctx: Context,
  cfgOverride?: Partial<EngineConfig>,
  limit = 3,
): Explanation {
  const cfg = resolveConfig(cfgOverride);
  const p = (ww: EngineWeather, o: readonly GarmentId[], c: Context) =>
    evaluate(ww, o, c, cfg).perceived;
  const actual = p(w, outfit, ctx);
  const all: ExplanationFactor[] = [];

  const calmKmh = (cfg.V_MIN / cfg.WIND_HEIGHT_FACTOR) * 3.6;
  if (w.windKmh > calmKmh) {
    all.push({ kind: 'wind', delta: actual - p({ ...w, windKmh: calmKmh }, outfit, ctx) });
  }
  if (w.ghi > 0 && w.sunAlt > 0) {
    all.push({ kind: 'sun', delta: actual - p({ ...w, ghi: 0, dni: 0, dhi: 0 }, outfit, ctx) });
  }
  if (w.tAir >= 20 && w.rh !== 50) {
    all.push({ kind: 'humidity', delta: actual - p({ ...w, rh: 50 }, outfit, ctx) });
  }
  if (w.precipMmH > 0) {
    all.push({ kind: 'rain', delta: actual - p({ ...w, precipMmH: 0 }, outfit, ctx) });
  }
  if (ctx.activity !== 'standing') {
    all.push({ kind: 'activity', delta: actual - p(w, outfit, { ...ctx, activity: 'standing' }) });
  }
  let bestGarment: ExplanationFactor | null = null;
  outfit.forEach((g, i) => {
    const without = outfit.filter((_, j) => j !== i);
    const f: ExplanationFactor = {
      kind: 'garment',
      garment: g,
      delta: actual - p(w, without, ctx),
    };
    if (!bestGarment || Math.abs(f.delta) > Math.abs(bestGarment.delta)) bestGarment = f;
  });
  if (bestGarment) all.push(bestGarment);

  const significant = all.filter((f) => Math.abs(f.delta) >= 0.5);
  const top = [...significant]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
  return { top, all };
}
