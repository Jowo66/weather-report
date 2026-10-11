import { describe, expect, it } from 'vitest';
import { explain } from '../../src/engine';
import { factorText } from '../../src/ui/lib/comfortCopy';
import { formatDelta, formatTemp, formatWind } from '../../src/ui/lib/format';
import { buildShare, parseShare } from '../../src/ui/lib/shareUrl';
import { localeDefaults } from '../../src/state/settingsStore';
import { sanitizeOutfit } from '../../src/state/outfitStore';

describe('format', () => {
  it('converts temperatures and avoids -0', () => {
    expect(formatTemp(-0.2, 'C')).toBe('0°C');
    expect(formatTemp(20, 'F')).toBe('68°F');
    expect(formatTemp(14.4, 'C', { unitLabel: false })).toBe('14°');
  });
  it('converts deltas without the offset', () => {
    expect(formatDelta(-5, 'F')).toBe('9°F');
    expect(formatDelta(6.4, 'C')).toBe('6°C');
  });
  it('converts wind', () => {
    expect(formatWind(16.09344, 'mph')).toBe('10 mph');
    expect(formatWind(25, 'kmh')).toBe('25 km/h');
  });
  it('defaults to imperial only for imperial regions', () => {
    expect(localeDefaults('en-US')).toEqual({ tempUnit: 'F', windUnit: 'mph' });
    expect(localeDefaults('en-CA')).toEqual({ tempUnit: 'C', windUnit: 'kmh' });
    expect(localeDefaults('fr')).toEqual({ tempUnit: 'C', windUnit: 'kmh' });
  });
});

describe('shareable URL', () => {
  it('round-trips place, outfit and activity', () => {
    const s = buildShare({
      place: { id: 1, name: 'Toronto', latitude: 43.6532, longitude: -79.3832 },
      outfit: ['t_shirt', 'jeans'],
      activity: 'walking',
    });
    expect(s).toBe('?c=43.65,-79.38&n=Toronto&o=t_shirt,jeans&a=walking');
    const p = parseShare(s);
    expect(p.place).toMatchObject({ name: 'Toronto', latitude: 43.65, longitude: -79.38 });
    expect(p.outfit).toEqual(['t_shirt', 'jeans']);
    expect(p.activity).toBe('walking');
  });
  it('ignores invalid values', () => {
    const p = parseShare('?c=999,0&o=t_shirt,ball_gown,t_shirt&a=flying');
    expect(p.place).toBeUndefined();
    expect(p.outfit).toEqual(['t_shirt']);
    expect(p.activity).toBeUndefined();
  });
  it('sanitizes persisted outfits', () => {
    expect(sanitizeOutfit(['jeans', 'nope', 'jeans'])).toEqual(['jeans']);
    expect(sanitizeOutfit('junk')).toEqual(['t_shirt', 'jeans', 'socks', 'sneakers']);
  });
});

describe('explanation (TDD §4.12)', () => {
  const ctx = { activity: 'standing', shade: false, umbrella: false, personalOffset: 0 } as const;
  it('ranks wind and the coat for a windy winter day', () => {
    const w = {
      tAir: -15,
      rh: 70,
      windKmh: 30,
      ghi: 0,
      dni: 0,
      dhi: 0,
      sunAlt: 0,
      precipMmH: 0,
      snowDepthM: 0,
    };
    const e = explain(w, ['t_shirt', 'winter_coat', 'jeans', 'socks', 'sneakers'], ctx);
    expect(e.top.length).toBeGreaterThan(0);
    const wind = e.all.find((f) => f.kind === 'wind');
    expect(wind && wind.delta).toBeLessThan(0);
    const garment = e.all.find((f) => f.kind === 'garment');
    expect(garment).toMatchObject({ kind: 'garment', garment: 'winter_coat' });
    expect(garment!.delta).toBeGreaterThan(0);
    expect(factorText(wind!, 'C')).toMatch(/^Wind is taking \d+°C off$/);
    expect(factorText(garment!, 'C')).toMatch(/^Your winter coat adds \d+°C$/);
  });
  it('reports sun on a sunny day', () => {
    const w = {
      tAir: 20,
      rh: 50,
      windKmh: 2,
      ghi: 800,
      dni: 850,
      dhi: 120,
      sunAlt: 60,
      precipMmH: 0,
      snowDepthM: 0,
    };
    const e = explain(w, ['t_shirt', 'jeans'], ctx);
    expect(e.top[0]).toMatchObject({ kind: 'sun' });
  });
});

describe('copy', () => {
  it('uses plural verbs for plural garments', () => {
    expect(factorText({ kind: 'garment', garment: 'jeans', delta: 3 }, 'C')).toBe(
      'Your jeans add 3°C',
    );
    expect(factorText({ kind: 'garment', garment: 'toque', delta: -1 }, 'C')).toBe(
      'Your toque takes 1°C off',
    );
  });
});
