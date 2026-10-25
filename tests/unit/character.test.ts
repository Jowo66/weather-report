import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { basePose } from '../../src/scene/animation/clips';
import {
  decodeBody,
  decodeHair,
  type CharacterAssets,
  type Manifest,
  type Sex,
} from '../../src/scene/character/data';
import {
  bodyModel,
  defaultBrows,
  garmentCut,
  garmentGeometry,
  hairClip,
  hairGeometry,
  headMetrics,
  hiddenMask,
  HAIR_STYLE_PIECE,
  type BodyModel,
} from '../../src/scene/character/parts';
import { applyPose, buildRig, EXTRA_BONES } from '../../src/scene/character/skeleton';
import { GARMENT_IDS, ZONE_IDS } from '../../src/engine';
import { DEFAULT_APPEARANCE, FACIAL_HAIR, HAIR_STYLES } from '../../src/state/avatarStore';

const dir = 'public/models/characters/';
const bin = (f: string) => {
  const b = readFileSync(dir + f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const manifest = JSON.parse(readFileSync(dir + 'characters.json', 'utf8')) as Manifest;
const hair = decodeHair(manifest, bin('hair.bin'));
const SEXES: Sex[] = ['male', 'female'];

function load(sex: Sex): { assets: CharacterAssets; model: BodyModel } {
  const body = decodeBody(manifest, sex, bin(manifest.bodies[sex].file));
  const assets: CharacterAssets = {
    manifest,
    body,
    hair,
    headBoxes: { male: manifest.bodies.male.headBox, female: manifest.bodies.female.headBox },
  };
  const head = headMetrics(body, hair[defaultBrows(sex)]);
  return { assets, model: bodyModel(body, DEFAULT_APPEARANCE.build, head) };
}
const chars = { male: load('male'), female: load('female') };

const worldPos = (m: BodyModel, bone: string, rig = buildRig(m.data, m.head)) =>
  rig.byName[bone]!.getWorldPosition(new Vector3());

describe('character pack (Quaternius Universal Base Characters)', () => {
  it.each(SEXES)('%s: decodes a skinned body with normalised weights', (sex) => {
    const { model } = chars[sex];
    const b = model.data;
    expect(b.bones).toHaveLength(65);
    expect(b.body.position.length / 3).toBeGreaterThan(5000);
    for (let v = 0; v < b.body.weights.length / 4; v += 53) {
      const w = b.body.weights;
      expect(w[v * 4]! + w[v * 4 + 1]! + w[v * 4 + 2]! + w[v * 4 + 3]!).toBeCloseTo(1, 5);
    }
    // Every comfort zone has skin.
    for (let z = 0; z < ZONE_IDS.length; z++)
      expect(model.zone.includes(z), ZONE_IDS[z]).toBe(true);
  });

  it.each(SEXES)('%s: the rest pose keeps the spine and head where the mesh was bound', (sex) => {
    const { model } = chars[sex];
    const rig = buildRig(model.data, model.head);
    applyPose(rig, basePose('comfortable'), { stoop: 0, sway: [0, 0], scarf: [0, 0] });
    for (const name of ['pelvis', 'spine_02', 'Head']) {
      const i = model.data.bones.indexOf(name);
      const bind = new Matrix4().fromArray(model.data.inverseBind, i * 16).invert();
      const at = new Vector3().setFromMatrixPosition(bind);
      expect(rig.byName[name]!.getWorldPosition(new Vector3()).distanceTo(at), name).toBeLessThan(
        0.03,
      );
    }
  });

  it.each(SEXES)('%s: arms hang down beside the body in the rest pose (not a T-pose)', (sex) => {
    const { model } = chars[sex];
    const rig = buildRig(model.data, model.head);
    applyPose(rig, basePose('comfortable'), { stoop: 0, sway: [0, 0], scarf: [0, 0] });
    for (const s of ['l', 'r']) {
      const shoulder = worldPos(model, `upperarm_${s}`, rig);
      const hand = worldPos(model, `hand_${s}`, rig);
      expect(hand.y).toBeLessThan(shoulder.y - 0.4);
      expect(Math.abs(hand.x)).toBeLessThan(0.35);
      // Left is +X, like the procedural pose library.
      expect(Math.sign(hand.x)).toBe(s === 'l' ? 1 : -1);
    }
  });

  it('adds our face/sway bones after the pack skeleton', () => {
    const { model } = chars.male;
    const rig = buildRig(model.data, model.head);
    expect(rig.skeleton.bones).toHaveLength(65 + EXTRA_BONES.length);
    expect(rig.skeleton.boneInverses).toHaveLength(rig.skeleton.bones.length);
  });
});

describe('garments cut from the body', () => {
  it.each(SEXES)('%s: every garment builds a non-empty, skinned shell', (sex) => {
    const { model } = chars[sex];
    const bones = model.data.bones.length + EXTRA_BONES.length;
    for (const id of GARMENT_IDS) {
      const g = garmentGeometry(model, id);
      const n = g.attributes.position!.count;
      expect(n, id).toBeGreaterThan(50);
      const si = g.attributes.skinIndex!;
      for (let i = 0; i < n; i += 31) expect(si.getX(i), id).toBeLessThan(bones);
    }
  });

  it('layers sit outside each other on the chest and tops go over trousers at the waist', () => {
    const { model } = chars.male;
    const P = model.data.body.position;
    const L = model.L;
    // A front-of-chest vertex and a front-of-waist vertex.
    let chest = -1;
    let waist = -1;
    for (let i = 0; i < P.length / 3; i++) {
      const x = Math.abs(P[i * 3]!);
      const y = P[i * 3 + 1]!;
      const nz = model.normal[i * 3 + 2]!;
      if (x < 0.06 && nz > 0.8 && Math.abs(y - (L.chestY + 0.02)) < 0.02) chest = i;
      if (x < 0.08 && nz > 0.6 && Math.abs(y - (L.hipY + 0.05)) < 0.02) waist = i;
    }
    expect(chest).toBeGreaterThanOrEqual(0);
    expect(waist).toBeGreaterThanOrEqual(0);
    const off = (id: (typeof GARMENT_IDS)[number], i: number) => garmentCut(model, id).offset(i);
    expect(off('t_shirt', chest)).toBeGreaterThan(0);
    expect(off('sweater', chest)).toBeGreaterThan(off('t_shirt', chest));
    expect(off('winter_coat', chest)).toBeGreaterThan(off('sweater', chest));
    for (const top of ['t_shirt', 'sweater', 'light_jacket'] as const)
      for (const bottom of ['jeans', 'snow_pants', 'thermal_bottoms'] as const)
        expect(off(top, waist), `${top} over ${bottom}`).toBeGreaterThan(off(bottom, waist));
  });

  it('hides skin under clothes, never the head under trousers', () => {
    const { model } = chars.female;
    const none = hiddenMask(model, []);
    expect(none.some((v) => v > 0)).toBe(false);
    const jeans = hiddenMask(model, ['jeans']);
    const leg = ZONE_IDS.indexOf('legs');
    const head = ZONE_IDS.indexOf('head');
    let legsHidden = 0;
    let legs = 0;
    for (let i = 0; i < jeans.length; i++) {
      if (model.zone[i] === head) expect(jeans[i]).toBe(0);
      if (model.zone[i] === leg) {
        legs++;
        legsHidden += jeans[i]!;
      }
    }
    expect(legsHidden / legs).toBeGreaterThan(0.6);
  });
});

describe('hair, brows and facial hair', () => {
  it.each(SEXES)('%s: no hair style covers the eyes, on either head', (sex) => {
    const { assets, model } = chars[sex];
    const H = model.head;
    const toHead = model.headWorld.clone().invert();
    for (const style of HAIR_STYLES) {
      if (style === 'bald') continue;
      const g = hairGeometry(assets, model, {
        style,
        facialHair: 'none',
        hair: [1, 1, 1],
        brows: [0, 0, 0],
        clip: null,
      })!;
      const p = g.attributes.position!;
      const v = new Vector3();
      // Only scalp hair is checked (brows/lashes are expected near the eyes).
      const own = assets.hair[HAIR_STYLE_PIECE[style]].position.length / 3;
      for (let i = p.count - own; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(toHead);
        const overEye =
          v.z > H.eyeL.z &&
          Math.abs(Math.abs(v.x) - H.eyeL.x) < H.eyeRadius * 0.8 &&
          Math.abs(v.y - H.eyeL.y) < H.eyeRadius * 0.8;
        expect(overEye, `${style} vertex ${i}`).toBe(false);
      }
    }
  });

  it('facial hair variants are nested cuts of the beard', () => {
    const { assets, model } = chars.male;
    const tris = (facialHair: (typeof FACIAL_HAIR)[number]) =>
      hairGeometry(assets, model, {
        style: 'bald',
        facialHair,
        hair: [1, 1, 1],
        brows: [0, 0, 0],
        clip: null,
      })!.index!.count / 3;
    const none = tris('none');
    expect(tris('moustache')).toBeGreaterThan(none);
    expect(tris('goatee')).toBeGreaterThan(none);
    expect(tris('beard')).toBeGreaterThan(tris('goatee'));
    expect(tris('beard')).toBeGreaterThan(tris('moustache'));
  });

  it('a toque or hood hides the scalp hair under it', () => {
    const { assets, model } = chars.female;
    const count = (worn: Parameters<typeof hairClip>[1]) =>
      hairGeometry(assets, model, {
        style: 'buns',
        facialHair: 'none',
        hair: [1, 1, 1],
        brows: [0, 0, 0],
        clip: hairClip(model.head, worn),
      })!.index!.count;
    expect(count(['toque'])).toBeLessThan(count([]));
    expect(count(['hoodie'])).toBeLessThan(count(['toque']));
  });
});
