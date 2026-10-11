import { GARMENT_BY_ID } from '../data/garments';
import type { GarmentId } from '../engine';
import type { HairStyle } from '../state/avatarStore';
import { ZONE_INDEX, cap, capsule, cyl, sphere, torus, box, type Part, type Rig } from './rig';

/** Layer offset: each layer sits a little further out (TDD §8.2: ~2–4 mm·n, exaggerated for legibility). */
const off = (layer: number) => 0.006 + 0.0065 * layer;

type SleeveLen = 0 | 1 | 2;
const SLEEVES: Partial<Record<GarmentId, SleeveLen>> = {
  tank_top: 0,
  t_shirt: 1,
  long_sleeve: 2,
  thermal_top: 2,
  hoodie: 2,
  sweater: 2,
  light_jacket: 2,
  rain_shell: 2,
  winter_coat: 2,
};
const HEM: Partial<Record<GarmentId, number>> = {
  winter_coat: 0.36,
  rain_shell: 0.2,
  light_jacket: 0.1,
  hoodie: 0.05,
  sweater: 0.04,
};
const LEGS: Partial<Record<GarmentId, 'short' | 'long'>> = {
  shorts: 'short',
  jeans: 'long',
  thermal_bottoms: 'long',
  snow_pants: 'long',
};

/** Garment parts for one garment, following the rig's morphed dimensions. */
export function garmentParts(r: Rig, id: GarmentId): Part[] {
  const d = r.dims;
  const g = GARMENT_BY_ID[id];
  const o = off(g.layer) + (id === 'winter_coat' || id === 'snow_pants' ? 0.012 : 0);
  const Z = ZONE_INDEX;
  const parts: Part[] = [];
  const sleeves = SLEEVES[id];
  if (sleeves !== undefined) {
    const tr = d.torsoR + o;
    const top = id === 'tank_top' ? d.chestLen + d.spineLen - 0.26 : d.chestLen + d.spineLen - 0.2;
    parts.push({
      bone: 'torsoShell',
      geo: capsule(tr, top),
      at: [0, id === 'tank_top' ? -0.04 : -0.02, 0],
      scale: [d.torsoW, 1, d.torsoD],
      zone: Z.torso,
    });
    const hem = HEM[id];
    if (hem) {
      parts.push({
        bone: 'hem',
        geo: cyl(
          d.torsoR * d.torsoW * 0.98 + o,
          d.torsoR * d.torsoW * (1.04 + hem * 0.4) + o,
          hem,
          true,
          20,
        ),
        at: [0, -hem / 2, 0],
        scale: [1, 1, d.torsoD * 1.1],
        zone: Z.torso,
      });
    }
    for (const s of ['L', 'R'] as const) {
      if (sleeves >= 1) {
        parts.push({
          bone: `upperArm${s}`,
          geo: sphere(d.armR * 1.25 + o),
          at: [0, -0.01, 0],
          zone: Z.arms,
        });
        const len = sleeves === 1 ? d.upperArm * 0.45 : d.upperArm;
        parts.push({
          bone: `upperArm${s}`,
          geo: cyl(d.armR + o * 1.1, d.armR + o * (sleeves === 1 ? 1.6 : 1.1), len, sleeves === 1),
          at: [0, -len / 2, 0],
          zone: Z.arms,
        });
      }
      if (sleeves === 2) {
        parts.push({ bone: `foreArm${s}`, geo: sphere(d.foreR * 1.02 + o * 1.15), zone: Z.arms });
        parts.push({
          bone: `foreArm${s}`,
          geo: cyl(d.foreR + o * 1.15, d.foreR + o * 1.2, d.foreArm - 0.03, false),
          at: [0, -(d.foreArm - 0.03) / 2, 0],
          zone: Z.arms,
        });
      }
    }
    if (id === 'hoodie') {
      parts.push({
        bone: 'neck',
        geo: torus(0.075, 0.03),
        at: [0, 0.02, -0.035],
        rot: [Math.PI / 2 - 0.4, 0, 0],
        scale: [1.1, 1, 1],
        zone: Z.head,
      });
    }
    if (id === 'rain_shell') {
      parts.push({
        bone: 'head',
        geo: cap(d.headR * 1.18, Math.PI * 0.62),
        at: [0, 0.1, -0.008],
        scale: [1, 1.12, 1.05],
        zone: Z.head,
      });
    }
    if (id === 'winter_coat') {
      parts.push({
        bone: 'neck',
        geo: cyl(0.07, 0.09, 0.07, true),
        at: [0, 0.01, 0],
        zone: Z.head,
      });
    }
  }
  const legs = LEGS[id];
  if (legs) {
    parts.push({
      bone: 'hips',
      geo: sphere(d.torsoR * 1.02 + o),
      at: [0, -0.03, 0],
      scale: [d.torsoW * 0.98, 0.88, d.torsoD * 1.05],
      zone: Z.legs,
    });
    for (const s of ['L', 'R'] as const) {
      const tl = legs === 'short' ? d.thigh * 0.45 : d.thigh;
      parts.push({
        bone: `thigh${s}`,
        geo: cyl(
          d.thighR + o * 1.2,
          d.thighR * (legs === 'short' ? 0.95 : 0.8) + o * 1.2,
          tl,
          legs === 'short',
        ),
        at: [0, -tl / 2, 0],
        zone: Z.legs,
      });
      if (legs === 'long') {
        parts.push({ bone: `shin${s}`, geo: sphere(d.shinR * 1.25 + o), zone: Z.legs });
        const sl = d.shin - 0.035;
        parts.push({
          bone: `shin${s}`,
          geo: cyl(
            d.shinR + o * 1.25,
            d.shinR * (id === 'jeans' || id === 'snow_pants' ? 1.12 : 0.92) + o * 1.25,
            sl,
            false,
          ),
          at: [0, -sl / 2, 0],
          zone: Z.legs,
        });
      }
    }
  }
  switch (id) {
    case 'toque':
      parts.push(
        {
          bone: 'head',
          geo: cap(d.headR * 1.06, Math.PI * 0.42),
          at: [0, 0.112, -0.004],
          scale: [1, 1.08, 1.04],
          zone: Z.head,
        },
        {
          bone: 'head',
          geo: torus(d.headR * 0.98, 0.016),
          at: [0, 0.14, -0.004],
          rot: [Math.PI / 2, 0, 0],
          scale: [1, 1.04, 1],
          zone: Z.head,
        },
        { bone: 'head', geo: sphere(0.03, 10, 8), at: [0, 0.245, -0.01], zone: Z.head },
      );
      break;
    case 'scarf':
      parts.push(
        {
          bone: 'neck',
          geo: torus(0.058, 0.024),
          at: [0, 0.035, 0.005],
          rot: [Math.PI / 2, 0, 0],
          scale: [1.05, 1.15, 1],
          zone: Z.head,
        },
        { bone: 'scarfTail', geo: box(0.055, 0.2, 0.016), at: [0, -0.1, 0], zone: Z.torso },
      );
      break;
    case 'gloves':
      for (const s of ['L', 'R'] as const) {
        parts.push(
          {
            bone: `hand${s}`,
            geo: sphere(0.048),
            at: [0, -0.055, 0.004],
            scale: [0.88, 1.5, 0.68],
            zone: Z.hands,
          },
          {
            bone: `foreArm${s}`,
            geo: cyl(d.foreR + 0.012, d.foreR + 0.014, 0.05, true),
            at: [0, -d.foreArm + 0.015, 0],
            zone: Z.hands,
          },
        );
      }
      break;
    case 'socks':
    case 'wool_socks':
      for (const s of ['L', 'R'] as const) {
        const h = id === 'wool_socks' ? 0.14 : 0.08;
        parts.push(
          {
            bone: `shin${s}`,
            geo: cyl(d.shinR * 0.93 + 0.006, d.shinR * 0.9 + 0.006, h),
            at: [0, -d.shin + h / 2, 0],
            zone: Z.feet,
          },
          {
            bone: `foot${s}`,
            geo: capsule(0.043, 0.13),
            at: [0, -0.012, 0.05],
            rot: [Math.PI / 2, 0, 0],
            scale: [1.15, 1, 0.82],
            zone: Z.feet,
          },
        );
      }
      break;
    case 'sneakers':
      for (const s of ['L', 'R'] as const) {
        parts.push(
          {
            bone: `foot${s}`,
            geo: capsule(0.05, 0.15),
            at: [0, -0.012, 0.055],
            rot: [Math.PI / 2, 0, 0],
            scale: [1.12, 1, 0.78],
            zone: Z.feet,
          },
          { bone: `foot${s}`, geo: box(0.1, 0.018, 0.27), at: [0, -0.045, 0.055], zone: Z.feet },
        );
      }
      break;
    case 'winter_boots':
      for (const s of ['L', 'R'] as const) {
        parts.push(
          {
            bone: `foot${s}`,
            geo: capsule(0.058, 0.16),
            at: [0, -0.008, 0.055],
            rot: [Math.PI / 2, 0, 0],
            scale: [1.12, 1, 0.85],
            zone: Z.feet,
          },
          {
            bone: `shin${s}`,
            geo: cyl(d.shinR + 0.026, d.shinR + 0.03, 0.17),
            at: [0, -d.shin + 0.085, 0],
            zone: Z.feet,
          },
          { bone: `foot${s}`, geo: box(0.11, 0.024, 0.29), at: [0, -0.052, 0.055], zone: Z.feet },
        );
      }
      break;
  }
  return parts;
}

/** Hair parts per style. Long/ponytail strands bind to `hairSway` for wind. Hidden pieces under hats. */
export function hairParts(r: Rig, style: HairStyle, hatted: boolean): Part[] {
  const h = r.dims.headR;
  const parts: Part[] = [];
  const skull = (t: number) => ({
    bone: 'hair' as const,
    geo: cap(h * t, Math.PI * 0.5),
    at: [0, -0.005, -0.006] as [number, number, number],
    scale: [1.0, 1.15, 1.06] as [number, number, number],
  });
  switch (style) {
    case 'bald':
      break;
    case 'buzz':
      if (!hatted) parts.push(skull(1.03));
      break;
    case 'short':
      if (!hatted)
        parts.push(skull(1.08), {
          bone: 'hair',
          geo: sphere(h * 0.55, 12, 8),
          at: [0.0, 0.02, 0.05],
          scale: [1.4, 0.45, 0.9],
        });
      break;
    case 'curly':
      if (!hatted) {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          parts.push({
            bone: 'hair',
            geo: sphere(h * 0.42, 10, 8),
            at: [
              Math.cos(a) * h * 0.75,
              0.04 + 0.03 * Math.sin(a * 2),
              Math.sin(a) * h * 0.65 - 0.02,
            ],
          });
        }
        parts.push({ bone: 'hair', geo: sphere(h * 0.6, 12, 8), at: [0, 0.07, -0.01] });
      }
      break;
    case 'bob':
      if (!hatted) parts.push(skull(1.1));
      parts.push({
        bone: 'hair',
        geo: cyl(h * 1.12, h * 1.2, 0.13, true, 20),
        at: [0, -0.06, -0.012],
        scale: [1, 1, 1.05],
      });
      break;
    case 'long':
      if (!hatted) parts.push(skull(1.09));
      parts.push(
        { bone: 'hair', geo: cyl(h * 1.1, h * 1.12, 0.1, true, 20), at: [0, -0.04, -0.01] },
        { bone: 'hairSway', geo: box(h * 1.9, 0.24, 0.035), at: [0, -0.2, -0.03] },
      );
      break;
    case 'bun':
      if (!hatted)
        parts.push(skull(1.07), { bone: 'hair', geo: sphere(0.045, 12, 10), at: [0, 0.06, -0.1] });
      break;
    case 'ponytail':
      if (!hatted) parts.push(skull(1.07));
      parts.push(
        { bone: 'hairSway', geo: sphere(0.028, 10, 8), at: [0, 0.0, -0.05] },
        { bone: 'hairSway', geo: capsule(0.025, 0.16), at: [0, -0.1, -0.06] },
      );
      break;
  }
  return parts;
}
