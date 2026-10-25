import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Undertone } from '../scene/skinTone';
import { runMigrations } from './migrations';
import { jsonStorage } from './persist';

export type BuildPreset = 'slim' | 'average' | 'muscular' | 'heavy';
export type AgeLook = 'young_adult' | 'adult' | 'senior';
export type Sex = 'male' | 'female';
export type HairStyle = 'buzzed' | 'cropped' | 'side_part' | 'long' | 'buns' | 'bald';
export type FacialHair = 'none' | 'moustache' | 'goatee' | 'beard';

export interface AvatarAppearance {
  /** Which base body (Quaternius Universal Base Characters). Appearance only. */
  sex: Sex;
  /** Barycentric weights over slim / average / muscular / heavy; sums to 1. */
  build: Record<BuildPreset, number>;
  /** −1 short … +1 tall. */
  height: number;
  ageLook: AgeLook;
  melanin: number;
  undertone: Undertone;
  hairStyle: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
}

export interface AvatarState extends AvatarAppearance {
  /** "I run cold / hot", −3…+3 °C. The only avatar setting that changes the maths. */
  personalOffset: number;
  setPersonalOffset: (v: number) => void;
  setAppearance: (p: Partial<AvatarAppearance>) => void;
  setBuildPreset: (b: BuildPreset) => void;
  reset: () => void;
}

export const clampOffset = (v: number) => Math.max(-3, Math.min(3, Math.round(v * 2) / 2));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  sex: 'male',
  build: { slim: 0, average: 1, muscular: 0, heavy: 0 },
  height: 0,
  ageLook: 'adult',
  melanin: 0.5,
  undertone: 'neutral',
  hairStyle: 'side_part',
  hairColor: '#3b2a20',
  facialHair: 'none',
};

export const AVATAR_STORE_VERSION = 3;
export const HAIR_STYLES: readonly HairStyle[] = [
  'side_part',
  'buzzed',
  'cropped',
  'long',
  'buns',
  'bald',
];
export const FACIAL_HAIR: readonly FacialHair[] = ['none', 'moustache', 'goatee', 'beard'];
const SEXES: readonly Sex[] = ['male', 'female'];
const AGES: readonly AgeLook[] = ['young_adult', 'adult', 'senior'];

/** v2 procedural hair styles → the closest style in the character pack. */
const V2_HAIR: Record<string, HairStyle> = {
  short: 'side_part',
  buzz: 'buzzed',
  bob: 'cropped',
  long: 'long',
  curly: 'cropped',
  bun: 'buns',
  ponytail: 'long',
  bald: 'bald',
};

export function normaliseBuild(
  b: Partial<Record<BuildPreset, number>>,
): Record<BuildPreset, number> {
  const keys: BuildPreset[] = ['slim', 'average', 'muscular', 'heavy'];
  const v = keys.map((k) => Math.max(0, Number(b[k]) || 0));
  const sum = v.reduce((a, x) => a + x, 0);
  if (sum <= 0) return { ...DEFAULT_APPEARANCE.build };
  return Object.fromEntries(keys.map((k, i) => [k, v[i]! / sum])) as Record<BuildPreset, number>;
}

/** v1 (offset only) → v2 (appearance) → v3 (sex toggle and facial hair replace the frame blend). */
export function migrateAvatar(persisted: unknown, fromVersion: number) {
  return runMigrations(
    {
      1: (s) => ({
        frame: 0,
        build: DEFAULT_APPEARANCE.build,
        height: 0,
        ageLook: 'adult',
        melanin: DEFAULT_APPEARANCE.melanin,
        undertone: DEFAULT_APPEARANCE.undertone,
        hairStyle: 'short',
        hairColor: DEFAULT_APPEARANCE.hairColor,
        ...s,
        personalOffset: clampOffset(Number(s.personalOffset) || 0),
      }),
      2: ({ frame, hairStyle, ...s }) => ({
        ...s,
        sex: Number(frame) > 0.33 ? 'female' : 'male',
        hairStyle: V2_HAIR[String(hairStyle)] ?? DEFAULT_APPEARANCE.hairStyle,
        facialHair: 'none',
      }),
    },
    persisted,
    fromVersion,
    AVATAR_STORE_VERSION,
  );
}

function sanitize(p: Partial<AvatarAppearance>): Partial<AvatarAppearance> {
  const out: Partial<AvatarAppearance> = { ...p };
  if (p.sex !== undefined && !SEXES.includes(p.sex)) delete out.sex;
  if (p.facialHair !== undefined && !FACIAL_HAIR.includes(p.facialHair)) delete out.facialHair;
  if (p.height !== undefined) out.height = clamp(p.height, -1, 1);
  if (p.melanin !== undefined) out.melanin = clamp(p.melanin, 0, 1);
  if (p.build !== undefined) out.build = normaliseBuild(p.build);
  if (p.hairStyle !== undefined && !HAIR_STYLES.includes(p.hairStyle)) delete out.hairStyle;
  if (p.ageLook !== undefined && !AGES.includes(p.ageLook)) delete out.ageLook;
  if (p.hairColor !== undefined && !/^#[0-9a-f]{6}$/i.test(p.hairColor)) delete out.hairColor;
  return out;
}

export const useAvatar = create<AvatarState>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE,
      personalOffset: 0,
      setPersonalOffset: (v) => set({ personalOffset: clampOffset(v) }),
      setAppearance: (p) => set(sanitize(p)),
      setBuildPreset: (b) =>
        set({
          build: { slim: 0, average: 0, muscular: 0, heavy: 0, [b]: 1 } as Record<
            BuildPreset,
            number
          >,
        }),
      reset: () => set({ ...DEFAULT_APPEARANCE }),
    }),
    {
      name: 'wr:avatar:v1',
      version: AVATAR_STORE_VERSION,
      storage: jsonStorage,
      migrate: (p, v) => migrateAvatar(p, v) as unknown as AvatarState,
      merge: (persisted, current) => ({
        ...current,
        ...sanitize((persisted ?? {}) as Partial<AvatarAppearance>),
        personalOffset: clampOffset(
          Number((persisted as { personalOffset?: number } | undefined)?.personalOffset) || 0,
        ),
      }),
    },
  ),
);
