/**
 * Quaternius "Universal Base Characters" (CC0), converted by tools/characters/build-ubc.py into
 * public/models/characters/ (one JSON manifest, one binary per body plus one for hair).
 * Everything here is plain typed arrays so it can be unit-tested without WebGL.
 */

import type { Sex } from '../../state/avatarStore';

export type { Sex };
export const HAIR_PIECES = [
  'buzzed',
  'cropped',
  'side_part',
  'long',
  'buns',
  'beard',
  'brows_regular',
  'brows_female',
] as const;
export type HairPiece = (typeof HAIR_PIECES)[number];

interface MeshLayout {
  vertices: number;
  indices: number;
  position: number;
  normal: number;
  uv: number;
  joints: number;
  weights: number;
  index: number;
}

export interface Manifest {
  version: number;
  bodies: Record<
    Sex,
    {
      file: string;
      bones: string[];
      parents: number[];
      inverseBind: number;
      headBox: { min: number[]; max: number[] };
      body: MeshLayout;
      eyes: MeshLayout;
      textures: { detail: string; normal: string };
    }
  >;
  hair: Record<
    HairPiece,
    MeshLayout & { headInverseBind: number[]; fittedTo: Sex; texture: 'hair1' | 'hair2' }
  >;
  /** hair1 | hair2 side by side. */
  hairTexture: string;
  eyeTexture: string;
}

export interface MeshData {
  /** Bind pose (T-pose), metres, +Y up, facing +Z. */
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** 4 joint indices per vertex. */
  joints: Uint8Array;
  /** 4 weights per vertex, normalised to sum to 1. */
  weights: Float32Array;
  index: Uint16Array;
}

export interface BodyData {
  sex: Sex;
  bones: string[];
  parents: number[];
  /** Column-major 4×4 per bone. */
  inverseBind: Float32Array;
  headBox: { min: number[]; max: number[] };
  body: MeshData;
  eyes: MeshData;
  textures: { detail: string; normal: string };
}

export interface HairData extends MeshData {
  /** The source skeleton's Head inverse bind (column-major), to move the piece into head space. */
  headInverseBind: Float32Array;
  fittedTo: Sex;
  /** Which half of the hair atlas the UVs refer to. */
  texture: 'hair1' | 'hair2';
}

export function decodeMesh(bin: ArrayBuffer, m: MeshLayout): MeshData {
  const wq = new Uint8Array(bin, m.weights, m.vertices * 4);
  const weights = new Float32Array(m.vertices * 4);
  for (let v = 0; v < m.vertices; v++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += wq[v * 4 + k]!;
    for (let k = 0; k < 4; k++)
      weights[v * 4 + k] = sum > 0 ? wq[v * 4 + k]! / sum : k === 0 ? 1 : 0;
  }
  return {
    position: new Float32Array(bin, m.position, m.vertices * 3),
    normal: new Float32Array(bin, m.normal, m.vertices * 3),
    uv: new Float32Array(bin, m.uv, m.vertices * 2),
    joints: new Uint8Array(bin, m.joints, m.vertices * 4),
    weights,
    index: new Uint16Array(bin, m.index, m.indices),
  };
}

export function decodeBody(manifest: Manifest, sex: Sex, bin: ArrayBuffer): BodyData {
  const b = manifest.bodies[sex];
  return {
    sex,
    bones: b.bones,
    parents: b.parents,
    inverseBind: new Float32Array(bin, b.inverseBind, b.bones.length * 16),
    headBox: b.headBox,
    body: decodeMesh(bin, b.body),
    eyes: decodeMesh(bin, b.eyes),
    textures: b.textures,
  };
}

export function decodeHair(manifest: Manifest, bin: ArrayBuffer): Record<HairPiece, HairData> {
  return Object.fromEntries(
    HAIR_PIECES.map((k) => {
      const h = manifest.hair[k];
      return [
        k,
        {
          ...decodeMesh(bin, h),
          headInverseBind: new Float32Array(h.headInverseBind),
          fittedTo: h.fittedTo,
          texture: h.texture,
        },
      ];
    }),
  ) as Record<HairPiece, HairData>;
}

// ---------------------------------------------------------------- loading (browser)

export interface CharacterAssets {
  manifest: Manifest;
  body: BodyData;
  hair: Record<HairPiece, HairData>;
  /** Other body, for refitting hair modelled on it (only head metrics are used). */
  headBoxes: Record<Sex, { min: number[]; max: number[] }>;
}

const base = () => `${import.meta.env.BASE_URL}models/characters/`;

async function fetchOk<T>(url: string, as: 'json' | 'bin'): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (as === 'json' ? r.json() : r.arrayBuffer()) as Promise<T>;
}

let manifestP: Promise<Manifest> | null = null;
let hairP: Promise<Record<HairPiece, HairData>> | null = null;
const bodyP = new Map<Sex, Promise<BodyData>>();
const ready = new Map<Sex, CharacterAssets>();

/** Load (once) everything needed to build a character of this sex. Rejects if the assets are missing. */
export function loadCharacter(sex: Sex): Promise<CharacterAssets> {
  manifestP ??= fetchOk<Manifest>(`${base()}characters.json`, 'json');
  const m = manifestP;
  hairP ??= m.then(async (mf) => decodeHair(mf, await fetchOk(`${base()}hair.bin`, 'bin')));
  if (!bodyP.has(sex))
    bodyP.set(
      sex,
      m.then(async (mf) =>
        decodeBody(mf, sex, await fetchOk(`${base()}${mf.bodies[sex].file}`, 'bin')),
      ),
    );
  const p = Promise.all([m, bodyP.get(sex)!, hairP]).then(([manifest, body, hair]) => {
    const a: CharacterAssets = {
      manifest,
      body,
      hair,
      headBoxes: { male: manifest.bodies.male.headBox, female: manifest.bodies.female.headBox },
    };
    ready.set(sex, a);
    return a;
  });
  // A failed fetch must not poison the cache: allow a retry next time.
  p.catch(() => {
    manifestP = null;
    hairP = null;
    bodyP.delete(sex);
  });
  return p;
}

/** Assets already loaded for this sex (synchronous), or null. */
export const loadedCharacter = (sex: Sex): CharacterAssets | null => ready.get(sex) ?? null;

export const textureUrl = (name: string) => `${base()}${name}`;
