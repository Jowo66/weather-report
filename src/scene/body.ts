import { BufferGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GarmentId } from '../engine';
import { GARMENT_BY_ID } from '../data/garments';
import {
  bake,
  capsule,
  cap,
  sphere,
  torus,
  ZONE_INDEX,
  type BoneName,
  type Part,
  type Rig,
} from './rig';
import { densify, inflate, sweep, slice, type Ring } from './sweep';

/**
 * Smooth stylised body (replaces the capsule "puppet"): torso, arms and legs are each one
 * continuous swept surface with blended weights at the joints; the head is a sculpted sphere.
 * Garments are cut from the same ring stacks, so they deform exactly like the body.
 */
const Z = ZONE_INDEX;
/** Segment count scaled by the rig's detail level. */
const q = (r: Rig, n: number) => Math.max(10, Math.round(n * r.detail));
type Side = 'L' | 'R';
const SIDES: Side[] = ['L', 'R'];
const sgn = (s: Side) => (s === 'L' ? 1 : -1);

export interface BodyRings {
  torso: Ring[];
  arm: Record<Side, Ring[]>;
  leg: Record<Side, Ring[]>;
  /** Key heights (unscaled model space). */
  y: {
    crotch: number;
    waist: number;
    hip: number;
    chest: number;
    shoulder: number;
    neckBase: number;
    neckTop: number;
    headCenter: number;
    elbow: number;
    wrist: number;
    knee: number;
    ankle: number;
  };
  headR: number;
}

function wp(r: Rig, b: BoneName): Vector3 {
  return r.bones[b].getWorldPosition(new Vector3()).divideScalar(r.dims.scale);
}

const ring = (y: number, rx: number, rz: number, w: Ring['w'], o: Partial<Ring> = {}): Ring => ({
  y,
  cx: 0,
  cz: 0,
  rx,
  rz,
  p: 2,
  w,
  ...o,
});

export function bodyRings(r: Rig, frame: number): BodyRings {
  const d = r.dims;
  const hips = wp(r, 'hips').y;
  const chestY = wp(r, 'chest').y;
  const neckY = wp(r, 'neck').y;
  const headY = wp(r, 'head').y;
  const shoulderY = wp(r, 'upperArmL').y;
  const elbowY = wp(r, 'foreArmL').y;
  const wristY = wp(r, 'handL').y;
  const thighY = wp(r, 'thighL').y;
  const kneeY = wp(r, 'shinL').y;
  const ankleY = wp(r, 'footL').y;
  const t = d.torsoR / 0.115; // build factor
  const W = d.torsoW / 1.32;
  const fem = Math.max(0, frame);
  const masc = Math.max(0, -frame);
  const sh = (0.17 + 0.012 * masc - 0.01 * fem) * W * (d.shoulderX / 0.175);
  const hipW = (0.158 + 0.018 * fem) * Math.max(1, t * 0.95);
  const waistW = (0.13 - 0.008 * fem) * t;
  const P = 2.35;
  const torso: Ring[] = densify(
    [
      ring(thighY - 0.05, 0.05, 0.05, { hips: 1 }, { p: P }),
      ring(thighY - 0.025, hipW * 0.82, 0.09 * t, { hips: 1 }, { p: P }),
      ring(thighY + 0.03, hipW, 0.106 * t, { hips: 1 }, { p: P, cz: -0.005 }),
      ring(hips + 0.06, hipW * 0.95, 0.1 * t, { hips: 0.6, spine: 0.4 }, { p: P }),
      ring(
        hips + 0.13,
        waistW,
        0.092 * t + 0.01 * Math.max(0, t - 1),
        { spine: 1 },
        { p: P, cz: 0.004 * t },
      ),
      ring(
        chestY - 0.01,
        (waistW + sh) / 2 + 0.005,
        0.1 * t,
        { spine: 0.5, torsoShell: 0.5 },
        { p: P, cz: 0.008 },
      ),
      ring(
        chestY + 0.08,
        sh * 0.97,
        (0.112 + 0.008 * fem) * t,
        { torsoShell: 1 },
        { p: P, cz: 0.016 + 0.006 * fem },
      ),
      ring(shoulderY - 0.03, sh, 0.1 * t, { torsoShell: 0.6, chest: 0.4 }, { p: 2.6, cz: 0.006 }),
      ring(shoulderY + 0.0, sh * 0.86, 0.088 * t, { chest: 1 }, { p: 2.4 }),
      ring(
        shoulderY + 0.022,
        sh * 0.66,
        0.078 * t,
        { chest: 0.9, neck: 0.1 },
        { p: 2.2, cz: -0.004 },
      ),
      ring(
        shoulderY + 0.042,
        sh * 0.42,
        0.064,
        { chest: 0.65, neck: 0.35 },
        { p: 2.1, cz: -0.006 },
      ),
      ring(neckY + 0.0, 0.05, 0.052, { chest: 0.3, neck: 0.7 }, { cz: -0.004 }),
      ring(neckY + 0.04, 0.045, 0.047, { neck: 1 }, { cz: 0.0 }),
      ring(headY + 0.02, 0.043, 0.045, { neck: 0.4, head: 0.6 }, { cz: 0.004 }),
      ring(headY + 0.06, 0.04, 0.04, { head: 1 }, { cz: 0.006 }),
    ].reverse(),
    4,
  );
  const ar = d.armR;
  const fr = d.foreR;
  const arm = {} as Record<Side, Ring[]>;
  const leg = {} as Record<Side, Ring[]>;
  for (const s of SIDES) {
    const x = sgn(s) * wp(r, `upperArm${s}`).x * 1.0;
    const ua = `upperArm${s}` as BoneName;
    const fa = `foreArm${s}` as BoneName;
    const hd = `hand${s}` as BoneName;
    const shb = `shoulder${s}` as BoneName;
    const xs = sgn(s);
    arm[s] = densify(
      [
        // Deltoid: the top of the arm rounds into the torso instead of ending in a flat cap.
        ring(
          shoulderY + 0.018,
          ar * 0.62,
          ar * 0.66,
          { [shb]: 0.7, [ua]: 0.3 },
          { cx: xs * Math.abs(x) * 0.8 },
        ),
        ring(
          shoulderY + 0.012,
          ar * 0.95,
          ar * 0.95,
          { [shb]: 0.55, [ua]: 0.45 },
          { cx: xs * Math.abs(x) * 0.88 },
        ),
        ring(
          shoulderY - 0.012,
          ar * 1.12,
          ar * 1.08,
          { [ua]: 0.9, [shb]: 0.1 },
          { cx: xs * Math.abs(x) },
        ),
        ring(shoulderY - 0.08, ar * 1.0, ar * 1.02, { [ua]: 1 }, { cx: xs * Math.abs(x) }),
        ring(shoulderY - 0.17, ar * 0.9, ar * 0.95, { [ua]: 1 }, { cx: xs * Math.abs(x) }),
        ring(
          elbowY + 0.03,
          fr * 0.98,
          fr * 1.0,
          { [ua]: 0.75, [fa]: 0.25 },
          { cx: xs * Math.abs(x) },
        ),
        ring(
          elbowY - 0.01,
          fr * 0.98,
          fr * 1.0,
          { [ua]: 0.35, [fa]: 0.65 },
          { cx: xs * Math.abs(x) },
        ),
        ring(elbowY - 0.07, fr * 1.04, fr * 1.08, { [fa]: 1 }, { cx: xs * Math.abs(x) }),
        ring(wristY + 0.06, fr * 0.8, fr * 0.84, { [fa]: 1 }, { cx: xs * Math.abs(x) }),
        ring(
          wristY + 0.005,
          fr * 0.66,
          fr * 0.72,
          { [fa]: 0.6, [hd]: 0.4 },
          { cx: xs * Math.abs(x) },
        ),
        ring(wristY - 0.02, fr * 0.6, fr * 0.7, { [hd]: 1 }, { cx: xs * Math.abs(x) }),
      ],
      4,
    );
    const lx = xs * d.hipX;
    const th = `thigh${s}` as BoneName;
    const sn = `shin${s}` as BoneName;
    const ft = `foot${s}` as BoneName;
    const tr = d.thighR;
    const cr = d.shinR;
    leg[s] = densify(
      [
        ring(thighY + 0.05, tr * 1.0, tr * 0.95, { hips: 0.75, [th]: 0.25 }, { cx: lx * 0.95 }),
        ring(thighY - 0.02, tr * 1.08, tr * 1.0, { hips: 0.3, [th]: 0.7 }, { cx: lx }),
        ring(thighY - 0.12, tr * 1.02, tr * 0.98, { [th]: 1 }, { cx: lx }),
        ring(kneeY + 0.17, tr * 0.84, tr * 0.82, { [th]: 1 }, { cx: lx * 0.97 }),
        ring(
          kneeY + 0.04,
          cr * 1.0,
          cr * 0.98,
          { [th]: 0.8, [sn]: 0.2 },
          { cx: lx * 0.95, cz: 0.004 },
        ),
        ring(
          kneeY - 0.02,
          cr * 0.98,
          cr * 0.98,
          { [th]: 0.3, [sn]: 0.7 },
          { cx: lx * 0.95, cz: 0.002 },
        ),
        ring(kneeY - 0.1, cr * 1.04, cr * 1.1, { [sn]: 1 }, { cx: lx * 0.95, cz: -0.006 }),
        ring(kneeY - 0.22, cr * 0.82, cr * 0.84, { [sn]: 1 }, { cx: lx * 0.95 }),
        ring(ankleY + 0.07, cr * 0.6, cr * 0.62, { [sn]: 1 }, { cx: lx * 0.95 }),
        ring(ankleY + 0.02, cr * 0.58, cr * 0.62, { [sn]: 0.5, [ft]: 0.5 }, { cx: lx * 0.95 }),
      ],
      4,
    );
  }
  return {
    torso,
    arm,
    leg,
    y: {
      crotch: thighY - 0.05,
      waist: hips + 0.13,
      hip: thighY + 0.03,
      chest: chestY + 0.08,
      shoulder: shoulderY,
      neckBase: neckY,
      neckTop: headY + 0.06,
      headCenter: headY + 0.1,
      elbow: elbowY,
      wrist: wristY,
      knee: kneeY,
      ankle: ankleY,
    },
    headR: d.headR,
  };
}

/** Sculpted head: jaw narrows, chin and cheeks push forward, back of skull rounds out. */
function headGeometry(r: Rig): BufferGeometry {
  const h = r.dims.headR;
  const g = new SphereGeometry(h, q(r, 48), q(r, 36));
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / h;
    let y = p.getY(i) / h;
    let z = p.getZ(i) / h;
    const low = Math.max(0, -y); // 0 at equator → 1 at chin
    x *= 0.9 * (1 - 0.28 * low * low);
    z *= 1 - 0.12 * low;
    if (z > 0) z *= 1 + 0.06 * (1 - Math.abs(y)); // face plane
    if (z < 0 && y > -0.2) z *= 1.08; // occiput
    y *= y < 0 ? 1.18 : 1.08;
    if (y < -0.6 && z > 0.2) z += 0.05 * (1 + y); // chin
    p.setXYZ(i, x * h, y * h, z * h);
  }
  g.computeVertexNormals();
  return g;
}

export function rigidParts(geos: Part[], r: Rig): BufferGeometry {
  return bake(r, geos);
}

/** Hand: palm + four fingers + thumb, relaxed. */
function handParts(s: Side, z: number, scale = 1, color?: [number, number, number]): Part[] {
  const xs = sgn(s);
  const parts: Part[] = [
    {
      bone: `hand${s}`,
      geo: sphere(0.034 * scale, 20, 16),
      at: [0, -0.045, 0.004],
      scale: [0.95, 1.35, 0.55],
      zone: z,
      color,
    },
  ];
  for (let f = 0; f < 4; f++) {
    const off = (f - 1.5) * 0.0165 * scale;
    const len = [0.042, 0.048, 0.046, 0.038][f]! * scale;
    parts.push({
      bone: `hand${s}`,
      geo: capsule(0.0085 * scale, len, 8),
      at: [xs * off * 0.9 + xs * 0.0, -0.093 * scale - len / 2, 0.008],
      rot: [0.25, 0, -xs * (f - 1.5) * 0.04],
      zone: z,
      color,
    });
  }
  parts.push({
    bone: `hand${s}`,
    geo: capsule(0.0095 * scale, 0.032 * scale, 8),
    at: [-xs * 0.02 * scale, -0.05 * scale, 0.022],
    rot: [0.6, 0, -xs * 0.7],
    zone: z,
    color,
  });
  return parts;
}

function footParts(
  s: Side,
  z: number,
  opts: { scale?: number; lift?: number; color?: [number, number, number] } = {},
): Part[] {
  const k = opts.scale ?? 1;
  return [
    {
      bone: `foot${s}`,
      geo: sphere(0.05, 24, 16),
      at: [0, -0.012 + (opts.lift ?? 0), 0.045],
      scale: [0.92 * k, 0.62 * k, 2.15 * k],
      zone: z,
      color: opts.color,
    },
  ];
}

/** Merge geometries that all carry the skinned attribute set. */
export function combine(geos: BufferGeometry[]): BufferGeometry {
  const list = geos.some((g) => !g.index)
    ? geos.map((g) => (g.index ? g.toNonIndexed() : g))
    : geos;
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('combine: incompatible geometries');
  return m;
}

function scaled(g: BufferGeometry, s: number) {
  g.scale(s, s, s);
  return g;
}

export function bodyGeometry(r: Rig, rings: BodyRings): BufferGeometry {
  const s = r.dims.scale;
  const geos: BufferGeometry[] = [];
  // Torso + neck: zone by height.
  const torsoZone = (ring: Ring) =>
    ring.y > rings.y.shoulder + 0.03 ? Z.head : ring.y < rings.y.hip - 0.02 ? Z.legs : Z.torso;
  geos.push(scaled(sweep(rings.torso, { capBottom: true, zone: torsoZone, radial: q(r, 48) }), s));
  for (const side of SIDES) {
    const armZone = (ring: Ring) => (ring.y < rings.y.wrist + 0.01 ? Z.hands : Z.arms);
    geos.push(
      scaled(
        sweep(rings.arm[side], {
          capTop: true,
          capDepth: 0.8,
          capBottom: true,
          zone: armZone,
          radial: 32,
        }),
        s,
      ),
    );
    geos.push(
      scaled(
        sweep(rings.leg[side], { capTop: true, capBottom: true, zone: Z.legs, radial: q(r, 32) }),
        s,
      ),
    );
  }
  const head = headGeometry(r);
  const parts: Part[] = [
    { bone: 'head', geo: head, at: [0, 0.1, 0], zone: Z.head },
    // nose, ears
    {
      bone: 'head',
      geo: sphere(0.014, 14, 10),
      at: [0, 0.088, r.dims.headR * 0.99],
      scale: [0.85, 1.25, 1.0],
      zone: Z.head,
    },
    {
      bone: 'head',
      geo: sphere(0.026, 14, 10),
      at: [r.dims.headR * 0.88, 0.098, -0.005],
      scale: [0.35, 0.95, 0.65],
      zone: Z.head,
    },
    {
      bone: 'head',
      geo: sphere(0.026, 14, 10),
      at: [-r.dims.headR * 0.88, 0.098, -0.005],
      scale: [0.35, 0.95, 0.65],
      zone: Z.head,
    },
    ...SIDES.flatMap((sd) => handParts(sd, Z.hands)),
    ...SIDES.flatMap((sd) => footParts(sd, Z.feet)),
  ];
  geos.push(bake(r, parts));
  return combine(geos);
}

/** Eyes (sclera + iris + pupil) and mouth, vertex-coloured. Eye bones squint; the mouth flips for a frown. */
export function faceGeometry(
  r: Rig,
  iris: [number, number, number] = [0.28, 0.18, 0.1],
): BufferGeometry {
  const parts: Part[] = [];
  for (const s of SIDES) {
    parts.push(
      {
        bone: `eye${s}`,
        geo: sphere(0.0135, 16, 12),
        at: [0, 0, -0.006],
        scale: [1.15, 0.95, 0.7],
        color: [0.95, 0.94, 0.92],
      },
      {
        bone: `eye${s}`,
        geo: sphere(0.0072, 14, 10),
        at: [0, 0, 0.0025],
        scale: [1, 1, 0.45],
        color: iris,
      },
      {
        bone: `eye${s}`,
        geo: sphere(0.0036, 10, 8),
        at: [0, 0, 0.0052],
        scale: [1, 1, 0.4],
        color: [0.03, 0.03, 0.03],
      },
    );
  }
  parts.push({
    bone: 'mouth',
    geo: torus(0.014, 0.0032, Math.PI * 0.75),
    at: [0, 0.006, 0],
    rot: [0, 0, Math.PI + Math.PI * 0.125],
    scale: [1.1, 0.7, 0.6],
    color: [0.55, 0.22, 0.2],
  });
  return bake(r, parts);
}

// ---------------------------------------------------------------- garments

const off = (layer: number) => 0.006 + 0.006 * layer;

const SLEEVE: Partial<Record<GarmentId, 'none' | 'short' | 'long'>> = {
  tank_top: 'none',
  t_shirt: 'short',
  long_sleeve: 'long',
  thermal_top: 'long',
  hoodie: 'long',
  sweater: 'long',
  light_jacket: 'long',
  rain_shell: 'long',
  winter_coat: 'long',
};
const HEM_DROP: Partial<Record<GarmentId, number>> = {
  winter_coat: 0.32,
  rain_shell: 0.18,
  light_jacket: 0.06,
  hoodie: 0.03,
  sweater: 0.02,
};
const LEGS: Partial<Record<GarmentId, 'short' | 'long'>> = {
  shorts: 'short',
  jeans: 'long',
  thermal_bottoms: 'long',
  snow_pants: 'long',
};

/** Geometry for one garment, cut from the body's ring stacks (so it deforms with the body). */
export function garmentGeometry(r: Rig, rings: BodyRings, id: GarmentId): BufferGeometry {
  const s = r.dims.scale;
  const g = GARMENT_BY_ID[id];
  const o = off(g.layer) + (id === 'winter_coat' || id === 'snow_pants' ? 0.01 : 0);
  const geos: BufferGeometry[] = [];
  const parts: Part[] = [];
  const y = rings.y;
  const sleeves = SLEEVE[id];
  if (sleeves !== undefined) {
    const top =
      id === 'tank_top'
        ? y.shoulder - 0.035
        : id === 'winter_coat' || id === 'rain_shell'
          ? y.neckBase + 0.03
          : y.neckBase - 0.004;
    let body = slice(rings.torso, top, y.hip - 0.035);
    const drop = HEM_DROP[id] ?? 0;
    if (drop > 0) {
      // A-line hem continuing below the hips, swaying with the `hem` bone.
      const last = body[body.length - 1]!;
      const ext: Ring[] = [];
      for (let k = 1; k <= 6; k++) {
        const f = k / 6;
        ext.push({
          ...last,
          y: last.y - drop * f,
          rx: last.rx * (1 + 0.5 * drop * f) + 0.1 * drop * f,
          rz: last.rz * (1 + 0.75 * drop * f) + 0.1 * drop * f,
          w: { hips: 1 - 0.5 * f, hem: 0.5 * f },
        });
      }
      body = [...body, ...ext];
    }
    const k = id === 'winter_coat' ? 1.06 : g.layer >= 4 ? 1.04 : 1;
    // Tops always sit outside trousers at the waist (avoids z-fighting where layers overlap).
    geos.push(
      scaled(
        sweep(inflate(body, Math.max(o, off(2) + 0.006), k), { zone: Z.torso, radial: q(r, 48) }),
        s,
      ),
    );
    if (sleeves !== 'none') {
      for (const side of SIDES) {
        const end = sleeves === 'short' ? y.shoulder - 0.13 : y.wrist + 0.015;
        let sl = inflate(slice(rings.arm[side], y.shoulder + 0.01, end), o * 0.9, 1.0);
        if (sleeves === 'short') {
          sl = sl.map((rg, i) =>
            i > sl.length - 4 ? { ...rg, rx: rg.rx * 1.08, rz: rg.rz * 1.08 } : rg,
          );
        } else {
          sl = sl.map((rg, i) =>
            i > sl.length - 3 ? { ...rg, rx: rg.rx * 1.06, rz: rg.rz * 1.06 } : rg,
          ); // cuff
        }
        geos.push(
          scaled(sweep(sl, { capTop: true, capDepth: 0.3, zone: Z.arms, radial: q(r, 28) }), s),
        );
      }
    }
    if (id === 'hoodie') {
      parts.push({
        bone: 'neck',
        geo: torus(0.072, 0.026),
        at: [0, 0.02, -0.03],
        rot: [Math.PI / 2 - 0.45, 0, 0],
        scale: [1.15, 1, 1],
        zone: Z.head,
      });
      parts.push({
        bone: 'head',
        geo: cap(r.dims.headR * 1.2, Math.PI * 0.45),
        at: [0, 0.07, -0.035],
        rot: [-1.35, 0, 0],
        scale: [1, 1, 0.8],
        zone: Z.head,
      });
    }
    if (id === 'rain_shell') {
      // Hood worn up but framing the face: tilted back so the opening faces forward.
      parts.push({
        bone: 'head',
        geo: cap(r.dims.headR * 1.22, Math.PI * 0.62, 40),
        at: [0, 0.1, -0.03],
        rot: [-0.95, 0, 0],
        scale: [1.0, 1.1, 1.08],
        zone: Z.head,
      });
    }
    if (id === 'winter_coat' || id === 'light_jacket' || id === 'rain_shell') {
      // collar
      const collar = slice(rings.torso, y.neckBase + 0.045, y.shoulder + 0.03);
      geos.push(
        scaled(sweep(inflate(collar, o + 0.012, 1.05), { zone: Z.head, radial: q(r, 36) }), s),
      );
    }
  }
  const legs = LEGS[id];
  if (legs) {
    const waistTop = y.waist + 0.01;
    const waistO = Math.min(o, off(1) + (id === 'snow_pants' ? 0.01 : 0));
    geos.push(
      scaled(
        sweep(
          inflate(slice(rings.torso, waistTop, rings.torso[rings.torso.length - 1]!.y), waistO),
          { capBottom: true, capDepth: 0.55, zone: Z.legs, radial: q(r, 48) },
        ),
        s,
      ),
    );
    for (const side of SIDES) {
      const end = legs === 'short' ? y.knee + 0.2 : y.ankle + 0.03;
      // Trousers sit under outerwear: cap their bulk so coats and shells cover them at the hip.
      const legO = Math.min(o, off(3) + 0.004);
      let lg = inflate(slice(rings.leg[side], y.hip + 0.02, end), legO * 1.1, 1.02);
      if (id === 'jeans' || id === 'snow_pants')
        lg = lg.map((rg, i) => ({
          ...rg,
          rx: rg.rx * (1 + 0.15 * Math.max(0, i / lg.length - 0.6)),
          rz: rg.rz * (1 + 0.15 * Math.max(0, i / lg.length - 0.6)),
        }));
      if (legs === 'short')
        lg = lg.map((rg, i) =>
          i > lg.length - 4 ? { ...rg, rx: rg.rx * 1.08, rz: rg.rz * 1.08 } : rg,
        );
      geos.push(scaled(sweep(lg, { zone: Z.legs, radial: q(r, 32) }), s));
    }
  }
  switch (id) {
    case 'toque':
      parts.push(
        {
          bone: 'head',
          geo: cap(r.dims.headR * 1.07, Math.PI * 0.44, 32),
          at: [0, 0.112, -0.004],
          rot: [-0.12, 0, 0],
          scale: [0.93, 1.12, 1.05],
          zone: Z.head,
        },
        {
          bone: 'head',
          geo: torus(r.dims.headR * 0.97, 0.017),
          at: [0, 0.128, -0.008],
          rot: [Math.PI / 2 - 0.12, 0, 0],
          scale: [0.93, 1.06, 1],
          zone: Z.head,
        },
        { bone: 'head', geo: sphere(0.03, 16, 12), at: [0, 0.248, -0.03], zone: Z.head },
      );
      break;
    case 'scarf':
      parts.push(
        {
          bone: 'neck',
          geo: torus(0.056, 0.024),
          at: [0, 0.03, 0.004],
          rot: [Math.PI / 2, 0, 0],
          scale: [1.05, 1.15, 1],
          zone: Z.head,
        },
        {
          bone: 'scarfTail',
          geo: capsule(0.026, 0.17, 10),
          at: [0, -0.1, 0],
          scale: [1.2, 1, 0.35],
          zone: Z.torso,
        },
      );
      break;
    case 'gloves':
      for (const sd of SIDES) {
        parts.push(...handParts(sd, Z.hands, 1.16));
        geos.push(
          scaled(
            sweep(inflate(slice(rings.arm[sd], y.wrist + 0.045, y.wrist - 0.015), 0.009, 1.05), {
              zone: Z.hands,
              radial: 24,
            }),
            s,
          ),
        );
      }
      break;
    case 'socks':
    case 'wool_socks':
      for (const sd of SIDES) {
        geos.push(
          scaled(
            sweep(
              inflate(
                slice(rings.leg[sd], y.ankle + (id === 'wool_socks' ? 0.16 : 0.1), y.ankle + 0.01),
                0.004,
              ),
              { zone: Z.feet, radial: q(r, 24) },
            ),
            s,
          ),
        );
        parts.push(...footParts(sd, Z.feet, { scale: 1.05 }));
      }
      break;
    case 'sneakers':
      for (const sd of SIDES) {
        parts.push(...footParts(sd, Z.feet, { scale: 1.16, lift: 0.004 }), {
          bone: `foot${sd}`,
          geo: sphere(0.05, 24, 12),
          at: [0, -0.035, 0.048],
          scale: [1.08, 0.28, 2.42],
          zone: Z.feet,
          color: [0.92, 0.92, 0.9],
        });
      }
      break;
    case 'winter_boots':
      for (const sd of SIDES) {
        parts.push(...footParts(sd, Z.feet, { scale: 1.24, lift: 0.006 }), {
          bone: `foot${sd}`,
          geo: sphere(0.05, 24, 12),
          at: [0, -0.034, 0.05],
          scale: [1.16, 0.32, 2.55],
          zone: Z.feet,
          color: [0.18, 0.15, 0.13],
        });
        geos.push(
          scaled(
            sweep(inflate(slice(rings.leg[sd], y.ankle + 0.2, y.ankle - 0.01), 0.034, 1.16), {
              capTop: false,
              zone: Z.feet,
              radial: 28,
            }),
            s,
          ),
        );
      }
      break;
  }
  if (parts.length) geos.push(bake(r, parts));
  return combine(geos);
}
