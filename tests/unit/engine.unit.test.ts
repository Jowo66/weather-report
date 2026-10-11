import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  GARMENTS,
  comfortState,
  eligible,
  evaluate,
  forecastFeelsLike,
  frostbiteRisk,
  humidex,
  indexToTemperature,
  localClo,
  pSat,
  relativeAirSpeed,
  solarDeltaTmrt,
  windChill,
  zoneState,
  type EngineWeather,
  type GarmentId,
} from '../../src/engine';
import { wetnessByZone } from '../../src/engine/wetness';
import { zoneClothing } from '../../src/engine/heatBalance';

const cfg = DEFAULT_CONFIG;
const wx = (extra: Partial<EngineWeather> = {}): EngineWeather => ({
  tAir: 10,
  rh: 50,
  windKmh: 0,
  ghi: 0,
  dni: 0,
  dhi: 0,
  sunAlt: 0,
  precipMmH: 0,
  snowDepthM: 0,
  ...extra,
});

describe('psychrometrics and official indices', () => {
  it('pSat matches Magnus–Tetens reference values', () => {
    expect(pSat(0)).toBeCloseTo(0.6108, 4);
    expect(pSat(20)).toBeCloseTo(2.338, 3);
    expect(pSat(35)).toBeCloseTo(5.623, 2);
  });

  it('ECCC wind chill', () => {
    expect(windChill(-10, 20)).toBeCloseTo(-17.9, 1);
    expect(windChill(-30, 40)).toBeCloseTo(-47.5, 1);
    expect(windChill(5, 30)).toBe(5); // not reported above 0 °C
    expect(windChill(-5, 4)).toBe(-5); // not reported below 5 km/h
  });

  it('humidex', () => {
    expect(humidex(30, 70)).toBeCloseTo(41.1, 0);
    expect(humidex(20, 0)).toBeCloseTo(20 - 5.555, 3);
  });

  it('frostbite tiers', () => {
    expect(frostbiteRisk(-27.9)).toBeNull();
    expect(frostbiteRisk(-28)).toBe('high');
    expect(frostbiteRisk(-40)).toBe('very_high');
    expect(frostbiteRisk(-48)).toBe('severe');
    expect(frostbiteRisk(-55)).toBe('extreme');
  });

  it('forecast feels-like display rule', () => {
    expect(forecastFeelsLike(-10, 50, 20)).toBeCloseTo(windChill(-10, 20), 9);
    expect(forecastFeelsLike(30, 70, 10)).toBeCloseTo(humidex(30, 70), 9);
    expect(forecastFeelsLike(15, 50, 10)).toBe(15);
  });
});

describe('air speed and SolarCal', () => {
  it('applies the outdoor floor and walking speed', () => {
    expect(relativeAirSpeed(0, 0, cfg)).toBe(0.5);
    expect(relativeAirSpeed(36, 0, cfg)).toBeCloseTo(6.7, 9);
    expect(relativeAirSpeed(0, 0.9, cfg)).toBeCloseTo(Math.hypot(0.5, 0.9), 9);
  });

  it('no sun → no solar load', () => {
    expect(
      solarDeltaTmrt(wx({ ghi: 0, dni: 800, sunAlt: 40 }), { shade: false, umbrella: false }),
    ).toBe(0);
    expect(
      solarDeltaTmrt(wx({ ghi: 800, dni: 800, sunAlt: 0 }), { shade: false, umbrella: false }),
    ).toBe(0);
  });

  it('sun > umbrella > shade, and snow albedo adds load', () => {
    const w = wx({ ghi: 800, dni: 850, dhi: 120, sunAlt: 60 });
    const sun = solarDeltaTmrt(w, { shade: false, umbrella: false });
    const umb = solarDeltaTmrt(w, { shade: false, umbrella: true });
    const shade = solarDeltaTmrt(w, { shade: true, umbrella: false });
    expect(sun).toBeGreaterThan(umb);
    expect(umb).toBeGreaterThan(shade);
    expect(shade).toBeGreaterThan(0);
    expect(
      solarDeltaTmrt({ ...w, snowDepthM: 0.2 }, { shade: false, umbrella: false }),
    ).toBeGreaterThan(sun);
  });
});

describe('garments and zone clothing', () => {
  it('local clo of the reference outfit matches TDD §4.10', () => {
    const ref = cfg.REF_OUTFIT.map((id) => GARMENTS[id]);
    const zone = (z: Parameters<typeof localClo>[1]) =>
      ref.reduce((s, g) => s + localClo(g, z, cfg), 0);
    expect(zone('head')).toBe(0);
    expect(zone('torso')).toBeCloseTo(0.202, 3);
    expect(zone('arms')).toBeCloseTo(0.04, 3);
    expect(zone('hands')).toBe(0);
    expect(zone('legs')).toBeCloseTo(0.828, 3);
    expect(zone('feet')).toBeCloseTo(0.571, 3);
  });

  it('local clo redistributes whole-body clo (area-weighted sum equals garment clo)', () => {
    for (const g of Object.values(GARMENTS)) {
      let s = 0;
      for (const z of Object.keys(g.coverage) as (keyof typeof g.coverage)[]) {
        s += cfg.zoneArea[z] * localClo(g, z, cfg);
      }
      expect(s).toBeCloseTo(g.clo, 12);
    }
  });

  it('bare zone has no clo and skin permeability', () => {
    expect(zoneClothing([], 'hands', 0, 1, cfg)).toEqual({ clo: 0, i_m: 1, windproof: false });
  });

  it('windproof outer layer limits wind penetration', () => {
    const hoodie = [GARMENTS.hoodie];
    const covered = [GARMENTS.hoodie, GARMENTS.light_jacket];
    const still = zoneClothing(hoodie, 'torso', 0, 0, cfg).clo;
    const windy = zoneClothing(hoodie, 'torso', 0, 10, cfg).clo;
    expect(windy / still).toBeCloseTo(0.6, 9);
    const c0 = zoneClothing(covered, 'torso', 0, 0, cfg);
    const c10 = zoneClothing(covered, 'torso', 0, 10, cfg);
    expect(c10.windproof).toBe(true);
    expect(c10.clo / c0.clo).toBeCloseTo(0.9, 9);
  });
});

describe('wetness', () => {
  const outfit = (ids: GarmentId[]) => ids.map((id) => GARMENTS[id]);

  it('rain soaks unprotected zones, saturating at WET_SATURATION_MM_H', () => {
    const w = wetnessByZone(wx({ precipMmH: 1 }), { umbrella: false }, outfit(['t_shirt']), cfg);
    expect(w.torso).toBeCloseTo(0.5, 9);
    const heavy = wetnessByZone(wx({ precipMmH: 10 }), { umbrella: false }, outfit([]), cfg);
    expect(heavy.legs).toBe(1);
  });

  it('a waterproof garment shields the zones it covers ≥ 50%', () => {
    const w = wetnessByZone(wx({ precipMmH: 3 }), { umbrella: false }, outfit(['rain_shell']), cfg);
    expect(w.torso).toBe(0);
    expect(w.head).toBe(0);
    expect(w.legs).toBe(1);
  });

  it('umbrella protects head, torso and arms; dry snow wets less', () => {
    const w = wetnessByZone(wx({ precipMmH: 2 }), { umbrella: true }, [], cfg);
    expect(w.torso).toBeCloseTo(0.2, 9);
    expect(w.legs).toBe(1);
    const snow = wetnessByZone(wx({ tAir: -5, precipMmH: 2 }), { umbrella: false }, [], cfg);
    expect(snow.legs).toBeCloseTo(0.3, 9);
  });
});

describe('bands', () => {
  it('comfort state lower bounds', () => {
    expect(comfortState(40)).toBe('dangerous_heat');
    expect(comfortState(39.99)).toBe('overheated');
    expect(comfortState(20)).toBe('comfortable');
    expect(comfortState(19.99)).toBe('cool');
    expect(comfortState(0)).toBe('cold');
    expect(comfortState(-10)).toBe('very_cold');
    expect(comfortState(-10.01)).toBe('freezing');
  });

  it('zone tolerance applies only on the cold side', () => {
    expect(zoneState(-8, 'hands', cfg)).toBe('freezing'); // −8 − 3 = −11
    expect(zoneState(-8, 'legs', cfg)).toBe('cold'); // −8 + 3 = −5
    expect(zoneState(-8, 'torso', cfg)).toBe('cold');
    expect(zoneState(30, 'hands', cfg)).toBe('warm');
    expect(zoneState(8, 'arms', cfg)).toBe('ok'); // 8 + 3 = 11
  });
});

describe('perceived temperature', () => {
  it('extrapolates linearly beyond the table ends', () => {
    const tab = [
      [0, 0],
      [1, 10],
      [2, 20],
    ] as const;
    expect(indexToTemperature(-10, tab)).toBeCloseTo(-1, 9);
    expect(indexToTemperature(30, tab)).toBeCloseTo(3, 9);
    expect(indexToTemperature(15, tab)).toBeCloseTo(1.5, 9);
  });

  it('config overrides change the model (calibration hook)', () => {
    const w = wx({ tAir: 5, precipMmH: 3, windKmh: 10 });
    const c = { activity: 'standing', shade: false, umbrella: false, personalOffset: 0 } as const;
    const base = evaluate(w, ['t_shirt', 'jeans'], c).perceived;
    const tuned = evaluate(w, ['t_shirt', 'jeans'], c, { RAIN_EVAP_EFFICIENCY: 0 }).perceived;
    expect(tuned).toBeGreaterThan(base);
  });
});

describe('recommender eligibility', () => {
  it('applies social norms', () => {
    expect(eligible(['toque'], 15)).toBe(false);
    expect(eligible(['toque'], 5)).toBe(true);
    expect(eligible(['tank_top'], 20)).toBe(false);
    expect(eligible(['tank_top', 'shorts'], 30)).toBe(true);
  });
});
