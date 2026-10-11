import { describe, expect, it } from 'vitest';
import {
  COMFORT_BANDS,
  DEFAULT_CONFIG,
  ENGINE_VERSION,
  ZONE_BANDS,
  ZONE_IDS,
  buildReferenceTable,
  evaluate,
  recommend,
  type ComfortResult,
  type ZoneId,
} from '../../src/engine';
import { loadGolden, toContext, toWeather, type PyEvalVector } from '../support/golden';

/**
 * Golden tests (TDD §4.14). Python rounds most fields to 2–3 dp, so numeric fields
 * get ±0.011. humidex and wind_chill are rounded to 1 dp in the reference, so they
 * get half a unit of that rounding (±0.051) instead.
 */
const TOL = 0.011;
const TOL_1DP = 0.051;
const EDGE = 0.02;

const golden = loadGolden();

function nearEdge(value: number, edges: readonly number[]): boolean {
  return edges.some((e) => Number.isFinite(e) && Math.abs(value - e) <= EDGE);
}
const COMFORT_EDGES = COMFORT_BANDS.map(([lo]) => lo);
const ZONE_EDGES = ZONE_BANDS.map(([lo]) => lo);

function zoneBandInput(tFelt: number, z: ZoneId): number {
  return tFelt < 10 ? tFelt + DEFAULT_CONFIG.zoneTolerance[z] : tFelt;
}

function diff(label: string, actual: number, expected: number, tol: number, errs: string[]) {
  if (!(Math.abs(actual - expected) <= tol)) errs.push(`${label}: got ${actual}, want ${expected}`);
}

function compare(v: PyEvalVector, r: ComfortResult): string[] {
  const e = v.expected;
  const errs: string[] = [];
  diff('perceived', r.perceived, e.perceived, TOL, errs);
  diff('index', r.index, e.index, TOL, errs);
  diff('load_w_m2', r.loadWm2, e.load_w_m2, TOL, errs);
  diff('required_wettedness', r.requiredWettedness, e.required_wettedness, TOL, errs);
  diff('clo_total', r.cloTotal, e.clo_total, TOL, errs);
  diff('clo_effective', r.cloEffective, e.clo_effective, TOL, errs);
  diff('v_rel', r.vRel, e.v_rel, TOL, errs);
  diff('t_mrt', r.tMrt, e.t_mrt, TOL, errs);
  diff('wet_area', r.wetArea, e.wet_area, TOL, errs);
  diff('humidex', r.humidex, e.humidex, TOL_1DP, errs);
  diff('wind_chill', r.windChill, e.wind_chill, TOL_1DP, errs);
  if (r.state !== e.state && !nearEdge(r.perceived, COMFORT_EDGES)) {
    errs.push(`state: got ${r.state}, want ${e.state} (perceived ${r.perceived})`);
  }
  for (const z of ZONE_IDS) {
    const a = r.zones[z];
    const x = e.zones[z];
    if (!x) {
      errs.push(`zone ${z} missing from vector`);
      continue;
    }
    diff(`${z}.clo`, a.clo, x.clo, TOL, errs);
    diff(`${z}.wetness`, a.wetness, x.wetness, TOL, errs);
    diff(`${z}.t_felt`, a.tFelt, x.t_felt, TOL, errs);
    if (a.state !== x.state && !nearEdge(zoneBandInput(a.tFelt, z), ZONE_EDGES)) {
      errs.push(`${z}.state: got ${a.state}, want ${x.state} (t_felt ${a.tFelt})`);
    }
    if (a.exposed !== x.exposed) errs.push(`${z}.exposed: got ${a.exposed}, want ${x.exposed}`);
    if (a.frostbite !== x.frostbite) {
      errs.push(`${z}.frostbite: got ${a.frostbite}, want ${x.frostbite}`);
    }
  }
  const fa = [...r.flags].sort().join(',');
  const fe = [...e.flags].sort().join(',');
  if (fa !== fe) errs.push(`flags: got [${fa}], want [${fe}]`);
  return errs;
}

function run(v: PyEvalVector): string[] {
  const r = evaluate(toWeather(v.input.weather), v.input.outfit, toContext(v.input.context));
  return compare(v, r);
}

describe('golden vectors', () => {
  it('matches the engine version', () => {
    expect(ENGINE_VERSION).toBe(golden.engine_version);
  });

  // ±1e-6, relative to the magnitude: near +70 °C the warm-side index reaches ~4e10,
  // where one float ulp (JS Math.exp/pow vs CPython) is already ~8e-6 absolute.
  it('reproduces the reference table (±1e-6, relative above 1)', () => {
    const tab = buildReferenceTable(DEFAULT_CONFIG);
    expect(tab).toHaveLength(golden.reference_table.length);
    golden.reference_table.forEach(([t, idx], i) => {
      const row = tab[i]!;
      expect(row[0]).toBe(t);
      expect(Math.abs(row[1] - idx)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(idx)));
    });
  });

  it('reference table is strictly increasing', () => {
    const tab = buildReferenceTable(DEFAULT_CONFIG);
    for (let i = 1; i < tab.length; i++) expect(tab[i]![1]).toBeGreaterThan(tab[i - 1]![1]);
  });

  describe('named cases', () => {
    for (const v of golden.cases) {
      it(`${v.id}: ${v.description}`, () => {
        expect(run(v)).toEqual([]);
      });
    }
  });

  it(`grid (${golden.grid.length} vectors)`, () => {
    const failures: string[] = [];
    golden.grid.forEach((v, i) => {
      const errs = run(v);
      if (errs.length) failures.push(`#${i} ${JSON.stringify(v.input)}\n  ${errs.join('\n  ')}`);
    });
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it(`recommend (${golden.recommend.length} vectors)`, () => {
    const failures: string[] = [];
    golden.recommend.forEach((v, i) => {
      const e = v.expected;
      const r = recommend(toWeather(v.input.weather), toContext(v.input.context));
      const errs: string[] = [];
      const sortJ = (xs: readonly string[]) => [...xs].sort().join(',');
      if (sortJ(r.outfit) !== sortJ(e.outfit))
        errs.push(`outfit: got ${r.outfit}, want ${e.outfit}`);
      if (r.level !== e.level) errs.push(`level: got ${r.level}, want ${e.level}`);
      diff('perceived', r.perceived, e.perceived, TOL, errs);
      if (r.state !== e.state && !nearEdge(r.perceived, COMFORT_EDGES)) {
        errs.push(`state: got ${r.state}, want ${e.state}`);
      }
      if (r.metTarget !== e.met_target)
        errs.push(`met_target: got ${r.metTarget}, want ${e.met_target}`);
      if (sortJ(r.coldZones) !== sortJ(e.cold_zones)) {
        errs.push(`cold_zones: got ${r.coldZones}, want ${e.cold_zones}`);
      }
      if (sortJ(r.advice) !== sortJ(e.advice))
        errs.push(`advice: got ${r.advice}, want ${e.advice}`);
      if (errs.length) failures.push(`#${i} ${JSON.stringify(v.input)}\n  ${errs.join('\n  ')}`);
    });
    expect(failures.slice(0, 10)).toEqual([]);
  });
});
