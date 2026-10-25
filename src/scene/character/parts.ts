import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  SphereGeometry,
  Vector3,
} from 'three';
import { GARMENT_BY_ID } from '../../data/garments';
import { ZONE_IDS, type GarmentId } from '../../engine';
import type { BuildPreset, FacialHair, HairStyle } from '../../state/avatarStore';
import type { BodyData, CharacterAssets, HairData, HairPiece, MeshData, Sex } from './data';
import { EXTRA_BONES, SCARF_PIVOT, type ExtraBone, type HeadMetrics } from './skeleton';

/**
 * Geometry for the character: the body (with build deformation and comfort zones), garments cut
 * as shells from the body surface (so they fit and deform exactly like it), and one merged mesh
 * for hair, brows and facial hair. No WebGL here, so it is unit-testable.
 */

// Vertex groups by dominant bone.
const G = { head: 0, neck: 1, torso: 2, pelvis: 3, arm: 4, hand: 5, leg: 6, foot: 7 } as const;
type Group = (typeof G)[keyof typeof G];

function groupOf(bone: string): Group {
  if (bone === 'Head') return G.head;
  if (bone.startsWith('neck')) return G.neck;
  if (bone.startsWith('spine') || bone.startsWith('clavicle')) return G.torso;
  if (bone.startsWith('upperarm') || bone.startsWith('lowerarm')) return G.arm;
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(bone)) return G.hand;
  if (bone.startsWith('thigh') || bone.startsWith('calf')) return G.leg;
  if (bone.startsWith('foot') || bone.startsWith('ball')) return G.foot;
  return G.pelvis;
}

const ZONE_OF_GROUP: Record<Group, number> = {
  [G.head]: ZONE_IDS.indexOf('head'),
  [G.neck]: ZONE_IDS.indexOf('head'),
  [G.torso]: ZONE_IDS.indexOf('torso'),
  [G.pelvis]: ZONE_IDS.indexOf('torso'),
  [G.arm]: ZONE_IDS.indexOf('arms'),
  [G.hand]: ZONE_IDS.indexOf('hands'),
  [G.leg]: ZONE_IDS.indexOf('legs'),
  [G.foot]: ZONE_IDS.indexOf('feet'),
};

/** Bind-pose landmarks (metres, model space). Left side is +X; arms lie along ±X (T-pose). */
export interface Landmarks {
  neckY: number;
  headY: number;
  chestY: number;
  waistY: number;
  hipY: number;
  thighY: number;
  kneeY: number;
  ankleY: number;
  shoulderX: number;
  shoulderY: number;
  elbowX: number;
  wristX: number;
  /** Half-width of the neck. */
  neckHalf: number;
}

export interface BodyModel {
  data: BodyData;
  /** Positions after the build deformation. */
  position: Float32Array;
  /** Smooth normals (welded across UV seams). */
  normal: Float32Array;
  group: Uint8Array;
  zone: Float32Array;
  /** Vertex → welded id (vertices sharing a position share an id). */
  weld: Uint32Array;
  /** Welded id → welded neighbour ids. */
  ring: number[][];
  L: Landmarks;
  head: HeadMetrics;
  headWorld: Matrix4;
  headIndex: number;
}

const v3 = (a: ArrayLike<number>, i: number, out = new Vector3()) =>
  out.set(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!);

function dominant(m: MeshData, v: number): number {
  let best = 0;
  for (let k = 1; k < 4; k++) if (m.weights[v * 4 + k]! > m.weights[v * 4 + best]!) best = k;
  return m.joints[v * 4 + best]!;
}

function weldIds(pos: ArrayLike<number>, n: number): { weld: Uint32Array; count: number } {
  const map = new Map<string, number>();
  const weld = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3]! * 1e5)},${Math.round(pos[i * 3 + 1]! * 1e5)},${Math.round(pos[i * 3 + 2]! * 1e5)}`;
    let id = map.get(k);
    if (id === undefined) map.set(k, (id = map.size));
    weld[i] = id;
  }
  return { weld, count: map.size };
}

function smoothNormals(
  pos: ArrayLike<number>,
  index: ArrayLike<number>,
  weld: Uint32Array,
  count: number,
) {
  const acc = new Float32Array(count * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t]!;
    const i1 = index[t + 1]!;
    const i2 = index[t + 2]!;
    v3(pos, i0, a);
    v3(pos, i1, b).sub(a);
    v3(pos, i2, c).sub(a);
    b.cross(c); // area-weighted
    for (const i of [i0, i1, i2]) {
      const w = weld[i]!;
      acc[w * 3] = acc[w * 3]! + b.x;
      acc[w * 3 + 1] = acc[w * 3 + 1]! + b.y;
      acc[w * 3 + 2] = acc[w * 3 + 2]! + b.z;
    }
  }
  const out = new Float32Array(weld.length * 3);
  for (let i = 0; i < weld.length; i++) {
    const w = weld[i]!;
    a.set(acc[w * 3]!, acc[w * 3 + 1]!, acc[w * 3 + 2]!).normalize();
    out.set([a.x, a.y, a.z], i * 3);
  }
  return out;
}

const headSpace = (ibm: ArrayLike<number>) => new Matrix4().fromArray(Array.from(ibm));

/** Eye centres, brows, face extents in Head space. */
export function headMetrics(d: BodyData, brows: HairData): HeadMetrics {
  const toHead = headSpace(d.inverseBind.subarray(d.bones.indexOf('Head') * 16));
  const p = new Vector3();
  const box = { L: [9, -9, 9, -9, 9, -9], R: [9, -9, 9, -9, 9, -9] };
  for (let i = 0; i < d.eyes.position.length / 3; i++) {
    v3(d.eyes.position, i, p).applyMatrix4(toHead);
    const b = box[p.x > 0 ? 'L' : 'R'];
    b[0] = Math.min(b[0]!, p.x);
    b[1] = Math.max(b[1]!, p.x);
    b[2] = Math.min(b[2]!, p.y);
    b[3] = Math.max(b[3]!, p.y);
    b[4] = Math.min(b[4]!, p.z);
    b[5] = Math.max(b[5]!, p.z);
  }
  const eye = (b: number[]) => {
    const r = (b[1]! - b[0]!) / 2;
    // The eye mesh is the front of the eyeball: its centre sits one radius behind the front.
    return { c: new Vector3((b[0]! + b[1]!) / 2, (b[2]! + b[3]!) / 2, b[5]! - r), r };
  };
  const eL = eye(box.L);
  const eR = eye(box.R);
  const browIbm = headSpace(brows.headInverseBind);
  const bsum = { L: new Vector3(), R: new Vector3() };
  const bn = { L: 0, R: 0 };
  let browTop = -9;
  for (let i = 0; i < brows.position.length / 3; i++) {
    v3(brows.position, i, p).applyMatrix4(browIbm);
    const s = p.x > 0 ? 'L' : 'R';
    bsum[s].add(p);
    bn[s]++;
    browTop = Math.max(browTop, p.y);
  }
  const hb = d.headBox;
  return {
    eyeL: eL.c,
    eyeR: eR.c,
    eyeRadius: (eL.r + eR.r) / 2,
    browL: bsum.L.divideScalar(Math.max(1, bn.L)),
    browR: bsum.R.divideScalar(Math.max(1, bn.R)),
    browTop,
    front: hb.max[2]!,
    chin: hb.min[1]!,
    mouth: new Vector3(0, eL.c.y - 0.068, hb.max[2]! - 0.025),
  };
}

const BUILD_OFFSET: Record<BuildPreset, Partial<Record<Group, number>>> = {
  slim: {
    [G.torso]: -0.009,
    [G.pelvis]: -0.006,
    [G.arm]: -0.006,
    [G.leg]: -0.007,
    [G.neck]: -0.003,
  },
  average: { [G.torso]: -0.003, [G.arm]: -0.003, [G.leg]: -0.002 },
  muscular: { [G.torso]: 0.004, [G.arm]: 0.007, [G.leg]: 0.005, [G.neck]: 0.005 },
  heavy: { [G.torso]: 0.016, [G.pelvis]: 0.02, [G.arm]: 0.01, [G.leg]: 0.014, [G.neck]: 0.01 },
};

export function bodyModel(
  d: BodyData,
  build: Record<BuildPreset, number>,
  head: HeadMetrics,
): BodyModel {
  const m = d.body;
  const n = m.position.length / 3;
  const groups = d.bones.map(groupOf);
  const group = new Uint8Array(n);
  const zone = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    group[i] = groups[dominant(m, i)]!;
    zone[i] = ZONE_OF_GROUP[group[i] as Group];
  }
  const { weld, count } = weldIds(m.position, n);
  const normal = smoothNormals(m.position, m.index, weld, count);
  const ring: Set<number>[] = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < m.index.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = weld[m.index[t + k]!]!;
      const b = weld[m.index[t + ((k + 1) % 3)]!]!;
      if (a !== b) {
        ring[a]!.add(b);
        ring[b]!.add(a);
      }
    }
  }
  const at = (name: string) =>
    new Vector3().setFromMatrixPosition(
      headSpace(d.inverseBind.subarray(d.bones.indexOf(name) * 16)).invert(),
    );
  const L: Landmarks = {
    neckY: at('neck_01').y,
    headY: at('Head').y,
    chestY: at('spine_03').y,
    waistY: at('spine_01').y,
    hipY: at('pelvis').y,
    thighY: at('thigh_l').y,
    kneeY: at('calf_l').y,
    ankleY: at('foot_l').y,
    shoulderX: at('upperarm_l').x,
    shoulderY: at('upperarm_l').y,
    elbowX: at('lowerarm_l').x,
    wristX: at('hand_l').x,
    neckHalf: 0.62 * d.headBox.max[0]!,
  };
  // Build: push the surface along its normal, blended by skin weights so joints stay smooth.
  const position = new Float32Array(m.position);
  const presets = Object.keys(build) as BuildPreset[];
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = 0; j < 4; j++) {
      const g = groups[m.joints[i * 4 + j]!]!;
      const w = m.weights[i * 4 + j]!;
      for (const p of presets) k += build[p] * w * (BUILD_OFFSET[p][g] ?? 0);
    }
    // Heavier builds carry a rounder belly.
    const y = m.position[i * 3 + 1]!;
    const nz = normal[i * 3 + 2]!;
    if (build.heavy > 0 && (group[i] === G.torso || group[i] === G.pelvis) && nz > 0) {
      const mid = (L.hipY + L.chestY) / 2;
      const span = (L.chestY - L.hipY) * 0.7;
      k += build.heavy * 0.035 * nz * Math.max(0, 1 - ((y - mid) / span) ** 2);
    }
    for (let a = 0; a < 3; a++) position[i * 3 + a] = position[i * 3 + a]! + normal[i * 3 + a]! * k;
  }
  const headIndex = d.bones.indexOf('Head');
  return {
    data: d,
    position,
    normal,
    group,
    zone,
    weld,
    ring: ring.map((s) => [...s]),
    L,
    head,
    headWorld: headSpace(d.inverseBind.subarray(headIndex * 16)).invert(),
    headIndex,
  };
}

export function bodyGeometry(b: BodyModel): BufferGeometry {
  const m = b.data.body;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(b.position, 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(m.normal), 3));
  g.setAttribute('uv', new BufferAttribute(m.uv, 2));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(m.joints), 4));
  g.setAttribute('skinWeight', new BufferAttribute(m.weights, 4));
  g.setAttribute('zone', new BufferAttribute(b.zone, 1));
  g.setAttribute('hide', new BufferAttribute(new Float32Array(b.zone.length), 1));
  g.setIndex(new BufferAttribute(m.index, 1));
  return g;
}

// ---------------------------------------------------------------- garments

/** Shell thickness by layer (m): each layer sits outside the one below. */
const LAYER = [0, 0.0045, 0.008, 0.014, 0.02, 0.026];
const THICK: Partial<Record<GarmentId, number>> = {
  winter_coat: 0.034,
  snow_pants: 0.022,
  rain_shell: 0.028,
  toque: 0.014,
  scarf: 0.05,
  gloves: 0.0045,
  socks: 0.0025,
  wool_socks: 0.005,
  sneakers: 0.011,
  winter_boots: 0.02,
};
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
const LEGS: Partial<Record<GarmentId, 'short' | 'long'>> = {
  shorts: 'short',
  jeans: 'long',
  thermal_bottoms: 'long',
  snow_pants: 'long',
};
const HOOD = new Set<GarmentId>(['hoodie', 'rain_shell']);
const COLLAR = new Set<GarmentId>(['light_jacket', 'rain_shell', 'winter_coat']);

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface Cut {
  inside: (i: number) => boolean;
  offset: (i: number) => number;
  /** Laplacian smoothing passes (softens small surface detail). */
  smoothing?: number;
  /** Spatial blur radius (m) for foot vertices: merges toes into a rounded shoe. */
  footBlur?: number;
  color?: (i: number) => [number, number, number];
}

/** Which body vertices a garment covers, and how far out it sits (bind pose). */
export function garmentCut(b: BodyModel, id: GarmentId): Cut {
  const L = b.L;
  const g = GARMENT_BY_ID[id];
  const o = THICK[id] ?? LAYER[g.layer]!;
  const P = b.data.body.position;
  const y = (i: number) => P[i * 3 + 1]!;
  const ax = (i: number) => Math.abs(P[i * 3]!);
  const grp = (i: number) => b.group[i]!;
  const toHead = b.headWorld.clone().invert();
  const hp = new Vector3();
  const headLocal = (i: number) => v3(P, i, hp).applyMatrix4(toHead);
  const H = b.head;

  const sleeve = SLEEVE[id];
  if (sleeve) {
    // Only coats and shells reach past the top of the thighs.
    const long = id === 'winter_coat' || id === 'rain_shell';
    const hem =
      id === 'winter_coat'
        ? L.kneeY + (L.thighY - L.kneeY) * 0.5
        : id === 'rain_shell'
          ? L.thighY - 0.16
          : id === 'light_jacket'
            ? L.hipY - 0.02
            : g.layer >= 3
              ? L.hipY - 0.01
              : L.hipY + 0.005;
    const sleeveEnd =
      sleeve === 'none'
        ? 0
        : sleeve === 'short'
          ? L.shoulderX + (L.elbowX - L.shoulderX) * 0.45
          : L.wristX - 0.015;
    // Neck opening: a band around the neck (wider and deeper for a tank top's scoop).
    const tank = id === 'tank_top';
    const holeW = L.neckHalf + (tank ? 0.04 : 0.018);
    const holeY = L.neckY - (tank ? 0.085 : 0.045);
    // U-shaped: deepest at the centre, rising to the shoulders.
    const inHole = (i: number) => {
      const t = ax(i) / holeW;
      return t < 1 && y(i) > holeY + (L.neckY - holeY) * t * t;
    };
    const collar = COLLAR.has(id) ? L.neckY + 0.065 : -1;
    const hood = HOOD.has(id);
    return {
      inside: (i) => {
        const gr = grp(i);
        const yi = y(i);
        if (yi < hem) return false;
        switch (gr) {
          case G.head:
            if (!hood) return false;
            return !isFace(headLocal(i), H);
          case G.neck:
            return hood || yi < collar;
          case G.torso:
            if (hood || yi < collar) return true;
            // Tank top: open armholes, leaving straps over the shoulders.
            if (tank && ax(i) > L.shoulderX - 0.03 && yi > L.shoulderY - 0.03) return false;
            return !inHole(i);
          case G.pelvis:
            return true;
          case G.arm:
            return ax(i) < sleeveEnd;
          case G.leg:
            return long;
          default:
            return false;
        }
      },
      offset: (i) => {
        const gr = grp(i);
        if (gr === G.head || (hood && gr === G.neck)) return hood ? 0.032 : o;
        // Tops sit outside trousers at the waist; long coats flare a little toward the hem.
        let off = o + 0.01 * smooth(L.hipY + 0.12, L.hipY + 0.02, y(i));
        if (gr === G.leg) off += 0.03 * smooth(L.thighY, hem, y(i));
        if (gr === G.neck && !hood) off += 0.008;
        return off;
      },
    };
  }
  const legs = LEGS[id];
  if (legs) {
    const end = legs === 'short' ? L.kneeY + 0.11 : L.ankleY + 0.045;
    const top = L.hipY + 0.07;
    return {
      inside: (i) => {
        const gr = grp(i);
        const yi = y(i);
        if (yi > top || yi < end) return false;
        return gr === G.pelvis || gr === G.leg || gr === G.torso;
      },
      // Waistbands stay snug so tops can go over them; jeans and snow pants loosen toward the hem.
      offset: (i) =>
        o +
        (0.003 + 0.25 * o - o) * smooth(L.hipY - 0.04, L.hipY, y(i)) +
        (id === 'jeans' || id === 'snow_pants' ? 0.012 : 0) * smooth(L.kneeY + 0.1, end, y(i)),
    };
  }
  switch (id) {
    case 'toque':
      return {
        // Ears stay out (their tops sit at brow height).
        inside: (i) =>
          grp(i) === G.head &&
          headLocal(i).y > capLine(hp.z, H) &&
          !(Math.abs(hp.x) > b.data.headBox.max[0]! * 0.82 && hp.y < H.browTop + 0.012),
        // Thicker folded brim along the lower edge.
        offset: (i) => o + 0.01 * smooth(capLine(headLocal(i).z, H) + 0.03, capLine(hp.z, H), hp.y),
      };
    case 'scarf':
      return {
        inside: (i) =>
          (grp(i) === G.neck && y(i) < L.headY + 0.02) ||
          (grp(i) === G.torso && y(i) > L.neckY - 0.07 && ax(i) < L.shoulderX - 0.05),
        offset: () => o,
      };
    case 'gloves':
      return {
        inside: (i) => grp(i) === G.hand || (grp(i) === G.arm && ax(i) > L.wristX - 0.045),
        offset: (i) => o + 0.004 * smooth(L.wristX - 0.02, L.wristX - 0.045, ax(i)),
      };
    case 'socks':
    case 'wool_socks': {
      const top = L.ankleY + (id === 'wool_socks' ? 0.17 : 0.1);
      return {
        inside: (i) => grp(i) === G.foot || (grp(i) === G.leg && y(i) < top),
        offset: () => o,
        footBlur: 0.012,
      };
    }
    case 'sneakers':
    case 'winter_boots': {
      const boot = id === 'winter_boots';
      const top = L.ankleY + (boot ? 0.2 : 0.035);
      const sole: [number, number, number] = boot ? [0.12, 0.1, 0.09] : [0.5, 0.5, 0.53];
      return {
        inside: (i) => grp(i) === G.foot || (grp(i) === G.leg && y(i) < top),
        offset: (i) =>
          o + (boot ? 0.008 * smooth(top - 0.08, top, y(i)) : 0) + (grp(i) === G.foot ? 0.006 : 0),
        footBlur: boot ? 0.03 : 0.024,
        color: (i) => (y(i) < 0.014 ? sole : [1, 1, 1]),
      };
    }
  }
  return { inside: () => false, offset: () => 0 };
}

/** Face opening (Head space): the part a hood leaves uncovered. */
function isFace(p: Vector3, H: HeadMetrics) {
  return p.z > H.eyeL.z - 0.045 && p.y < H.browTop + 0.03 && Math.abs(p.x) < H.eyeL.x + 0.04;
}

/** Lower edge of a hat (Head space): just above the brows at the front, over the ears at the sides. */
function capLine(z: number, H: HeadMetrics) {
  const front = H.browTop + 0.008;
  return front + (H.eyeL.y - 0.015 - front) * smooth(H.eyeL.z - 0.06, H.eyeL.z - 0.15, z);
}

/** Body vertices a garment covers, per vertex (0/1). */
export function regionMask(b: BodyModel, cut: Cut): Uint8Array {
  const n = b.zone.length;
  // Decide per welded vertex (so UV-seam copies agree), then close pinholes along the cut.
  let on = new Uint8Array(b.ring.length);
  for (let i = 0; i < n; i++) if (cut.inside(i)) on[b.weld[i]!] = 1;
  for (let pass = 0; pass < 2; pass++) {
    const next = on.slice();
    for (let w = 0; w < on.length; w++) {
      if (on[w]) continue;
      const nb = b.ring[w]!;
      if (nb.length && nb.filter((x) => on[x]).length / nb.length >= 0.75) next[w] = 1;
    }
    on = next;
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = on[b.weld[i]!]!;
  return mask;
}

const maskCache = new WeakMap<BodyModel, Map<GarmentId, Uint8Array>>();

/** A garment's region mask on this body (computed once per body; outfit changes reuse it). */
export function garmentMask(b: BodyModel, id: GarmentId): Uint8Array {
  let byId = maskCache.get(b);
  if (!byId) maskCache.set(b, (byId = new Map()));
  let mask = byId.get(id);
  if (!mask) byId.set(id, (mask = regionMask(b, garmentCut(b, id))));
  return mask;
}

/** One shell: the covered triangles pushed out along the normal, with the body's skin weights. */
export function garmentGeometry(b: BodyModel, id: GarmentId): BufferGeometry {
  const cut = garmentCut(b, id);
  const mask = garmentMask(b, id);
  const m = b.data.body;
  const remap = new Int32Array(mask.length).fill(-1);
  const tris: number[] = [];
  const verts: number[] = [];
  for (let t = 0; t < m.index.length; t += 3) {
    const a = m.index[t]!;
    const c = m.index[t + 1]!;
    const e = m.index[t + 2]!;
    if (!mask[a] || !mask[c] || !mask[e]) continue;
    for (const i of [a, c, e]) {
      if (remap[i]! < 0) {
        remap[i] = verts.length;
        verts.push(i);
      }
      tris.push(remap[i]!);
    }
  }
  const n = verts.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const col = new Float32Array(n * 3).fill(1);
  verts.forEach((i, k) => {
    const off = cut.offset(i);
    for (let a = 0; a < 3; a++) {
      pos[k * 3 + a] = b.position[i * 3 + a]! + b.normal[i * 3 + a]! * off;
      nor[k * 3 + a] = b.normal[i * 3 + a]!;
    }
    for (let j = 0; j < 4; j++) {
      si[k * 4 + j] = m.joints[i * 4 + j]!;
      sw[k * 4 + j] = m.weights[i * 4 + j]!;
    }
    if (cut.color) col.set(cut.color(i), k * 3);
  });
  if (cut.smoothing) laplacian(b, verts, pos, mask, cut.smoothing);
  smoothEdges(b, verts, pos, mask);
  if (cut.footBlur) blurFeet(b, verts, pos, cut.footBlur);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(tris);
  if (cut.smoothing || cut.footBlur) g.computeVertexNormals();
  const extra = garmentExtra(b, id);
  return extra ? appendRigid(g, extra.geo, extra.bone) : g;
}

/** Rigid pieces a body shell can't make (the scarf's hanging end, the toque's bobble), bind space. */
function garmentExtra(b: BodyModel, id: GarmentId): { geo: BufferGeometry; bone: number } | null {
  if (id === 'scarf') {
    const chest = new Vector3().setFromMatrixPosition(
      new Matrix4().fromArray(b.data.inverseBind, b.data.bones.indexOf('spine_03') * 16).invert(),
    );
    const geo = new BoxGeometry(0.085, 0.3, 0.016, 1, 6, 1)
      .rotateZ(0.08)
      .translate(0, -0.13, 0)
      .translate(chest.x + SCARF_PIVOT.x, chest.y + SCARF_PIVOT.y, chest.z + SCARF_PIVOT.z);
    return { geo, bone: extraIndex(b, 'wr_scarf') };
  }
  if (id === 'toque') {
    const geo = new SphereGeometry(0.034, 16, 12)
      .translate(0, b.data.headBox.max[1]! + 0.03, b.head.eyeL.z - 0.08)
      .applyMatrix4(b.headWorld);
    return { geo, bone: b.headIndex };
  }
  return null;
}

/** Shell + a rigid piece weighted fully to one bone, as one geometry (one draw call). */
function appendRigid(shell: BufferGeometry, rigid: BufferGeometry, bone: number): BufferGeometry {
  const n0 = shell.attributes.position!.count;
  const rp = rigid.attributes.position!;
  const rn = rigid.attributes.normal!;
  const n = n0 + rp.count;
  const grow = <T extends Float32Array | Uint16Array>(name: string, out: T) => {
    out.set(shell.attributes[name]!.array as ArrayLike<number>);
    return out;
  };
  const pos = grow('position', new Float32Array(n * 3));
  const nor = grow('normal', new Float32Array(n * 3));
  const si = grow('skinIndex', new Uint16Array(n * 4));
  const sw = grow('skinWeight', new Float32Array(n * 4));
  const col = grow('color', new Float32Array(n * 3));
  for (let i = 0; i < rp.count; i++) {
    const k = n0 + i;
    pos.set([rp.getX(i), rp.getY(i), rp.getZ(i)], k * 3);
    nor.set([rn.getX(i), rn.getY(i), rn.getZ(i)], k * 3);
    si[k * 4] = bone;
    sw[k * 4] = 1;
    col.set([1, 1, 1], k * 3);
  }
  const idx = Array.from(shell.index!.array as ArrayLike<number>);
  const ri = rigid.index!;
  for (let i = 0; i < ri.count; i++) idx.push(n0 + ri.getX(i));
  rigid.dispose();
  shell.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function laplacian(
  b: BodyModel,
  verts: number[],
  pos: Float32Array,
  mask: Uint8Array,
  passes: number,
) {
  // Work on welded ids so UV seams stay closed.
  const byWeld = new Map<number, number[]>();
  verts.forEach((i, k) => {
    const w = b.weld[i]!;
    const list = byWeld.get(w);
    if (list) list.push(k);
    else byWeld.set(w, [k]);
  });
  const inRegion = new Set<number>();
  for (let i = 0; i < mask.length; i++) if (mask[i]) inRegion.add(b.weld[i]!);
  const cur = new Map<number, Vector3>();
  for (const [w, ks] of byWeld) cur.set(w, v3(pos, ks[0]!));
  for (let p = 0; p < passes; p++) {
    const next = new Map<number, Vector3>();
    for (const [w, v] of cur) {
      const nb = b.ring[w]!.filter((x) => inRegion.has(x) && cur.has(x));
      // Border vertices stay put so the opening keeps its shape.
      if (nb.length < b.ring[w]!.length || nb.length === 0) {
        next.set(w, v);
        continue;
      }
      const avg = new Vector3();
      for (const x of nb) avg.add(cur.get(x)!);
      avg.divideScalar(nb.length);
      next.set(w, v.clone().lerp(avg, 0.5));
    }
    for (const [w, v] of next) cur.set(w, v);
  }
  for (const [w, ks] of byWeld) {
    const v = cur.get(w)!;
    for (const k of ks) pos.set([v.x, v.y, v.z], k * 3);
  }
}

/** Smooth the shell's open edges along themselves, so cuts read as curves rather than stair-steps. */
function smoothEdges(b: BodyModel, verts: number[], pos: Float32Array, mask: Uint8Array) {
  const inRegion = new Set<number>();
  for (let i = 0; i < mask.length; i++) if (mask[i]) inRegion.add(b.weld[i]!);
  const copies = new Map<number, number[]>();
  verts.forEach((i, k) => {
    const w = b.weld[i]!;
    const list = copies.get(w);
    if (list) list.push(k);
    else copies.set(w, [k]);
  });
  const edge = new Set<number>();
  for (const w of copies.keys()) if (b.ring[w]!.some((x) => !inRegion.has(x))) edge.add(w);
  const cur = new Map<number, Vector3>();
  for (const w of edge) cur.set(w, v3(pos, copies.get(w)![0]!));
  for (let pass = 0; pass < 10; pass++) {
    const next = new Map<number, Vector3>();
    for (const [w, v] of cur) {
      const nb = b.ring[w]!.filter((x) => cur.has(x));
      if (nb.length < 2) {
        next.set(w, v);
        continue;
      }
      const avg = new Vector3();
      for (const x of nb) avg.add(cur.get(x)!);
      next.set(w, v.clone().lerp(avg.divideScalar(nb.length), 0.5));
    }
    for (const [w, v] of next) cur.set(w, v);
  }
  // Averaging along a curved surface cuts inside it; lift the edge back out a little.
  const nrm = new Vector3();
  for (const [w, v] of cur) {
    const ks = copies.get(w)!;
    v.add(v3(b.normal, verts[ks[0]!]!, nrm).multiplyScalar(0.003));
    for (const k of ks) pos.set([v.x, v.y, v.z], k * 3);
  }
}

/** Gaussian blur of foot vertex positions over space (toes are separate islands, so topology can't). */
function blurFeet(b: BodyModel, verts: number[], pos: Float32Array, r: number) {
  for (let pass = 0; pass < 3; pass++) blurPass(b, verts, pos, r);
}

function blurPass(b: BodyModel, verts: number[], pos: Float32Array, r: number) {
  const feet = verts.map((v, k) => [v, k] as const).filter(([v]) => b.group[v] === G.foot);
  const src = Float32Array.from(pos);
  const out = new Vector3();
  const q = new Vector3();
  const p = new Vector3();
  // Spatial hash with 3r cells: only the 27 neighbouring cells can be within the 3r cut-off.
  const cell = 3 * r;
  const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + y + 512) * 1024 + z + 512;
  const grid = new Map<number, number[]>();
  for (const [, k] of feet) {
    const c = key(
      Math.floor(src[k * 3]! / cell),
      Math.floor(src[k * 3 + 1]! / cell),
      Math.floor(src[k * 3 + 2]! / cell),
    );
    const list = grid.get(c);
    if (list) list.push(k);
    else grid.set(c, [k]);
  }
  for (const [, k] of feet) {
    v3(src, k, p);
    out.set(0, 0, 0);
    let wsum = 0;
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
            const d2 = v3(src, j, q).distanceToSquared(p);
            if (d2 > 9 * r * r) continue;
            const w = Math.exp(-d2 / (2 * r * r));
            out.addScaledVector(q, w);
            wsum += w;
          }
    out.divideScalar(wsum);
    // Blurring shrinks the shape; push back out to roughly where the surface was.
    pos.set([out.x, out.y, out.z], k * 3);
    for (let a = 0; a < 3; a++)
      pos[k * 3 + a] = pos[k * 3 + a]! + b.normal[verts[k]! * 3 + a]! * r * 0.2;
  }
}

/**
 * Per-vertex 1 where the body is fully under a worn garment (eroded so shell edges overlap skin).
 * Shells are cut from the body itself, so this is exact per vertex and applies to every garment,
 * not only those whose catalogue entry lists `hidesBody` zones (TDD §8.2.3).
 */
export function hiddenMask(b: BodyModel, worn: readonly GarmentId[]): Float32Array {
  const count = b.ring.length;
  let cover = new Uint8Array(count);
  for (const id of worn) {
    const mask = garmentMask(b, id);
    // A welded vertex is covered only if every copy of it is.
    const all = new Uint8Array(count).fill(1);
    for (let i = 0; i < mask.length; i++) if (!mask[i]) all[b.weld[i]!] = 0;
    for (let w = 0; w < count; w++) if (all[w]) cover[w] = 1;
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(count);
    for (let w = 0; w < count; w++) next[w] = cover[w] && b.ring[w]!.every((x) => cover[x]) ? 1 : 0;
    cover = next;
  }
  const out = new Float32Array(b.weld.length);
  for (let i = 0; i < out.length; i++) out[i] = cover[b.weld[i]!]!;
  return out;
}

// ---------------------------------------------------------------- hair, brows, facial hair, eyes

export const HAIR_STYLE_PIECE: Record<Exclude<HairStyle, 'bald'>, HairPiece> = {
  buzzed: 'buzzed',
  cropped: 'cropped',
  side_part: 'side_part',
  long: 'long',
  buns: 'buns',
};

export const defaultBrows = (sex: Sex): HairPiece =>
  sex === 'male' ? 'brows_regular' : 'brows_female';

/** Head-space transform from the head a piece was modelled on to this body's head. */
function fitToHead(a: CharacterAssets, from: Sex, to: Sex): (p: Vector3) => Vector3 {
  if (from === to) return (p) => p;
  const s = a.headBoxes[from];
  const t = a.headBoxes[to];
  const c = (bx: typeof s, k: number) => (bx.min[k]! + bx.max[k]!) / 2;
  const k = [0, 1, 2].map((i) => (t.max[i]! - t.min[i]!) / (s.max[i]! - s.min[i]!));
  return (p) =>
    p.set(
      (p.x - c(s, 0)) * k[0]! + c(t, 0),
      (p.y - c(s, 1)) * k[1]! + c(t, 1),
      (p.z - c(s, 2)) * k[2]! + c(t, 2),
    );
}

export interface HairOptions {
  style: HairStyle;
  facialHair: FacialHair;
  hair: [number, number, number];
  brows: [number, number, number];
  /** Scalp hair under a hat or hood is dropped (Head-space test). */
  clip: ((p: Vector3) => boolean) | null;
}

const LASH: [number, number, number] = [0.07, 0.055, 0.05];

const extraIndex = (b: BodyModel, e: ExtraBone) => b.data.bones.length + EXTRA_BONES.indexOf(e);

/** Facial-hair variants cut from the one beard mesh (Head space predicates). */
function keepFacial(kind: FacialHair, p: Vector3, H: HeadMetrics): boolean {
  const mouthY = H.mouth.y;
  switch (kind) {
    case 'beard':
      return true;
    case 'goatee':
      return Math.abs(p.x) < 0.032 && p.z > H.eyeL.z - 0.02;
    case 'moustache':
      return p.y > mouthY - 0.006 && Math.abs(p.x) < 0.04 && p.z > H.eyeL.z - 0.02;
    case 'none':
      return false;
  }
}

/** One mesh for scalp hair, brows and facial hair, skinned to the head (and our extra head bones). */
export function hairGeometry(
  a: CharacterAssets,
  b: BodyModel,
  o: HairOptions,
): BufferGeometry | null {
  const sex = b.data.sex;
  const pieces: { piece: HairPiece; kind: 'hair' | 'brows' | 'face' }[] = [
    { piece: defaultBrows(sex), kind: 'brows' },
  ];
  if (o.style !== 'bald') pieces.push({ piece: HAIR_STYLE_PIECE[o.style], kind: 'hair' });
  if (o.facialHair !== 'none') pieces.push({ piece: 'beard', kind: 'face' });
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const nrm = new Vector3();
  const H = b.head;
  const swayPivot = H.eyeL.y - 0.02;
  for (const { piece, kind } of pieces) {
    const h = a.hair[piece];
    const toHead = headSpace(h.headInverseBind);
    const fit = fitToHead(a, h.fittedTo, sex);
    const rot = new Matrix4().extractRotation(toHead);
    const nv = h.position.length / 3;
    const local: Vector3[] = [];
    for (let i = 0; i < nv; i++) local.push(fit(v3(h.position, i).applyMatrix4(toHead)));
    const base = pos.length / 3;
    const color = kind === 'brows' ? o.brows : o.hair;
    const u0 = h.texture === 'hair2' ? 0.5 : 0;
    for (let i = 0; i < nv; i++) {
      p.copy(local[i]!).applyMatrix4(b.headWorld);
      v3(h.normal, i, nrm).applyMatrix4(rot).transformDirection(b.headWorld);
      pos.push(p.x, p.y, p.z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(h.uv[i * 2]! * 0.5 + u0, h.uv[i * 2 + 1]!);
      const l = local[i]!;
      // Some brow meshes include lashes: those stay dark and don't move with the brows.
      const lash = kind === 'brows' && l.y < H.eyeL.y + H.eyeRadius * 1.3;
      col.push(...(lash ? LASH : color));
      if (lash) {
        si.push(b.headIndex, 0, 0, 0);
        sw.push(1, 0, 0, 0);
      } else if (kind === 'brows') {
        si.push(extraIndex(b, l.x > 0 ? 'wr_browL' : 'wr_browR'), 0, 0, 0);
        sw.push(1, 0, 0, 0);
      } else {
        // Long hair below the ears swings with the sway bone in wind.
        const s = piece === 'long' ? Math.max(0, Math.min(1, (swayPivot - l.y) / 0.16)) : 0;
        si.push(b.headIndex, extraIndex(b, 'wr_hairSway'), 0, 0);
        sw.push(1 - s, s, 0, 0);
      }
    }
    for (let t = 0; t < h.index.length; t += 3) {
      const tri = [h.index[t]!, h.index[t + 1]!, h.index[t + 2]!];
      // Keep triangles that cross the hat line: their top half is hidden inside the hat.
      if (kind === 'hair' && o.clip && tri.every((i) => o.clip!(local[i]!))) continue;
      if (kind === 'face' && !tri.every((i) => keepFacial(o.facialHair, local[i]!, H))) continue;
      idx.push(base + tri[0]!, base + tri[1]!, base + tri[2]!);
    }
  }
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(si), 4));
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}

/** Which scalp hair is hidden by whatever is on the head (Head space). */
export function hairClip(
  H: HeadMetrics,
  worn: readonly GarmentId[],
): ((p: Vector3) => boolean) | null {
  if (worn.some((g) => HOOD.has(g))) return (p) => p.y > H.chin;
  if (worn.includes('toque')) return (p) => p.y > capLine(p.z, H);
  return null;
}

export function eyesGeometry(b: BodyModel): BufferGeometry {
  const e = b.data.eyes;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(e.position, 3));
  g.setAttribute('normal', new BufferAttribute(e.normal, 3));
  g.setAttribute('uv', new BufferAttribute(e.uv, 2));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(e.joints), 4));
  g.setAttribute('skinWeight', new BufferAttribute(e.weights, 4));
  g.setIndex(new BufferAttribute(e.index, 1));
  return g;
}

/** Eyelids: skin-coloured caps tucked up behind the brow, rotated down over the eyes to squint. */
export function lidsGeometry(b: BodyModel): BufferGeometry {
  const H = b.head;
  const pos: number[] = [];
  const nor: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const nrm = new Vector3();
  for (const [side, c] of [
    ['wr_lidL', H.eyeL],
    ['wr_lidR', H.eyeR],
  ] as const) {
    const cap = new SphereGeometry(H.eyeRadius * 1.12, 16, 8, 0, Math.PI * 2, 0, 1.3);
    cap.rotateX(-0.75); // tilt the cap up and back: hidden when the eyes are open
    const cp = cap.attributes.position!;
    const cn = cap.attributes.normal!;
    const base = pos.length / 3;
    for (let i = 0; i < cp.count; i++) {
      p.set(cp.getX(i), cp.getY(i), cp.getZ(i)).add(c).applyMatrix4(b.headWorld);
      nrm.set(cn.getX(i), cn.getY(i), cn.getZ(i)).transformDirection(b.headWorld);
      pos.push(p.x, p.y, p.z);
      nor.push(nrm.x, nrm.y, nrm.z);
      si.push(extraIndex(b, side), 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
    const ci = cap.index!;
    for (let i = 0; i < ci.count; i++) idx.push(base + ci.getX(i));
    cap.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(si), 4));
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4));
  g.setIndex(idx);
  return g;
}
