import { describe, expect, it } from 'vitest';
import raw from '../../src/data/garments.json';
import { GARMENT_BY_ID, GARMENT_DEFS } from '../../src/data/garments';
import { GARMENTS, GARMENT_IDS, type GarmentId } from '../../src/engine';
import { ELIGIBLE_MAX_T, ELIGIBLE_MIN_T } from '../../src/engine/recommend';
import { slotConflicts, sortOutfit, toggleGarment } from '../../src/state/wardrobe';
import { GarmentCatalogueSchema } from '../support/garmentSchema';

describe('garments.json', () => {
  it('validates against the Zod schema', () => {
    const r = GarmentCatalogueSchema.safeParse(raw);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('has unique ids matching the engine catalogue', () => {
    const ids = GARMENT_DEFS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GARMENT_IDS].sort());
  });

  it('physics fields match the engine (and so thermo_ref.py)', () => {
    for (const g of GARMENT_DEFS) {
      const e = GARMENTS[g.id];
      expect({ id: g.id, clo: g.clo, coverage: g.coverage, layer: g.layer, i_m: g.i_m }).toEqual({
        id: e.id,
        clo: e.clo,
        coverage: e.coverage,
        layer: e.layer,
        i_m: e.i_m,
      });
      expect([g.windproof, g.waterproof, g.wetLoss]).toEqual([
        e.windproof,
        e.waterproof,
        e.wetLoss,
      ]);
    }
  });

  it('eligibility matches the recommender', () => {
    for (const g of GARMENT_DEFS) {
      expect(g.eligibleMaxT).toBe(ELIGIBLE_MAX_T[g.id]);
      expect(g.eligibleMinT).toBe(ELIGIBLE_MIN_T[g.id]);
    }
  });
});

describe('slot conflicts (TDD §5.3)', () => {
  it('swaps garments in the same slot', () => {
    const r = toggleGarment(['t_shirt', 'jeans'], 'thermal_top');
    expect(r.worn).toEqual(['thermal_top', 'jeans']);
    expect(r.replaced).toEqual(['t_shirt']);
    expect(r.added).toBe('thermal_top');
  });

  it('removes a worn garment', () => {
    const r = toggleGarment(['t_shirt', 'jeans'], 'jeans');
    expect(r.worn).toEqual(['t_shirt']);
    expect(r.removed).toBe('jeans');
  });

  it('allows one of each outer slot and layers across slots', () => {
    let worn: GarmentId[] = [];
    for (const id of [
      't_shirt',
      'long_sleeve',
      'sweater',
      'winter_coat',
      'thermal_bottoms',
      'jeans',
      'toque',
      'scarf',
      'gloves',
      'wool_socks',
      'winter_boots',
    ] as const) {
      worn = toggleGarment(worn, id).worn;
    }
    expect(worn).toHaveLength(11);
    expect(slotConflicts(worn)).toEqual([]);
    worn = toggleGarment(worn, 'rain_shell').worn;
    expect(worn).not.toContain('winter_coat');
    worn = toggleGarment(worn, 'snow_pants').worn;
    expect(worn).not.toContain('jeans');
    expect(worn).toContain('thermal_bottoms');
  });

  it('sorts head to feet', () => {
    expect(sortOutfit(['winter_boots', 'jeans', 'toque', 't_shirt'])).toEqual([
      'toque',
      't_shirt',
      'jeans',
      'winter_boots',
    ]);
    expect(GARMENT_BY_ID.scarf.slot).toBe('neck');
  });
});

describe('backdrops (TDD §8.6)', () => {
  it('picks city / arctic / beach from conditions, with a manual override', async () => {
    const { chooseBackdrop } = await import('../../src/data/backdrops');
    const base = {
      tAir: 15,
      snowDepthM: 0,
      isDay: true,
      cloudCover: 50,
      precipMmH: 0,
      weatherCode: 3,
    };
    expect(chooseBackdrop(base)).toBe('city');
    expect(chooseBackdrop({ ...base, snowDepthM: 0.1 })).toBe('arctic');
    expect(chooseBackdrop({ ...base, tAir: -12 })).toBe('arctic');
    expect(chooseBackdrop({ ...base, tAir: 31, cloudCover: 10 })).toBe('beach');
    expect(chooseBackdrop({ ...base, tAir: 31, cloudCover: 10, isDay: false })).toBe('city');
    expect(chooseBackdrop({ ...base, tAir: 31, cloudCover: 90 })).toBe('city');
    expect(chooseBackdrop({ ...base, tAir: 31, cloudCover: 60, weatherCode: 1 })).toBe('beach');
    expect(chooseBackdrop({ ...base, tAir: 31, cloudCover: 10, precipMmH: 2 })).toBe('city');
    expect(chooseBackdrop({ ...base, tAir: -12 }, 'beach')).toBe('beach');
    expect(chooseBackdrop(null)).toBe('city');
  });
});
