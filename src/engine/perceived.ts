import { DEFAULT_CONFIG, type EngineConfig } from './constants';
import { GARMENTS } from './garments';
import { heatBalance, strainIndex } from './heatBalance';

export type ReferenceTable = readonly (readonly [t: number, index: number])[];

export function referenceIndex(t: number, cfg: EngineConfig): number {
  const outfit = cfg.REF_OUTFIT.map((id) => GARMENTS[id]);
  return strainIndex(heatBalance(t, t, cfg.REF_V, cfg.REF_RH, cfg.REF_MET, outfit, null, cfg), cfg);
}

/** Reference person's strain index for T = −80…+70 °C every 0.5 °C (TDD §4.9). */
export function buildReferenceTable(cfg: EngineConfig): ReferenceTable {
  const tab: [number, number][] = [];
  for (let x = -160; x <= 140; x++) tab.push([x / 2, referenceIndex(x / 2, cfg)]);
  return tab;
}

const DEFAULT_TABLE = buildReferenceTable(DEFAULT_CONFIG);
const tableCache = new WeakMap<EngineConfig, ReferenceTable>();

export function referenceTable(cfg: EngineConfig): ReferenceTable {
  if (cfg === DEFAULT_CONFIG) return DEFAULT_TABLE;
  let t = tableCache.get(cfg);
  if (!t) {
    t = buildReferenceTable(cfg);
    tableCache.set(cfg, t);
  }
  return t;
}

/** Invert the reference table: binary search + linear interpolation, linear extrapolation at the ends. */
export function indexToTemperature(idx: number, tab: ReferenceTable): number {
  const n = tab.length;
  let lo: number;
  let hi: number;
  if (idx <= tab[0]![1]) {
    lo = 0;
    hi = 1;
  } else if (idx >= tab[n - 1]![1]) {
    lo = n - 2;
    hi = n - 1;
  } else {
    lo = 0;
    hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tab[mid]![1] <= idx) lo = mid;
      else hi = mid;
    }
  }
  const [t0, s0] = tab[lo]!;
  const [t1, s1] = tab[hi]!;
  return t0 + ((idx - s0) * (t1 - t0)) / (s1 - s0);
}
