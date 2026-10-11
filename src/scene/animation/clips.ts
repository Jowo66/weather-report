import { ADDITIVES, type AnimState, type BodyState, type OneShot } from './stateMachine';

/**
 * Procedural pose library (TDD §7.4: shiver etc. are procedural so no clips need authoring).
 * Joint rotations are Euler XYZ radians relative to the rest pose (arms down, facing +Z).
 * Left joints are on +X. Pure functions of time: no Three.js here.
 */
export const JOINTS = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'shoulderR',
  'upperArmL',
  'upperArmR',
  'foreArmL',
  'foreArmR',
  'handL',
  'handR',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
] as const;
export type Joint = (typeof JOINTS)[number];
export type Euler3 = [number, number, number];

export interface Pose {
  rot: Partial<Record<Joint, Euler3>>;
  /** Vertical hips offset (m), negative = lower (sitting, crouching). */
  hipsY: number;
  /** 0–1 face parameters. */
  face: { squint: number; mouthOpen: number; smile: number };
  /** Chest breathing scale offset. */
  breath: number;
}

const z3 = (): Euler3 => [0, 0, 0];

/** Build a symmetric arm/leg pose: `inward` rotates toward the body midline on both sides. */
function arms(o: {
  fwd: number;
  inward: number;
  elbow: number;
  twist?: number;
  foreYaw?: number;
  side?: 'L' | 'R' | 'both';
}): Partial<Record<Joint, Euler3>> {
  const out: Partial<Record<Joint, Euler3>> = {};
  const sides: ('L' | 'R')[] = o.side === 'L' ? ['L'] : o.side === 'R' ? ['R'] : ['L', 'R'];
  for (const s of sides) {
    const sg = s === 'L' ? 1 : -1;
    out[`upperArm${s}`] = [o.fwd, sg * (o.twist ?? 0), -sg * o.inward];
    out[`foreArm${s}`] = [o.elbow, -sg * (o.foreYaw ?? 0), 0];
  }
  return out;
}

const BASE: Record<BodyState, () => Pose> = {
  comfortable: () => ({
    rot: { ...arms({ fwd: -0.05, inward: -0.1, elbow: -0.12 }) },
    hipsY: 0,
    face: { squint: 0, mouthOpen: 0, smile: 1 },
    breath: 0,
  }),
  cool: () => ({
    // hands in pockets
    rot: { ...arms({ fwd: 0.18, inward: 0.12, elbow: -0.55, foreYaw: 0.15 }) },
    hipsY: 0,
    face: { squint: 0, mouthOpen: 0, smile: 0.4 },
    breath: 0,
  }),
  chilly: () => ({
    // arms crossed
    rot: {
      ...arms({ fwd: -0.35, inward: 0.18, elbow: -1.75, foreYaw: 0.9 }),
      chest: [0.04, 0, 0],
    },
    hipsY: 0,
    face: { squint: 0, mouthOpen: 0, smile: 0 },
    breath: 0,
  }),
  cold: () => ({
    // hug self
    rot: {
      ...arms({ fwd: -0.5, inward: 0.35, elbow: -1.95, foreYaw: 1.05 }),
      chest: [0.1, 0, 0],
      neck: [0.12, 0, 0],
    },
    hipsY: 0,
    face: { squint: 0.2, mouthOpen: 0, smile: -0.3 },
    breath: 0,
  }),
  very_cold: () => ({
    // hug self, hunched
    rot: {
      ...arms({ fwd: -0.6, inward: 0.42, elbow: -2.05, foreYaw: 1.15 }),
      spine: [0.16, 0, 0],
      chest: [0.14, 0, 0],
      neck: [0.18, 0, 0],
      thighL: [-0.12, 0, 0.03],
      thighR: [-0.12, 0, -0.03],
      shinL: [0.24, 0, 0],
      shinR: [0.24, 0, 0],
    },
    hipsY: -0.02,
    face: { squint: 0.4, mouthOpen: 0, smile: -0.6 },
    breath: 0,
  }),
  freezing: () => ({
    // hunched tight
    rot: {
      ...arms({ fwd: -0.7, inward: 0.5, elbow: -2.15, foreYaw: 1.2 }),
      spine: [0.26, 0, 0],
      chest: [0.18, 0, 0],
      neck: [0.24, 0, 0],
      thighL: [-0.22, 0, 0.06],
      thighR: [-0.22, 0, -0.06],
      shinL: [0.42, 0, 0],
      shinR: [0.42, 0, 0],
      footL: [-0.2, 0, 0],
      footR: [-0.2, 0, 0],
    },
    hipsY: -0.05,
    face: { squint: 0.7, mouthOpen: 0.2, smile: -1 },
    breath: 0,
  }),
  warm: () => ({
    rot: { ...arms({ fwd: 0, inward: -0.18, elbow: -0.1 }), chest: [-0.03, 0, 0] },
    hipsY: 0,
    face: { squint: 0, mouthOpen: 0, smile: 0.6 },
    breath: 0,
  }),
  hot: () => ({
    // fanning self with the right hand
    rot: {
      ...arms({ fwd: -0.05, inward: -0.15, elbow: -0.15, side: 'L' }),
      ...arms({ fwd: -1.25, inward: -0.25, elbow: -2.15, foreYaw: 0.9, side: 'R' }),
      neck: [-0.06, 0, 0],
    },
    hipsY: 0,
    face: { squint: 0.2, mouthOpen: 0.2, smile: -0.2 },
    breath: 0,
  }),
  overheated: () => ({
    // slumped
    rot: {
      ...arms({ fwd: 0.05, inward: -0.05, elbow: -0.05 }),
      spine: [0.16, 0, 0],
      chest: [0.1, 0, 0],
      neck: [0.22, 0, 0],
      thighL: [-0.1, 0, 0],
      thighR: [-0.1, 0, 0],
      shinL: [0.2, 0, 0],
      shinR: [0.2, 0, 0],
    },
    hipsY: -0.02,
    face: { squint: 0.4, mouthOpen: 0.5, smile: -0.6 },
    breath: 0,
  }),
  heat_distress: () => ({
    // sitting down on the ground (non-graphic)
    rot: {
      ...arms({ fwd: -0.85, inward: 0.15, elbow: -0.5 }),
      spine: [0.28, 0, 0],
      chest: [0.12, 0, 0],
      neck: [0.3, 0, 0],
      thighL: [-1.45, 0, 0.18],
      thighR: [-1.45, 0, -0.18],
      shinL: [1.55, 0, 0],
      shinR: [1.55, 0, 0],
      footL: [-0.3, 0, 0],
      footR: [-0.3, 0, 0],
    },
    hipsY: -0.72,
    face: { squint: 0.6, mouthOpen: 0.7, smile: -0.8 },
    breath: 0,
  }),
};

/** Comfortable idle variants: weight shift, look around, hands clasped. */
function idleVariant(v: number, p: Pose): Pose {
  if (v === 1) return { ...p, rot: { ...p.rot, hips: [0, 0.05, 0.04], head: [0, -0.25, 0.05] } };
  if (v === 2) {
    return {
      ...p,
      rot: {
        ...p.rot,
        ...arms({ fwd: -0.2, inward: 0.32, elbow: -0.75, foreYaw: 0.6 }),
        head: [0.05, 0.15, 0],
      },
    };
  }
  return p;
}

/** The static "first frame" pose for a state (used directly in reduced motion). */
export function basePose(state: BodyState, variant = 0): Pose {
  const p = BASE[state]();
  return state === 'comfortable' ? idleVariant(variant, p) : p;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const rot: Partial<Record<Joint, Euler3>> = {};
  for (const j of JOINTS) {
    const ra = a.rot[j] ?? z3();
    const rb = b.rot[j] ?? z3();
    if (a.rot[j] || b.rot[j])
      rot[j] = [lerp(ra[0], rb[0], t), lerp(ra[1], rb[1], t), lerp(ra[2], rb[2], t)];
  }
  return {
    rot,
    hipsY: lerp(a.hipsY, b.hipsY, t),
    face: {
      squint: lerp(a.face.squint, b.face.squint, t),
      mouthOpen: lerp(a.face.mouthOpen, b.face.mouthOpen, t),
      smile: lerp(a.face.smile, b.face.smile, t),
    },
    breath: lerp(a.breath, b.breath, t),
  };
}

function add(p: Pose, j: Joint, d: Euler3, w = 1) {
  const r = p.rot[j] ?? z3();
  p.rot[j] = [r[0] + d[0] * w, r[1] + d[1] * w, r[2] + d[2] * w];
}

/** Cheap deterministic pseudo-noise in [-1, 1]. */
function noise(t: number, k: number) {
  return Math.sin(t * 61.3 + k * 12.9) * 0.6 + Math.sin(t * 37.1 + k * 4.1) * 0.4;
}

function smoothPulse(x: number) {
  // 0 → 1 → 0 over x ∈ [0, 1]
  return Math.sin(Math.PI * Math.max(0, Math.min(1, x)));
}

function applyOneShot(p: Pose, o: OneShot) {
  const x = o.elapsedMs / o.durationMs;
  const w = smoothPulse(x);
  switch (o.kind) {
    case 'adjust_clothes':
      add(p, 'upperArmL', [-0.5, 0, -0.35], w);
      add(p, 'upperArmR', [-0.5, 0, 0.35], w);
      add(p, 'foreArmL', [-1.0, 0, 0], w);
      add(p, 'foreArmR', [-1.0, 0, 0], w);
      add(p, 'chest', [0.05, 0, 0], w);
      break;
    case 'shrug_off':
      add(p, 'shoulderL', [0, 0, 0.18], w);
      add(p, 'shoulderR', [0, 0, -0.18], w);
      add(p, 'head', [0, 0, 0.1 * Math.sin(x * Math.PI * 2)], w);
      break;
    case 'brace':
      add(p, 'spine', [0.15, 0, 0], w);
      add(p, 'neck', [0.15, 0, 0], w);
      add(p, 'upperArmL', [-0.2, 0, -0.2], w);
      add(p, 'upperArmR', [-0.2, 0, 0.2], w);
      break;
    case 'look_up':
      add(p, 'neck', [-0.35, 0, 0], w);
      add(p, 'head', [-0.25, 0, 0], w);
      break;
    case 'sleeve_push':
      add(p, 'upperArmR', [-0.6, 0, 0.3], w);
      add(p, 'foreArmR', [-1.5, 0, 0], w);
      add(p, 'upperArmL', [-0.3, 0, -0.1], w);
      add(p, 'foreArmL', [-1.3, 0, 0], w);
      break;
    case 'brow_wipe':
      add(p, 'upperArmL', [-1.45, 0, -0.45], w);
      add(p, 'foreArmL', [-2.0, -0.4 * Math.sin(x * Math.PI * 3), 0], w);
      add(p, 'head', [-0.1, 0, 0], w);
      break;
  }
}

/** Full pose for this frame: cross-faded base + additives + one-shots. `t` in seconds. */
export function composePose(s: AnimState, t: number, reducedMotion: boolean): Pose {
  const from = basePose(s.fade.from, 0);
  const to = basePose(s.state, s.idleVariant);
  const p = s.fade.t >= 1 ? to : blendPoses(from, to, s.fade.t);
  const pose: Pose = { ...p, rot: { ...p.rot }, face: { ...p.face } };
  if (reducedMotion) return pose;

  const w = s.weights;
  // Idle breathing is always on when motion is allowed.
  pose.breath +=
    0.012 * Math.sin(t * 2 * Math.PI * 0.25) +
    w.heavy_breathing * 0.04 * Math.sin(t * 2 * Math.PI * 0.9);
  pose.face.mouthOpen = Math.max(
    pose.face.mouthOpen,
    w.heavy_breathing * (0.5 + 0.3 * Math.sin(t * 2 * Math.PI * 0.9)),
  );
  add(pose, 'chest', [w.heavy_breathing * 0.04 * Math.sin(t * 2 * Math.PI * 0.9), 0, 0]);

  if (w.shiver > 0) {
    const a = 0.025 * w.shiver;
    add(pose, 'spine', [noise(t, 1) * a, noise(t, 2) * a, noise(t, 3) * a]);
    add(pose, 'chest', [noise(t, 4) * a, 0, noise(t, 5) * a]);
    add(pose, 'shoulderL', [0, 0, noise(t, 6) * a * 1.5]);
    add(pose, 'shoulderR', [0, 0, noise(t, 7) * a * 1.5]);
    add(pose, 'head', [noise(t, 8) * a, noise(t, 9) * a, 0]);
  }
  if (w.shoulders_raise > 0) {
    add(pose, 'shoulderL', [0, 0, 0.16], w.shoulders_raise);
    add(pose, 'shoulderR', [0, 0, -0.16], w.shoulders_raise);
    add(pose, 'neck', [0.04, 0, 0], w.shoulders_raise);
  }
  if (w.teeth_chatter > 0) {
    pose.face.mouthOpen = Math.max(
      pose.face.mouthOpen,
      w.teeth_chatter * 0.15 * (1 + Math.sin(t * 2 * Math.PI * 9)),
    );
  }
  if (w.hand_rub > 0) {
    const r = 0.18 * Math.sin(t * 2 * Math.PI * 3) * w.hand_rub;
    add(pose, 'foreArmL', [0, r, 0]);
    add(pose, 'foreArmR', [0, r, 0]);
  }
  if (w.foot_stamp > 0) {
    const cyc = (t * 1.1) % 2;
    const lift = Math.max(0, Math.sin(Math.PI * (cyc % 1))) ** 2 * 0.35 * w.foot_stamp;
    const j = cyc < 1 ? 'L' : 'R';
    add(pose, `thigh${j}`, [-lift, 0, 0]);
    add(pose, `shin${j}`, [lift * 1.4, 0, 0]);
  }
  if (s.state === 'hot') {
    // fanning
    add(pose, 'foreArmR', [0, 0.35 * Math.sin(t * 2 * Math.PI * 2.2), 0]);
    add(pose, 'handR', [0, 0, 0.5 * Math.sin(t * 2 * Math.PI * 2.2)]);
  }
  if (w.squint > 0) pose.face.squint = Math.max(pose.face.squint, 0.8 * w.squint);
  // Gentle idle sway.
  add(pose, 'hips', [0, 0, 0.012 * Math.sin(t * 2 * Math.PI * 0.12)]);
  add(pose, 'head', [0, 0.04 * Math.sin(t * 2 * Math.PI * 0.07), 0]);

  for (const o of s.oneShots) applyOneShot(pose, o);
  return pose;
}

export { ADDITIVES };
