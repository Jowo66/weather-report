import { describe, expect, it } from 'vitest';
import {
  BODY_STATES,
  initialAnimState,
  nextAnimState,
} from '../../src/scene/animation/stateMachine';
import { JOINTS, basePose, blendPoses, composePose } from '../../src/scene/animation/clips';
import { skinResponse } from '../../src/scene/materials/skinResponse';
import { MONK_SCALE, presetMelanin, skinHex, skinRgb } from '../../src/scene/skinTone';
import { migrateAvatar, normaliseBuild } from '../../src/state/avatarStore';

describe('pose library', () => {
  it('every body state has a finite, distinct static pose', () => {
    const sigs = new Set<string>();
    for (const s of BODY_STATES) {
      const p = basePose(s);
      for (const j of JOINTS)
        for (const v of p.rot[j] ?? [0, 0, 0]) expect(Number.isFinite(v)).toBe(true);
      sigs.add(JSON.stringify(p));
    }
    expect(sigs.size).toBe(BODY_STATES.length);
  });

  it('blends linearly', () => {
    const a = basePose('comfortable');
    const b = basePose('freezing');
    expect(blendPoses(a, b, 0).hipsY).toBe(a.hipsY);
    expect(blendPoses(a, b, 1).hipsY).toBeCloseTo(b.hipsY, 9);
  });

  it('reduced motion holds the static pose exactly', () => {
    let s = initialAnimState({ perceived: -15, flags: [] });
    s = nextAnimState(
      s,
      {
        perceived: -15,
        flags: [],
        zones: {},
        glare: false,
        wind: 0,
        events: [],
        reducedMotion: true,
      },
      100,
    );
    expect(composePose(s, 1.234, true)).toEqual(basePose('freezing'));
    expect(composePose(s, 9.87, true)).toEqual(composePose(s, 1.234, true));
  });

  it('shivering moves the spine over time', () => {
    let s = initialAnimState({ perceived: -15, flags: [] });
    s = nextAnimState(
      s,
      {
        perceived: -15,
        flags: [],
        zones: {},
        glare: false,
        wind: 0,
        events: [],
        reducedMotion: false,
      },
      1000,
    );
    const a = composePose(s, 0.1, false).rot.spine!;
    const b = composePose(s, 0.13, false).rot.spine!;
    expect(a).not.toEqual(b);
  });
});

describe('skin response (TDD §8.4)', () => {
  it('maps zone states to channels', () => {
    const r = skinResponse({ hands: 'freezing', torso: 'hot' }, 'comfortable');
    expect(r.hands).toMatchObject({ coldFlush: 0.8, pallor: 0.4 });
    expect(r.torso).toMatchObject({ heatFlush: 0.5, sweat: 0.6 });
    expect(r.legs.coldFlush).toBe(0);
  });
  it('adds frost to the head only when freezing', () => {
    const r = skinResponse({}, 'freezing');
    expect(r.head.frost).toBe(1);
    expect(r.torso.frost).toBe(0);
  });
  it('never depends on skin tone (no tone input)', () => {
    expect(skinResponse.length).toBe(2);
  });
});

describe('skin tone ramp', () => {
  it('hits the Monk presets exactly', () => {
    MONK_SCALE.forEach((hex, i) => expect(skinHex(presetMelanin(i))).toBe(hex));
  });
  it('is continuous and gets darker', () => {
    const lum = (m: number) => skinRgb(m).reduce((a, b) => a + b, 0);
    expect(lum(0.3)).toBeGreaterThan(lum(0.7));
  });
});

describe('avatar store', () => {
  it('normalises build blends', () => {
    expect(normaliseBuild({ slim: 1, heavy: 3 })).toEqual({
      slim: 0.25,
      average: 0,
      muscular: 0,
      heavy: 0.75,
    });
    expect(normaliseBuild({})).toEqual({ slim: 0, average: 1, muscular: 0, heavy: 0 });
  });
  it('migrates v1 (offset only) to v2', () => {
    const s = migrateAvatar({ personalOffset: 9 }, 1);
    expect(s.personalOffset).toBe(3);
    expect(s).toMatchObject({ frame: 0, hairStyle: 'short' });
  });
});
