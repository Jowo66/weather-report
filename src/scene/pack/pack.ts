import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Characters from the Quaternius "Ultimate Animated Character Pack" (CC0), converted by
 * tools/characters/build-characters.py into one JSON manifest + one binary. Decoder and skeleton
 * set-up adapted from Jowo66/strong (src/scene/character/pack.ts).
 */

export interface Manifest {
  fps: number;
  quantize: { min: number[]; scale: number[] };
  bones: { name: string; parent: number; t: number[]; r: number[]; s: number[] }[];
  inverseBind: number[];
  parts: Record<
    string,
    {
      vertices: number;
      indices: number;
      position: number;
      joints: number;
      weights: number;
      index: number;
      colour: number[];
      covers?: number;
      coverCount?: number;
    }
  >;
}

export interface PackPart {
  /** xyz in pack units (bind pose, T-pose, ~3.13 tall, facing +Z). */
  pos: Float32Array;
  /** 4 joints per vertex (feet remapped onto the shins). */
  joints: Uint8Array;
  weights: Float32Array;
  /** Dominant joint per vertex (after the foot remap). */
  dom: Uint8Array;
  /** Dominant joint per vertex before the foot remap (tells feet apart from shins). */
  rawDom: Uint8Array;
  index: Uint16Array;
  /** Pairs (body vertex, this part's triangle): body skin hidden under this garment. */
  covers: Uint16Array | null;
}

/** Pack bone indices. */
export const J = {
  Bone: 0,
  FootL: 1,
  Body: 2,
  Hips: 3,
  Abdomen: 4,
  Torso: 5,
  Neck: 6,
  Head: 7,
  ShoulderL: 8,
  UpperArmL: 9,
  LowerArmL: 10,
  FistL: 11,
  ShoulderR: 12,
  UpperArmR: 13,
  LowerArmR: 14,
  FistR: 15,
  UpperLegL: 16,
  LowerLegL: 17,
  UpperLegR: 18,
  LowerLegR: 19,
  FootR: 21,
} as const;

/** The pack skins the feet to IK foot targets; we pose legs directly, so feet follow the shins. */
const FOOT_TO_SHIN: Record<number, number> = { [J.FootL]: J.LowerLegL, [J.FootR]: J.LowerLegR };

/** Bones turned to hang straight down in the reference pose (our procedural rig's rest pose). */
const LIMBS = new Set<number>([
  J.UpperArmL,
  J.LowerArmL,
  J.FistL,
  J.UpperArmR,
  J.LowerArmR,
  J.FistR,
  J.UpperLegL,
  J.LowerLegL,
  J.UpperLegR,
  J.LowerLegR,
]);

export interface SkeletonInfo {
  n: number;
  names: string[];
  parent: Int8Array;
  /** Parents before children. */
  order: number[];
  bindPos: Vector3[];
  bindQuat: Quaternion[];
  bindScale: Vector3[];
  bindWorld: Quaternion[];
  /** Reference world orientation matching the procedural rig's rest pose (limbs hanging down). */
  ref: Quaternion[];
  inverseBind: Matrix4[];
  /** Body bone height in the bind pose (pack units). */
  hipY: number;
}

export interface HeadMetrics {
  centre: Vector3;
  radius: number;
  top: number;
  front: number;
  chinY: number;
  eyeY: number;
  eyeX: number;
  eyeBottom: number;
}

export interface Pack {
  manifest: Manifest;
  parts: Record<string, PackPart>;
  skel: SkeletonInfo;
  head: HeadMetrics;
  /** Total height of the body in pack units. */
  height: number;
}

export function decodePack(m: Manifest, bin: ArrayBuffer): Pack {
  const parts: Record<string, PackPart> = {};
  const { min, scale } = m.quantize;
  for (const [id, p] of Object.entries(m.parts)) {
    const q = new Int16Array(bin, p.position, p.vertices * 3);
    const pos = new Float32Array(p.vertices * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (q[i]! + 32768) * scale[i % 3]! + min[i % 3]!;
    const raw = new Uint8Array(bin, p.joints, p.vertices * 4);
    const joints = raw.slice();
    for (let k = 0; k < joints.length; k++) joints[k] = FOOT_TO_SHIN[joints[k]!] ?? joints[k]!;
    const wq = new Uint8Array(bin, p.weights, p.vertices * 4);
    const weights = new Float32Array(p.vertices * 4);
    const dom = new Uint8Array(p.vertices);
    const rawDom = new Uint8Array(p.vertices);
    for (let v = 0; v < p.vertices; v++) {
      let best = 0;
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += wq[v * 4 + k]!;
        if (wq[v * 4 + k]! > wq[v * 4 + best]!) best = k;
      }
      for (let k = 0; k < 4; k++)
        weights[v * 4 + k] = sum > 0 ? wq[v * 4 + k]! / sum : k === 0 ? 1 : 0;
      dom[v] = joints[v * 4 + best]!;
      rawDom[v] = raw[v * 4 + best]!;
    }
    const covers =
      p.coverCount && p.covers !== undefined
        ? new Uint16Array(bin, p.covers, p.coverCount * 2)
        : null;
    parts[id] = {
      pos,
      joints,
      weights,
      dom,
      rawDom,
      index: new Uint16Array(bin, p.index, p.indices),
      covers,
    };
  }
  const body = parts.body;
  if (!body || !parts.face) throw new Error('character pack: body/face missing');
  let top = 0;
  for (let i = 1; i < body.pos.length; i += 3) top = Math.max(top, body.pos[i]!);
  return { manifest: m, parts, skel: skeletonInfo(m), head: headMetrics(parts), height: top };
}

export function skeletonInfo(m: Manifest): SkeletonInfo {
  const n = m.bones.length;
  const parent = new Int8Array(n);
  const bindPos: Vector3[] = [];
  const bindQuat: Quaternion[] = [];
  const bindScale: Vector3[] = [];
  m.bones.forEach((b, i) => {
    parent[i] = b.parent;
    bindPos.push(new Vector3(b.t[0], b.t[1], b.t[2]));
    bindQuat.push(new Quaternion(b.r[0], b.r[1], b.r[2], b.r[3]));
    bindScale.push(new Vector3(b.s[0], b.s[1], b.s[2]));
  });
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => {
    if (seen.has(i)) return;
    if (parent[i]! >= 0) visit(parent[i]!);
    seen.add(i);
    order.push(i);
  };
  for (let i = 0; i < n; i++) visit(i);
  const bindWorld: Quaternion[] = new Array<Quaternion>(n);
  const worldPos: Vector3[] = new Array<Vector3>(n);
  for (const i of order) {
    const p = parent[i]!;
    bindWorld[i] = p < 0 ? bindQuat[i]!.clone() : bindWorld[p]!.clone().multiply(bindQuat[i]!);
    worldPos[i] =
      p < 0
        ? bindPos[i]!.clone()
        : bindPos[i]!.clone().applyQuaternion(bindWorld[p]!).add(worldPos[p]!);
  }
  const down = new Vector3(0, -1, 0);
  const ref = bindWorld.map((q, i) => {
    if (!LIMBS.has(i)) return q.clone();
    const dir = new Vector3(0, 1, 0).applyQuaternion(q); // bones point along their local +Y
    return new Quaternion().setFromUnitVectors(dir, down).multiply(q);
  });
  const inverseBind: Matrix4[] = [];
  for (let i = 0; i < n; i++) inverseBind.push(new Matrix4().fromArray(m.inverseBind, i * 16));
  return {
    n,
    names: m.bones.map((b) => b.name),
    parent,
    order,
    bindPos,
    bindQuat,
    bindScale,
    bindWorld,
    ref,
    inverseBind,
    hipY: worldPos[J.Body]!.y,
  };
}

function headMetrics(parts: Record<string, PackPart>): HeadMetrics {
  const body = parts.body!;
  const box = new Box3();
  const v = new Vector3();
  for (let i = 0; i < body.dom.length; i++)
    if (body.dom[i] === J.Head) box.expandByPoint(v.fromArray(body.pos, i * 3));
  const centre = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const face = parts.face!;
  // The face part holds brows (top) and eyes; eyes are everything below the brow gap.
  let fyMax = -Infinity;
  let fyMin = Infinity;
  for (let i = 1; i < face.pos.length; i += 3) {
    fyMax = Math.max(fyMax, face.pos[i]!);
    fyMin = Math.min(fyMin, face.pos[i]!);
  }
  const browCut = fyMax - 0.07;
  let ey = 0;
  let ex = 0;
  let n = 0;
  for (let i = 0; i < face.dom.length; i++) {
    if (face.pos[i * 3 + 1]! >= browCut) continue;
    ey += face.pos[i * 3 + 1]!;
    ex += Math.abs(face.pos[i * 3]!);
    n++;
  }
  return {
    centre,
    radius: Math.max(size.x, size.z) / 2,
    top: box.max.y,
    front: box.max.z,
    chinY: box.min.y,
    eyeY: ey / n,
    eyeX: ex / n,
    eyeBottom: fyMin,
  };
}

let pack: Pack | null = null;
let loading: Promise<Pack | null> | null = null;

/** The pack once loaded (null until then, or if it failed: callers fall back to the procedural avatar). */
export const packData = (): Pack | null => pack;

export function loadPack(): Promise<Pack | null> {
  if (pack) return Promise.resolve(pack);
  if (!loading) {
    const base = import.meta.env.BASE_URL;
    loading = Promise.all([
      fetch(`${base}characters/characters.json`).then((r) => {
        if (!r.ok) throw new Error(`characters.json ${r.status}`);
        return r.json() as Promise<Manifest>;
      }),
      fetch(`${base}characters/characters.bin`).then((r) => {
        if (!r.ok) throw new Error(`characters.bin ${r.status}`);
        return r.arrayBuffer();
      }),
    ])
      .then(([m, bin]) => (pack = decodePack(m, bin)))
      .catch((e: unknown) => {
        console.warn('Weather Report: character pack unavailable, using the built-in avatar.', e);
        return null;
      });
  }
  return loading;
}
