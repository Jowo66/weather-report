/**
 * Skin tone model (TDD §8.3): `melanin ∈ [0,1]` sampled along a 10-stop ramp based on the
 * Monk Skin Tone scale swatches, nudged by undertone. Rendering only: never used in the maths.
 */
export type Undertone = 'cool' | 'neutral' | 'warm';

export const MONK_SCALE: readonly string[] = [
  '#f6ede4',
  '#f3e7db',
  '#f7ead0',
  '#eadaba',
  '#d7bd96',
  '#a07e56',
  '#825c43',
  '#604134',
  '#3a312a',
  '#292420',
];

/** Preset i (0–9) ↔ melanin. */
export const presetMelanin = (i: number) => i / (MONK_SCALE.length - 1);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** sRGB [0,1] base albedo for a melanin value and undertone. */
export function skinRgb(
  melanin: number,
  undertone: Undertone = 'neutral',
): [number, number, number] {
  const x = clamp01(melanin) * (MONK_SCALE.length - 1);
  const i = Math.min(MONK_SCALE.length - 2, Math.floor(x));
  const t = x - i;
  const a = hexToRgb(MONK_SCALE[i]!);
  const b = hexToRgb(MONK_SCALE[i + 1]!);
  const rgb = a.map((v, k) => v + (b[k]! - v) * t) as [number, number, number];
  const shift =
    undertone === 'warm'
      ? [0.02, 0.005, -0.02]
      : undertone === 'cool'
        ? [-0.01, 0, 0.02]
        : [0, 0, 0];
  return rgb.map((v, k) => clamp01(v + shift[k]!)) as [number, number, number];
}

export function skinHex(melanin: number, undertone: Undertone = 'neutral'): string {
  return `#${skinRgb(melanin, undertone)
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
