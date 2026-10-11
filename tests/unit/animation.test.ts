import { describe, expect, it } from 'vitest';
import {
  MIN_DWELL_MS,
  additiveTargets,
  bandOf,
  initialAnimState,
  nextAnimState,
  targetState,
  type AnimInputs,
  type AnimState,
} from '../../src/scene/animation/stateMachine';

const inputs = (perceived: number, extra: Partial<AnimInputs> = {}): AnimInputs => ({
  perceived,
  flags: [],
  zones: {},
  glare: false,
  wind: 0,
  events: [],
  reducedMotion: false,
  ...extra,
});

function run(s: AnimState, i: AnimInputs, ms: number, step = 50): AnimState {
  for (let t = 0; t < ms; t += step) s = nextAnimState(s, i, step);
  return s;
}

describe('animation state machine (TDD §7)', () => {
  it('maps perceived to body states on the comfort bands', () => {
    expect(bandOf(22)).toBe('comfortable');
    expect(bandOf(-12)).toBe('freezing');
    expect(bandOf(41)).toBe('heat_distress');
  });

  it('applies 0.75 °C hysteresis in both directions', () => {
    expect(targetState('comfortable', { perceived: 19.5, flags: [] })).toBe('comfortable');
    expect(targetState('comfortable', { perceived: 19.2, flags: [] })).toBe('cool');
    expect(targetState('cool', { perceived: 20.5, flags: [] })).toBe('cool');
    expect(targetState('cool', { perceived: 20.8, flags: [] })).toBe('comfortable');
  });

  it('jumps several states at once when far away', () => {
    expect(targetState('comfortable', { perceived: -20, flags: [] })).toBe('freezing');
  });

  it('heat_danger forces heat distress', () => {
    expect(targetState('warm', { perceived: 30, flags: ['heat_danger'] })).toBe('heat_distress');
  });

  it('respects the 2 s minimum dwell and keeps only the latest pending state', () => {
    let s = initialAnimState({ perceived: 22, flags: [] });
    s = nextAnimState(s, inputs(10), 16); // dwell already satisfied at start → switches
    expect(s.state).toBe('chilly');
    s = nextAnimState(s, inputs(0.5), 500);
    expect(s.state).toBe('chilly');
    expect(s.pending).toBe('cold');
    s = nextAnimState(s, inputs(-5), 500);
    expect(s.pending).toBe('very_cold');
    s = run(s, inputs(-5), MIN_DWELL_MS);
    expect(s.state).toBe('very_cold');
  });

  it('cross-fades over 0.4 s', () => {
    let s = initialAnimState({ perceived: 22, flags: [] });
    s = nextAnimState(s, inputs(10), 16);
    expect(s.fade).toEqual({ from: 'comfortable', t: 0 });
    s = nextAnimState(s, inputs(10), 200);
    expect(s.fade.t).toBeCloseTo(0.5, 5);
    s = nextAnimState(s, inputs(10), 400);
    expect(s.fade.t).toBe(1);
  });

  it('lerps additive weights at 2/s toward the state targets', () => {
    let s = initialAnimState({ perceived: -15, flags: [] });
    s = nextAnimState(s, inputs(-15), 250);
    expect(s.weights.shiver).toBeCloseTo(0.5, 5);
    s = nextAnimState(s, inputs(-15), 1000);
    expect(s.weights.shiver).toBe(1);
  });

  it('rubs hands when hands are cold', () => {
    const t = additiveTargets('cold', inputs(3, { zones: { hands: 'freezing' } }));
    expect(t.hand_rub).toBe(1);
    expect(additiveTargets('comfortable', inputs(22, { zones: { hands: 'cold' } })).hand_rub).toBe(
      0,
    );
  });

  it('turns events into one-shots that expire', () => {
    let s = initialAnimState({ perceived: 22, flags: [] });
    s = nextAnimState(s, inputs(22, { events: ['garment_added', 'gust'] }), 16);
    expect(s.oneShots.map((o) => o.kind).sort()).toEqual(['adjust_clothes', 'brace']);
    s = run(s, inputs(22), 2000);
    expect(s.oneShots).toEqual([]);
  });

  it('wipes the brow periodically when hot, deterministically', () => {
    const a = run(initialAnimState({ perceived: 31, flags: [] }, 7), inputs(31), 20_000);
    const b = run(initialAnimState({ perceived: 31, flags: [] }, 7), inputs(31), 20_000);
    expect(a).toEqual(b);
    let shots = 0;
    let s = initialAnimState({ perceived: 31, flags: [] }, 7);
    for (let t = 0; t < 30_000; t += 50) {
      const n = nextAnimState(s, inputs(31), 50);
      if (n.oneShots.length > s.oneShots.length) shots++;
      s = n;
    }
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(5);
  });

  it('reduced motion: immediate state change, no additives or one-shots', () => {
    let s = initialAnimState({ perceived: -15, flags: [] });
    s = nextAnimState(s, inputs(-15), 1000);
    s = nextAnimState(s, inputs(31, { reducedMotion: true, events: ['gust'] }), 16);
    expect(s.state).toBe('hot');
    expect(s.fade.t).toBe(1);
    expect(Object.values(s.weights).every((w) => w === 0)).toBe(true);
    expect(s.oneShots).toEqual([]);
  });

  it('heat distress preempts the dwell', () => {
    let s = initialAnimState({ perceived: 22, flags: [] });
    s = nextAnimState(s, inputs(30), 16);
    expect(s.state).toBe('hot');
    s = nextAnimState(s, inputs(41), 16);
    expect(s.state).toBe('heat_distress');
  });
});
