import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  evaluate,
  windChill,
  type Activity,
  type Context,
  type EngineWeather,
  type GarmentId,
} from '../../src/engine';

/** Ports of `thermo_ref.py --checks` (TDD §12.3), plus randomised fast-check properties. */

const SLACK = 0.01;
const BASE: GarmentId[] = ['socks', 'sneakers'];
const REF: GarmentId[] = ['t_shirt', 'jeans', 'socks', 'sneakers'];
const WINTER_KIT: GarmentId[] = [
  'thermal_top',
  'sweater',
  'winter_coat',
  'thermal_bottoms',
  'jeans',
  'toque',
  'scarf',
  'gloves',
  'wool_socks',
  'winter_boots',
];
const OUTFITS: GarmentId[][] = [
  ['tank_top', 'shorts', ...BASE],
  REF,
  ['long_sleeve', 'hoodie', 'jeans', ...BASE],
  WINTER_KIT,
];
const ACTIVITIES: Activity[] = ['standing', 'strolling', 'walking'];
const SUN_HIGH = { ghi: 800, dni: 850, dhi: 120, sunAlt: 60 };

function wx(
  tAir: number,
  rh: number,
  windKmh: number,
  extra: Partial<EngineWeather> = {},
): EngineWeather {
  return {
    tAir,
    rh,
    windKmh,
    ghi: 0,
    dni: 0,
    dhi: 0,
    sunAlt: 0,
    precipMmH: 0,
    snowDepthM: 0,
    ...extra,
  };
}
function ctx(extra: Partial<Context> = {}): Context {
  return { activity: 'standing', shade: false, umbrella: false, personalOffset: 0, ...extra };
}
const p = (w: EngineWeather, o: GarmentId[], c: Context = ctx()) => evaluate(w, o, c).perceived;

describe('property checks (ported from thermo_ref.py --checks)', () => {
  it('reference person in reference conditions feels 22.0', () => {
    const w = wx(22, 50, (DEFAULT_CONFIG.REF_V / DEFAULT_CONFIG.WIND_HEIGHT_FACTOR) * 3.6);
    expect(p(w, REF, ctx({ shade: true }))).toBeCloseTo(22, 2);
  });

  it('monotone in air temperature (25,056 points)', () => {
    let n = 0;
    let bad = 0;
    for (const o of OUTFITS)
      for (const activity of ACTIVITIES)
        for (const wind of [0, 10, 30, 60])
          for (const rh of [10, 50, 95])
            for (const sun of [false, true]) {
              let prev = -1e9;
              for (let t = -40; t < 47; t++) {
                const v = p(wx(t, rh, wind, sun ? SUN_HIGH : {}), o, ctx({ activity }));
                n++;
                if (v < prev - SLACK) bad++;
                prev = v;
              }
            }
    expect(n).toBe(25056);
    expect(bad).toBe(0);
  });

  it('monotone in wind (T ≤ 30)', () => {
    let bad = 0;
    for (const o of OUTFITS)
      for (const t of [-30, -10, 0, 10, 20, 30]) {
        let prev = 1e9;
        for (let wind = 0; wind <= 80; wind += 4) {
          const v = p(wx(t, 50, wind), o);
          if (v > prev + SLACK) bad++;
          prev = v;
        }
      }
    expect(bad).toBe(0);
  });

  it('monotone in humidity (T ≥ 20)', () => {
    let bad = 0;
    for (const t of [20, 25, 30, 35, 40])
      for (const o of OUTFITS.slice(0, 3)) {
        let prev = -1e9;
        for (let rh = 5; rh <= 100; rh += 5) {
          const v = p(wx(t, rh, 5), o);
          if (v < prev - SLACK) bad++;
          prev = v;
        }
      }
    expect(bad).toBe(0);
  });

  it('monotone in clothing (T ≤ 33)', () => {
    const ladder: GarmentId[][] = [
      [],
      ['t_shirt'],
      ['t_shirt', 'jeans'],
      ['t_shirt', 'jeans', ...BASE],
      ['t_shirt', 'long_sleeve', 'jeans', ...BASE],
      ['t_shirt', 'long_sleeve', 'sweater', 'jeans', ...BASE],
      ['thermal_top', 'long_sleeve', 'sweater', 'winter_coat', 'jeans', ...BASE],
      WINTER_KIT,
      [...WINTER_KIT, 'snow_pants'],
    ];
    let bad = 0;
    for (const t of [-30, -10, 0, 10, 20, 25, 30, 33])
      for (const activity of ACTIVITIES) {
        let prev = -1e9;
        for (const o of ladder) {
          const v = p(wx(t, 50, 10), o, ctx({ activity }));
          if (v < prev - SLACK) bad++;
          prev = v;
        }
      }
    expect(bad).toBe(0);
  });

  it('monotone in activity', () => {
    for (const t of [-20, 0, 10, 20, 30])
      for (const o of OUTFITS) {
        const [s, st, wk] = ACTIVITIES.map((activity) => p(wx(t, 50, 10), o, ctx({ activity })));
        expect(s!).toBeLessThanOrEqual(st! + SLACK);
        expect(st!).toBeLessThanOrEqual(wk! + SLACK);
      }
  });

  it('sun ≥ shade ≥ night', () => {
    for (const t of [-10, 10, 25, 35])
      for (const o of OUTFITS) {
        const night = p(wx(t, 50, 10), o);
        const sun = p(wx(t, 50, 10, SUN_HIGH), o);
        const shade = p(wx(t, 50, 10, SUN_HIGH), o, ctx({ shade: true }));
        expect(sun).toBeGreaterThanOrEqual(shade - SLACK);
        expect(shade).toBeGreaterThanOrEqual(night - SLACK);
      }
  });

  it('rain ≤ dry, and a rain shell is never colder than getting wet', () => {
    const o: GarmentId[] = ['t_shirt', 'hoodie', 'jeans', ...BASE];
    for (const t of [0, 5, 10, 15]) {
      const dry = p(wx(t, 90, 10), o);
      const wet = p(wx(t, 90, 10, { precipMmH: 3 }), o);
      const shell = p(wx(t, 90, 10, { precipMmH: 3 }), [...o, 'rain_shell']);
      expect(wet).toBeLessThanOrEqual(dry + SLACK);
      expect(shell).toBeGreaterThanOrEqual(wet - SLACK);
    }
  });

  it('bare hands track ECCC wind chill within ~3 °C', () => {
    const noGloves = WINTER_KIT.filter((g) => g !== 'gloves');
    for (const [t, wind] of [
      [-10, 20],
      [-20, 30],
      [-30, 40],
    ] as const) {
      const r = evaluate(wx(t, 60, wind), noGloves, ctx());
      const vaso = Math.min(5, Math.max(0, 0.3 * (17 - r.perceived)));
      const bare = r.zones.hands.tFelt + vaso;
      expect(Math.abs(bare - windChill(t, wind))).toBeLessThan(3);
    }
  });
});

describe('randomised properties (fast-check)', () => {
  const garmentSets = fc.constantFrom(...OUTFITS);
  const weather = fc.record({
    tAir: fc.double({ min: -50, max: 50, noNaN: true }),
    rh: fc.double({ min: 0, max: 100, noNaN: true }),
    windKmh: fc.double({ min: 0, max: 150, noNaN: true }),
    ghi: fc.double({ min: 0, max: 1100, noNaN: true }),
    dni: fc.double({ min: 0, max: 1000, noNaN: true }),
    dhi: fc.double({ min: 0, max: 400, noNaN: true }),
    sunAlt: fc.double({ min: -10, max: 90, noNaN: true }),
    precipMmH: fc.double({ min: 0, max: 30, noNaN: true }),
    snowDepthM: fc.double({ min: 0, max: 2, noNaN: true }),
  });
  const context = fc.record({
    activity: fc.constantFrom<Activity>(...ACTIVITIES),
    shade: fc.boolean(),
    umbrella: fc.boolean(),
    personalOffset: fc.double({ min: -3, max: 3, noNaN: true }),
  });

  it('perceived and zone temperatures are finite for all in-range inputs', () => {
    fc.assert(
      fc.property(weather, garmentSets, context, (w, o, c) => {
        const r = evaluate(w, o, c);
        expect(Number.isFinite(r.perceived)).toBe(true);
        for (const z of Object.values(r.zones)) expect(Number.isFinite(z.tFelt)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(weather, garmentSets, context, (w, o, c) => {
        expect(evaluate(w, o, c)).toEqual(evaluate(w, o, c));
      }),
      { numRuns: 300 },
    );
  });

  it('personal offset shifts perceived by exactly the offset', () => {
    fc.assert(
      fc.property(weather, garmentSets, context, (w, o, c) => {
        const a = evaluate(w, o, { ...c, personalOffset: 0 }).perceived;
        const b = evaluate(w, o, c).perceived;
        expect(b - a).toBeCloseTo(c.personalOffset, 9);
      }),
      { numRuns: 500 },
    );
  });

  it('warmer air never feels colder (random pairs, T ≤ 46)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -40, max: 46, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 10, max: 95, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        garmentSets,
        (t, dt, rh, wind, o) => {
          const lo = p(wx(t, rh, wind), o);
          const hi = p(wx(Math.min(46, t + dt), rh, wind), o);
          expect(hi).toBeGreaterThanOrEqual(lo - SLACK);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
