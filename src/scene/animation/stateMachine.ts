import type { ComfortState, Flag, ZoneId, ZoneState } from '../../engine';

/** Body states (TDD §7.2), coldest → hottest. */
export const BODY_STATES = [
  'freezing',
  'very_cold',
  'cold',
  'chilly',
  'cool',
  'comfortable',
  'warm',
  'hot',
  'overheated',
  'heat_distress',
] as const;
export type BodyState = (typeof BODY_STATES)[number];

/** Lower bound (perceived °C) of each body state. */
const LOWER: Record<BodyState, number> = {
  freezing: -Infinity,
  very_cold: -10,
  cold: 0,
  chilly: 8,
  cool: 15,
  comfortable: 20,
  warm: 26,
  hot: 29,
  overheated: 34,
  heat_distress: 40,
};

export const HYSTERESIS = 0.75;
export const MIN_DWELL_MS = 2000;
export const CROSSFADE_MS = 400;
export const ONESHOT_FADE_MS = 250;
export const ADDITIVE_RATE = 2; // weight units per second

export type Additive =
  | 'shiver'
  | 'shoulders_raise'
  | 'hand_rub'
  | 'foot_stamp'
  | 'teeth_chatter'
  | 'brow_wipe'
  | 'heavy_breathing'
  | 'squint'
  | 'sway';
export const ADDITIVES: readonly Additive[] = [
  'shiver',
  'shoulders_raise',
  'hand_rub',
  'foot_stamp',
  'teeth_chatter',
  'brow_wipe',
  'heavy_breathing',
  'squint',
  'sway',
];

export type OneShotKind =
  'adjust_clothes' | 'shrug_off' | 'brace' | 'look_up' | 'sleeve_push' | 'brow_wipe';
export const ONESHOT_MS: Record<OneShotKind, number> = {
  adjust_clothes: 1200,
  shrug_off: 1000,
  brace: 1400,
  look_up: 1600,
  sleeve_push: 1200,
  brow_wipe: 1300,
};

export type AnimEvent = 'garment_added' | 'garment_removed' | 'gust' | 'rain_start';

export interface AnimInputs {
  perceived: number;
  flags: readonly Flag[];
  zones: Partial<Record<ZoneId, ZoneState>>;
  /** Bright direct sun on the face (not in shade). */
  glare: boolean;
  /** 0–1, body-level wind for hair/cloth sway. */
  wind: number;
  events: readonly AnimEvent[];
  reducedMotion: boolean;
}

export interface OneShot {
  kind: OneShotKind;
  elapsedMs: number;
  durationMs: number;
}

export interface AnimState {
  state: BodyState;
  /** Latest queued transition while the minimum dwell runs. */
  pending: BodyState | null;
  dwellMs: number;
  /** Cross-fade from the previous state's pose; t ∈ [0,1], 1 = done. */
  fade: { from: BodyState; t: number };
  weights: Record<Additive, number>;
  oneShots: OneShot[];
  /** Comfortable idle variant (0–2), switched every 8–15 s. */
  idleVariant: number;
  idleTimerMs: number;
  /** ms until the next periodic brow wipe (hot states). */
  browTimerMs: number;
  /** Deterministic LCG state (no Math.random in the reducer). */
  seed: number;
}

const ZERO_WEIGHTS = Object.fromEntries(ADDITIVES.map((a) => [a, 0])) as Record<Additive, number>;

function rand(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 2 ** 32, next];
}

export function bandOf(perceived: number): BodyState {
  for (let i = BODY_STATES.length - 1; i >= 0; i--) {
    const s = BODY_STATES[i]!;
    if (perceived >= LOWER[s]) return s;
  }
  return 'freezing';
}

const rank = (s: BodyState) => BODY_STATES.indexOf(s);

/** Target body state with hysteresis h around every boundary (TDD §7.3). */
export function targetState(
  current: BodyState,
  inputs: Pick<AnimInputs, 'perceived' | 'flags'>,
  h = HYSTERESIS,
): BodyState {
  if (inputs.flags.includes('heat_danger')) return 'heat_distress';
  const raw = bandOf(inputs.perceived);
  if (raw === current) return current;
  if (rank(raw) > rank(current)) {
    const s = bandOf(inputs.perceived - h);
    return rank(s) > rank(current) ? s : current;
  }
  const s = bandOf(inputs.perceived + h);
  return rank(s) < rank(current) ? s : current;
}

export function bodyStateFromComfort(c: ComfortState, flags: readonly Flag[] = []): BodyState {
  if (c === 'dangerous_heat' || flags.includes('heat_danger')) return 'heat_distress';
  return c;
}

export function initialAnimState(
  inputs: Pick<AnimInputs, 'perceived' | 'flags'>,
  seed = 1,
): AnimState {
  const state = inputs.flags.includes('heat_danger') ? 'heat_distress' : bandOf(inputs.perceived);
  return {
    state,
    pending: null,
    dwellMs: MIN_DWELL_MS,
    fade: { from: state, t: 1 },
    weights: { ...ZERO_WEIGHTS },
    oneShots: [],
    idleVariant: 0,
    idleTimerMs: 10_000,
    browTimerMs: 8000,
    seed,
  };
}

const COLD_ZONE: ReadonlySet<ZoneState> = new Set(['cold', 'freezing', 'numb']);

/** Additive targets for a body state + zone/flag context (TDD §7.2 table). */
export function additiveTargets(s: BodyState, inputs: AnimInputs): Record<Additive, number> {
  const w = { ...ZERO_WEIGHTS };
  switch (s) {
    case 'chilly':
      w.shoulders_raise = 0.5;
      break;
    case 'cold':
      w.shiver = 0.4;
      w.shoulders_raise = 0.6;
      break;
    case 'very_cold':
      w.shiver = 0.8;
      w.shoulders_raise = 0.8;
      w.foot_stamp = 1;
      break;
    case 'freezing':
      w.shiver = 1;
      w.shoulders_raise = 1;
      w.teeth_chatter = 1;
      break;
    case 'overheated':
      w.heavy_breathing = 0.7;
      break;
    case 'heat_distress':
      w.heavy_breathing = 1;
      break;
    default:
      break;
  }
  const hands = inputs.zones.hands;
  if (hands && COLD_ZONE.has(hands) && rank(s) <= rank('cold') && s !== 'heat_distress')
    w.hand_rub = 1;
  if (inputs.glare) w.squint = 1;
  w.sway = Math.max(0, Math.min(1, inputs.wind));
  return w;
}

function approach(v: number, target: number, maxStep: number) {
  return v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);
}

const EVENT_SHOT: Record<AnimEvent, OneShotKind> = {
  garment_added: 'adjust_clothes',
  garment_removed: 'shrug_off',
  gust: 'brace',
  rain_start: 'look_up',
};

/**
 * Pure reducer: advance the animation state by `dtMs` given the latest inputs.
 * No Three.js, no clocks, no Math.random: unit-testable and deterministic.
 */
export function nextAnimState(prev: AnimState, inputs: AnimInputs, dtMs: number): AnimState {
  const dt = Math.max(0, dtMs);
  let { state, pending, dwellMs, fade, idleVariant, idleTimerMs, browTimerMs, seed } = prev;
  dwellMs += dt;

  const target = targetState(state, inputs);
  // HeatDistress has priority: it preempts the dwell.
  const urgent = target === 'heat_distress' && state !== 'heat_distress';
  if (target !== state) pending = target;
  else pending = null;

  let oneShots = inputs.reducedMotion
    ? []
    : prev.oneShots
        .map((o) => ({ ...o, elapsedMs: o.elapsedMs + dt }))
        .filter((o) => o.elapsedMs < o.durationMs);

  if (pending && (dwellMs >= MIN_DWELL_MS || urgent || inputs.reducedMotion)) {
    const from = state;
    state = pending;
    pending = null;
    dwellMs = 0;
    fade = { from, t: inputs.reducedMotion ? 1 : 0 };
    if (!inputs.reducedMotion && state === 'warm' && rank(from) < rank('warm')) {
      oneShots.push({ kind: 'sleeve_push', elapsedMs: 0, durationMs: ONESHOT_MS.sleeve_push });
    }
  } else if (fade.t < 1) {
    fade = { from: fade.from, t: Math.min(1, fade.t + dt / CROSSFADE_MS) };
  }

  // Events → one-shots (interrupt additives only); at most one of each kind at a time.
  if (!inputs.reducedMotion && state !== 'heat_distress') {
    for (const e of inputs.events) {
      const kind = EVENT_SHOT[e];
      if (!oneShots.some((o) => o.kind === kind))
        oneShots.push({ kind, elapsedMs: 0, durationMs: ONESHOT_MS[kind] });
    }
  }

  // Periodic brow wipe while hot / overheated, every 6–10 s.
  if (state === 'hot' || state === 'overheated') {
    browTimerMs -= dt;
    if (browTimerMs <= 0) {
      let r: number;
      [r, seed] = rand(seed);
      browTimerMs = 6000 + r * 4000;
      if (!inputs.reducedMotion && !oneShots.some((o) => o.kind === 'brow_wipe')) {
        oneShots.push({ kind: 'brow_wipe', elapsedMs: 0, durationMs: ONESHOT_MS.brow_wipe });
      }
    }
  }

  // Comfortable idle variants every 8–15 s (lowest priority).
  if (state === 'comfortable' && !inputs.reducedMotion) {
    idleTimerMs -= dt;
    if (idleTimerMs <= 0) {
      let r: number;
      [r, seed] = rand(seed);
      idleVariant = (idleVariant + 1 + Math.floor(r * 2)) % 3;
      [r, seed] = rand(seed);
      idleTimerMs = 8000 + r * 7000;
    }
  } else {
    idleVariant = 0;
  }

  const targets = additiveTargets(state, inputs);
  const weights = { ...prev.weights };
  for (const a of ADDITIVES) {
    weights[a] = inputs.reducedMotion
      ? 0
      : approach(weights[a], targets[a], (ADDITIVE_RATE * dt) / 1000);
  }
  if (oneShots.length > 4) oneShots = oneShots.slice(-4);

  return {
    state,
    pending,
    dwellMs,
    fade,
    weights,
    oneShots,
    idleVariant,
    idleTimerMs,
    browTimerMs,
    seed,
  };
}

/** Whether anything is still moving (drives the demand render loop). */
export function isAnimating(s: AnimState, reducedMotion: boolean): boolean {
  if (reducedMotion) return s.fade.t < 1;
  return true; // idle breathing and sway always run when motion is allowed
}
