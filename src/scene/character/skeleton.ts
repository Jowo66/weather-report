import { Bone, Euler, Matrix4, Object3D, Quaternion, Skeleton, Vector3 } from 'three';
import type { Joint, Pose } from '../animation/clips';
import type { BodyData } from './data';

/**
 * The character's skeleton (UE-mannequin naming, 65 bones) plus a few bones of our own on the head
 * for eyelids, brows and hair sway. Poses from the procedural pose library (animation/clips.ts) are
 * retargeted onto it: those are Euler rotations relative to a rest pose with arms hanging down and
 * every bone world-aligned, so each mapped bone's world rotation is (procedural world rotation) ×
 * (its reference orientation in that rest pose).
 */

const JOINT_TO_BONE: Record<Joint, string> = {
  hips: 'pelvis',
  spine: 'spine_01',
  chest: 'spine_03',
  neck: 'neck_01',
  head: 'Head',
  shoulderL: 'clavicle_l',
  shoulderR: 'clavicle_r',
  upperArmL: 'upperarm_l',
  upperArmR: 'upperarm_r',
  foreArmL: 'lowerarm_l',
  foreArmR: 'lowerarm_r',
  handL: 'hand_l',
  handR: 'hand_r',
  thighL: 'thigh_l',
  thighR: 'thigh_r',
  shinL: 'calf_l',
  shinR: 'calf_r',
  footL: 'foot_l',
  footR: 'foot_r',
};

/** Parent of each joint in the procedural rig (for composing world rotations). */
const JOINT_PARENT: Record<Joint, Joint | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shoulderL: 'chest',
  shoulderR: 'chest',
  upperArmL: 'shoulderL',
  upperArmR: 'shoulderR',
  foreArmL: 'upperArmL',
  foreArmR: 'upperArmR',
  handL: 'foreArmL',
  handR: 'foreArmR',
  thighL: 'hips',
  thighR: 'hips',
  shinL: 'thighL',
  shinR: 'thighR',
  footL: 'shinL',
  footR: 'shinR',
};
const JOINT_ORDER = Object.keys(JOINT_PARENT) as Joint[];

/** Arm bones are turned from the T-pose to hang down, splayed this far (rad) so they clear the hips. */
const ARM_SPREAD = 0.13;
const ARM_BONES = ['upperarm', 'lowerarm', 'hand'];

export const EXTRA_BONES = [
  'wr_lidL',
  'wr_lidR',
  'wr_browL',
  'wr_browR',
  'wr_hairSway',
  'wr_scarf',
] as const;
export type ExtraBone = (typeof EXTRA_BONES)[number];

/** Where the scarf's hanging end pivots, relative to spine_03 (world axes, metres). */
export const SCARF_PIVOT = new Vector3(0.05, 0.17, 0.17);

export interface HeadMetrics {
  /** All in Head-bone space. */
  eyeL: Vector3;
  eyeR: Vector3;
  eyeRadius: number;
  browL: Vector3;
  browR: Vector3;
  /** Top of the brows (y), front of the face (z), bottom of the chin (y). */
  browTop: number;
  front: number;
  chin: number;
  mouth: Vector3;
}

export interface CharacterRig {
  /** Root bone; scale it for height. */
  root: Bone;
  bones: Bone[];
  byName: Record<string, Bone>;
  skeleton: Skeleton;
  /** Bind-pose world matrices of the source bones (unscaled). */
  bindWorld: Matrix4[];
  head: HeadMetrics;
  /** Rigid attachment frames, world-aligned in the rest pose. */
  anchors: { mouth: Object3D; hem: Object3D; handR: Object3D; head: Object3D };
  /** Internal retargeting data. */
  rest: { local: Quaternion[]; ref: Quaternion[]; pelvisPos: Vector3; upInRoot: Vector3 };
  mapped: (Joint | null)[];
  /** Parent index per source bone (−1 for the root). */
  parents: number[];
}

const _q = new Quaternion();
const _e = new Euler();

export function buildRig(d: BodyData, head: HeadMetrics): CharacterRig {
  const n = d.bones.length;
  const bindWorld: Matrix4[] = [];
  for (let i = 0; i < n; i++)
    bindWorld.push(new Matrix4().fromArray(d.inverseBind, i * 16).invert());
  const bones: Bone[] = [];
  const restLocal: Quaternion[] = [];
  const worldQ: Quaternion[] = [];
  const pos = new Vector3();
  const scl = new Vector3();
  for (let i = 0; i < n; i++) {
    const b = new Bone();
    b.name = d.bones[i]!;
    const p = d.parents[i]!;
    const local = bindWorld[i]!.clone();
    if (p >= 0) local.premultiply(bindWorld[p]!.clone().invert());
    const q = new Quaternion();
    local.decompose(b.position, q, scl);
    b.quaternion.copy(q);
    restLocal.push(q);
    const wq = new Quaternion();
    bindWorld[i]!.decompose(pos, wq, scl);
    worldQ.push(wq);
    bones.push(b);
  }
  for (let i = 0; i < n; i++) {
    const p = d.parents[i]!;
    if (p >= 0) bones[p]!.add(bones[i]!);
  }
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const ref = worldQ.map((q, i) => {
    const name = d.bones[i]!;
    if (!ARM_BONES.some((a) => name.startsWith(a))) return q.clone();
    const sg = name.endsWith('_l') ? 1 : -1;
    const dir = new Vector3(0, 1, 0).applyQuaternion(q);
    const target = new Vector3(sg * Math.sin(ARM_SPREAD), -Math.cos(ARM_SPREAD), 0);
    return new Quaternion().setFromUnitVectors(dir, target).multiply(q);
  });
  const mapped = d.bones.map(
    (name) =>
      (Object.keys(JOINT_TO_BONE) as Joint[]).find((j) => JOINT_TO_BONE[j] === name) ?? null,
  );

  // Our extra bones: on the head in Head space; the scarf end world-aligned in front of the chest.
  const headWorld = bindWorld[d.bones.indexOf('Head')]!;
  const chestWorld = bindWorld[d.bones.indexOf('spine_03')]!;
  const inHead = (p: Vector3) => headWorld.clone().multiply(new Matrix4().makeTranslation(p));
  const extra: Record<ExtraBone, [string, Matrix4]> = {
    wr_lidL: ['Head', inHead(head.eyeL)],
    wr_lidR: ['Head', inHead(head.eyeR)],
    wr_browL: ['Head', inHead(head.browL)],
    wr_browR: ['Head', inHead(head.browR)],
    wr_hairSway: ['Head', inHead(new Vector3(0, head.eyeL.y - 0.02, 0))],
    wr_scarf: [
      'spine_03',
      new Matrix4().makeTranslation(
        new Vector3().setFromMatrixPosition(chestWorld).add(SCARF_PIVOT),
      ),
    ],
  };
  const inverses = bindWorld.map((m) => m.clone().invert());
  for (const name of EXTRA_BONES) {
    const [parent, world] = extra[name];
    const b = new Bone();
    b.name = name;
    world
      .clone()
      .premultiply(bindWorld[d.bones.indexOf(parent)]!.clone().invert())
      .decompose(b.position, b.quaternion, scl);
    b.userData.rest = b.quaternion.clone();
    byName[parent]!.add(b);
    bones.push(b);
    byName[name] = b;
    inverses.push(world.clone().invert());
  }
  const skeleton = new Skeleton(bones, inverses);
  const root = bones[d.parents.indexOf(-1)]!;

  const aligned = (bone: string, at: Vector3) => {
    // A frame whose world rotation is identity in the rest pose (so offsets read as world axes).
    const o = new Object3D();
    const i = d.bones.indexOf(bone);
    o.quaternion.copy(ref[i]!).invert();
    o.position.copy(at);
    byName[bone]!.add(o);
    return o;
  };
  const pelvis = d.bones.indexOf('pelvis');
  const upInRoot = new Vector3(0, 1, 0).applyQuaternion(
    worldQ[d.parents.indexOf(-1)]!.clone().invert(),
  );
  return {
    root,
    bones,
    byName,
    skeleton,
    bindWorld,
    head,
    anchors: {
      mouth: aligned('Head', head.mouth),
      head: aligned('Head', new Vector3()),
      hem: aligned('pelvis', new Vector3(0, -0.12, 0.1)),
      handR: aligned('hand_r', new Vector3()),
    },
    rest: { local: restLocal, ref, pelvisPos: bones[pelvis]!.position.clone(), upInRoot },
    mapped,
    parents: d.parents,
  };
}

const procWorld: Partial<Record<Joint, Quaternion>> = {};
const boneWorld: Quaternion[] = [];

/** Apply a procedural pose (plus face and wind channels) to the character's bones. */
export function applyPose(
  rig: CharacterRig,
  pose: Pose,
  o: { stoop: number; sway: [number, number]; scarf: [number, number] },
) {
  for (const j of JOINT_ORDER) {
    const r = pose.rot[j];
    const q = (procWorld[j] ??= new Quaternion());
    if (r) _q.setFromEuler(_e.set(r[0], r[1], r[2], j.startsWith('foreArm') ? 'YXZ' : 'XYZ'));
    else _q.identity();
    if (j === 'spine' && o.stoop) _q.multiply(new Quaternion().setFromAxisAngle(X, o.stoop));
    const p = JOINT_PARENT[j];
    if (p) q.copy(procWorld[p]!).multiply(_q);
    else q.copy(_q);
  }
  const { local, ref } = rig.rest;
  const n = local.length;
  for (let i = 0; i < n; i++) {
    const bone = rig.bones[i]!;
    const pi = rig.parents[i]!;
    const w = (boneWorld[i] ??= new Quaternion());
    const j = rig.mapped[i];
    if (j) w.copy(procWorld[j]!).multiply(ref[i]!);
    else if (pi >= 0) w.copy(boneWorld[pi]!).multiply(local[i]!);
    else w.copy(local[i]!);
    if (pi >= 0) bone.quaternion.copy(boneWorld[pi]!).invert().multiply(w);
    else bone.quaternion.copy(w);
  }
  const pelvis = rig.byName.pelvis!;
  pelvis.position.copy(rig.rest.pelvisPos).addScaledVector(rig.rest.upInRoot, pose.hipsY);

  // Face: lids close from above for a squint; brows knit and drop for a frown.
  const b = rig.byName;
  const lid = 1.15 * Math.min(1, pose.face.squint);
  b.wr_lidL!.rotation.set(lid, 0, 0);
  b.wr_lidR!.rotation.set(lid, 0, 0);
  const frown = Math.max(0, -pose.face.smile);
  b.wr_browL!.rotation.set(0, 0, -0.22 * frown);
  b.wr_browR!.rotation.set(0, 0, 0.22 * frown);
  b.wr_browL!.position.y = rig.head.browL.y - 0.004 * frown;
  b.wr_browR!.position.y = rig.head.browR.y - 0.004 * frown;
  b.wr_hairSway!.rotation.set(o.sway[0], 0, o.sway[1]);
  b.wr_scarf!.quaternion.copy(b.wr_scarf!.userData.rest as Quaternion).multiply(
    _q.setFromEuler(_e.set(o.scarf[0], 0, o.scarf[1])),
  );
  rig.root.updateMatrixWorld(true);
}

const X = new Vector3(1, 0, 0);
