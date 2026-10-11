import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  Skeleton,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  BoxGeometry,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AvatarAppearance, BuildPreset } from '../state/avatarStore';

/**
 * Procedural, self-made humanoid (PRODUCT_SPEC D1 fallback: "fully stylised low-poly built in
 * code"). One skeleton; the body, face, hair and every garment are each ONE SkinnedMesh with
 * rigid weights, so the avatar costs ~1 draw call per garment (TDD §14: ≤ 30).
 */
export const BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'torsoShell',
  'neck',
  'head',
  'eyeL',
  'eyeR',
  'browL',
  'browR',
  'mouth',
  'hair',
  'hairSway',
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
  'hem',
  'scarfTail',
] as const;
export type BoneName = (typeof BONES)[number];

export const ZONE_INDEX = { head: 0, torso: 1, arms: 2, hands: 3, legs: 4, feet: 5 } as const;

export interface Dims {
  scale: number;
  hipsY: number;
  spineLen: number;
  chestLen: number;
  neckLen: number;
  shoulderX: number;
  hipX: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
  torsoR: number;
  torsoW: number;
  torsoD: number;
  armR: number;
  foreR: number;
  thighR: number;
  shinR: number;
  headR: number;
  senior: boolean;
}

const BUILD: Record<BuildPreset, { limb: number; torso: number; shoulder: number }> = {
  slim: { limb: 0.86, torso: 0.88, shoulder: 0.97 },
  average: { limb: 1, torso: 1, shoulder: 1 },
  muscular: { limb: 1.14, torso: 1.06, shoulder: 1.08 },
  heavy: { limb: 1.18, torso: 1.32, shoulder: 1.04 },
};

export function dimsFor(a: AvatarAppearance): Dims {
  const w = (k: 'limb' | 'torso' | 'shoulder') =>
    (Object.keys(BUILD) as BuildPreset[]).reduce((s, b) => s + a.build[b] * BUILD[b][k], 0);
  const f = a.frame;
  const limb = w('limb');
  const torso = w('torso');
  return {
    scale: 1 + 0.06 * a.height,
    hipsY: 0.95,
    spineLen: 0.2,
    chestLen: 0.24,
    neckLen: 0.06,
    shoulderX: (0.175 - 0.012 * f) * w('shoulder'),
    hipX: 0.085 + 0.012 * f + 0.01 * (torso - 1),
    upperArm: 0.29,
    foreArm: 0.26,
    thigh: 0.43,
    shin: 0.43,
    torsoR: 0.115 * torso,
    torsoW: 1.32 - 0.05 * f,
    torsoD: 0.78 + 0.08 * (torso - 1),
    armR: 0.05 * limb,
    foreR: 0.042 * limb,
    thighR: 0.075 * limb * (1 + 0.06 * Math.max(0, f)),
    shinR: 0.053 * limb,
    headR: 0.105,
    senior: a.ageLook === 'senior',
  };
}

export interface Rig {
  root: Bone;
  bones: Record<BoneName, Bone>;
  skeleton: Skeleton;
  dims: Dims;
}

export function buildRig(d: Dims): Rig {
  const b = Object.fromEntries(
    BONES.map((n) => [n, Object.assign(new Bone(), { name: n })]),
  ) as Record<BoneName, Bone>;
  const link = (parent: BoneName, child: BoneName, x: number, y: number, z = 0) => {
    b[parent].add(b[child]);
    b[child].position.set(x, y, z);
  };
  b.root.scale.setScalar(d.scale);
  link('root', 'hips', 0, d.hipsY);
  link('hips', 'spine', 0, 0.02);
  link('spine', 'chest', 0, d.spineLen);
  link('chest', 'torsoShell', 0, -0.02);
  link('chest', 'neck', 0, d.chestLen);
  link('neck', 'head', 0, d.neckLen);
  link('head', 'eyeL', 0.036, 0.11, d.headR * 0.985);
  link('head', 'eyeR', -0.036, 0.11, d.headR * 0.985);
  link('head', 'browL', 0.038, 0.138, d.headR * 0.97);
  link('head', 'browR', -0.038, 0.138, d.headR * 0.97);
  link('head', 'mouth', 0, 0.05, d.headR * 0.93);
  link('head', 'hair', 0, 0.1);
  link('hair', 'hairSway', 0, 0.02, -0.06);
  for (const [s, sg] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    link('chest', `shoulder${s}`, sg * 0.04, d.chestLen - 0.04);
    link(`shoulder${s}`, `upperArm${s}`, sg * (d.shoulderX - 0.04), 0);
    link(`upperArm${s}`, `foreArm${s}`, 0, -d.upperArm);
    link(`foreArm${s}`, `hand${s}`, 0, -d.foreArm);
    link('hips', `thigh${s}`, sg * d.hipX, -0.04);
    link(`thigh${s}`, `shin${s}`, 0, -d.thigh);
    link(`shin${s}`, `foot${s}`, 0, -d.shin);
    b[`foreArm${s}`].rotation.order = 'YXZ';
  }
  link('hips', 'hem', 0, -0.02);
  link('chest', 'scarfTail', 0.05, d.chestLen - 0.02, d.torsoR * d.torsoD + 0.03);
  b.root.updateMatrixWorld(true);
  const skeleton = new Skeleton(BONES.map((n) => b[n]));
  return { root: b.root, bones: b, skeleton, dims: d };
}

export interface Part {
  bone: BoneName;
  geo: BufferGeometry;
  /** Local transform relative to the bone. */
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  zone?: number;
  color?: [number, number, number];
}

const _m = new Matrix4();
const _local = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Bake parts into one geometry in bind (rest) pose with rigid skin weights. */
export function bake(rig: Rig, parts: Part[]): BufferGeometry {
  const geos = parts.map((p) => {
    _e.set(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0);
    _local.compose(
      _p.set(...(p.at ?? [0, 0, 0])),
      _q.setFromEuler(_e),
      _s.set(...(p.scale ?? [1, 1, 1])),
    );
    _m.multiplyMatrices(rig.bones[p.bone].matrixWorld, _local);
    const geo = p.geo.clone().applyMatrix4(_m);
    p.geo.dispose();
    const n = geo.attributes.position!.count;
    const bi = BONES.indexOf(p.bone);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const zone = new Float32Array(n).fill(p.zone ?? 0);
    const col = new Float32Array(n * 3);
    const c = p.color ?? [1, 1, 1];
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 1;
      col.set(c, i * 3);
    }
    geo.setAttribute('skinIndex', new BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    geo.setAttribute('zone', new BufferAttribute(zone, 1));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    return geo;
  });
  // mergeGeometries needs all-indexed or all-non-indexed inputs.
  if (geos.some((g) => !g.index)) {
    for (let i = 0; i < geos.length; i++) {
      const g = geos[i]!;
      if (g.index) {
        geos[i] = g.toNonIndexed();
        g.dispose();
      }
    }
  }
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('mergeGeometries failed');
  geos.forEach((g) => g.dispose());
  return merged;
}

// ---- primitive helpers (Y-up, centred) ----
export const capsule = (r: number, len: number, seg = 10) =>
  new CapsuleGeometry(r, Math.max(0.001, len), 4, seg);
export const sphere = (r: number, w = 16, h = 12) => new SphereGeometry(r, w, h);
export const cap = (r: number, thetaLen = Math.PI / 2, w = 20) =>
  new SphereGeometry(r, w, 10, 0, Math.PI * 2, 0, thetaLen);
export const cyl = (rTop: number, rBot: number, h: number, open = false, seg = 16) =>
  new CylinderGeometry(rTop, rBot, h, seg, 1, open);
export const torus = (r: number, tube: number, arc = Math.PI * 2) =>
  new TorusGeometry(r, tube, 8, 20, arc);
export const box = (x: number, y: number, z: number) => new BoxGeometry(x, y, z);

/** Body mesh parts (skin), each tagged with its comfort zone. */
export function bodyParts(r: Rig): Part[] {
  const d = r.dims;
  const Z = ZONE_INDEX;
  const parts: Part[] = [
    {
      bone: 'torsoShell',
      geo: capsule(d.torsoR, d.chestLen + d.spineLen - 0.2),
      at: [0, -0.02, 0],
      scale: [d.torsoW, 1, d.torsoD],
      zone: Z.torso,
    },
    {
      bone: 'hips',
      geo: sphere(d.torsoR * 1.02),
      at: [0, -0.03, 0],
      scale: [d.torsoW * 0.98, 0.85, d.torsoD * 1.05],
      zone: Z.legs,
    },
    {
      bone: 'neck',
      geo: cyl(0.042, 0.048, d.neckLen + 0.04),
      at: [0, d.neckLen / 2, 0],
      zone: Z.head,
    },
    {
      bone: 'head',
      geo: sphere(d.headR, 24, 18),
      at: [0, 0.1, 0],
      scale: [0.95, 1.12, 1],
      zone: Z.head,
    },
    { bone: 'head', geo: sphere(0.016, 8, 6), at: [0, 0.085, d.headR * 0.98], zone: Z.head },
    {
      bone: 'head',
      geo: sphere(0.022, 8, 6),
      at: [d.headR * 0.93, 0.095, 0],
      scale: [0.5, 1, 0.8],
      zone: Z.head,
    },
    {
      bone: 'head',
      geo: sphere(0.022, 8, 6),
      at: [-d.headR * 0.93, 0.095, 0],
      scale: [0.5, 1, 0.8],
      zone: Z.head,
    },
  ];
  for (const s of ['L', 'R'] as const) {
    parts.push(
      { bone: `upperArm${s}`, geo: sphere(d.armR * 1.08), at: [0, -0.01, 0], zone: Z.arms },
      {
        bone: `upperArm${s}`,
        geo: capsule(d.armR, d.upperArm - 2 * d.armR),
        at: [0, -d.upperArm / 2, 0],
        zone: Z.arms,
      },
      {
        bone: `foreArm${s}`,
        geo: capsule(d.foreR, d.foreArm - 2 * d.foreR),
        at: [0, -d.foreArm / 2, 0],
        zone: Z.arms,
      },
      {
        bone: `hand${s}`,
        geo: sphere(0.042),
        at: [0, -0.055, 0.004],
        scale: [0.85, 1.55, 0.6],
        zone: Z.hands,
      },
      {
        bone: `thigh${s}`,
        geo: capsule(d.thighR, d.thigh - d.thighR),
        at: [0, -d.thigh / 2, 0],
        zone: Z.legs,
      },
      {
        bone: `shin${s}`,
        geo: capsule(d.shinR, d.shin - d.shinR),
        at: [0, -d.shin / 2, 0],
        zone: Z.legs,
      },
      {
        bone: `foot${s}`,
        geo: capsule(0.038, 0.13),
        at: [0, -0.012, 0.05],
        rot: [Math.PI / 2, 0, 0],
        scale: [1.15, 1, 0.8],
        zone: Z.feet,
      },
    );
  }
  return parts;
}

/** Eyes, brows and mouth; vertex-coloured. */
export function faceParts(browColor: [number, number, number]): Part[] {
  const dark: [number, number, number] = [0.08, 0.07, 0.07];
  return [
    { bone: 'eyeL', geo: sphere(0.0125, 10, 8), scale: [1, 1.15, 0.55], color: dark },
    { bone: 'eyeR', geo: sphere(0.0125, 10, 8), scale: [1, 1.15, 0.55], color: dark },
    { bone: 'browL', geo: box(0.034, 0.007, 0.01), color: browColor },
    { bone: 'browR', geo: box(0.034, 0.007, 0.01), color: browColor },
    { bone: 'mouth', geo: sphere(0.02, 12, 8), scale: [1.1, 0.35, 0.4], color: [0.35, 0.12, 0.12] },
  ];
}
