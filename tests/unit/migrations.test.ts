import { describe, expect, it, vi } from 'vitest';
import { migrateOutfit } from '../../src/state/outfitStore';

describe('persisted state migrations', () => {
  it('outfit v1 → v2 drops unknown ids, sorts and validates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = migrateOutfit(
      { worn: ['sneakers', 'cape', 't_shirt'], activity: 'flying', shade: 'yes' },
      1,
    );
    expect(s).toMatchObject({
      worn: ['t_shirt', 'sneakers'],
      activity: 'standing',
      shade: false,
      umbrella: false,
    });
    expect(warn).toHaveBeenCalledWith('Dropping unknown garment id: cape');
    warn.mockRestore();
  });

  it('is a no-op at the current version', () => {
    const s = { worn: ['jeans'], activity: 'walking' };
    expect(migrateOutfit(s, 2)).toEqual(s);
  });

  it('survives garbage', () => {
    expect(migrateOutfit(null, 1)).toMatchObject({
      worn: ['t_shirt', 'jeans', 'socks', 'sneakers'],
    });
  });
});
