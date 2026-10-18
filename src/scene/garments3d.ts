import { CylinderGeometry } from 'three';
import type { HairStyle } from '../state/avatarStore';
import { cap, capsule, sphere, type Part, type Rig } from './rig';

/** Open-fronted hair curtain (back and sides only), so it frames the face instead of covering it. */
function sideCurtain(rTop: number, rBottom: number, height: number) {
  return new CylinderGeometry(rTop, rBottom, height, 40, 4, true, Math.PI * 0.3, Math.PI * 1.4);
}

/** Hair parts per style. Long/ponytail strands bind to `hairSway` for wind. Hidden pieces under hats. */
export function hairParts(r: Rig, style: HairStyle, hatted: boolean): Part[] {
  const h = r.dims.headR;
  const parts: Part[] = [];
  // Sculpted hair shell: tilted back so the hairline sits above the brows at the front,
  // covering the back and sides of the skull down towards the ears.
  const skull = (t: number): Part => ({
    bone: 'hair',
    geo: cap(h * t, Math.PI * 0.66, 48),
    at: [0, 0.015, -0.012],
    rot: [-1.0, 0, 0],
    scale: [0.93, 1.1, 1.05],
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
          geo: sphere(h * 0.55, 24, 16),
          at: [0.012, 0.085, 0.045],
          rot: [-0.35, 0, -0.12],
          scale: [1.45, 0.42, 0.95],
        });
      break;
    case 'curly':
      if (!hatted) {
        // Ring of curls framing the skull: higher at the front (forehead), lower at the back.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const front = Math.max(0, Math.cos(a)); // a = 0 → front
          parts.push({
            bone: 'hair',
            geo: sphere(h * 0.36, 16, 12),
            at: [
              Math.sin(a) * h * 0.82,
              0.02 + 0.085 * front ** 2 + 0.015 * Math.sin(a * 3),
              Math.cos(a) * h * 0.68 - 0.025,
            ],
          });
        }
        parts.push(skull(1.12), {
          bone: 'hair',
          geo: sphere(h * 0.62, 24, 16),
          at: [0, 0.075, -0.012],
        });
      }
      break;
    case 'bob':
      if (!hatted) parts.push(skull(1.1));
      parts.push({
        bone: 'hair',
        geo: sideCurtain(h * 1.1, h * 1.2, 0.13),
        at: [0, -0.055, -0.012],
        scale: [0.95, 1, 1.05],
      });
      break;
    case 'long':
      if (!hatted) parts.push(skull(1.09));
      parts.push(
        {
          bone: 'hair',
          geo: sideCurtain(h * 1.08, h * 1.14, 0.12),
          at: [0, -0.05, -0.012],
          scale: [0.95, 1, 1.05],
        },
        {
          bone: 'hairSway',
          geo: capsule(0.07, 0.17, 12),
          at: [0, -0.2, -0.045],
          scale: [1.35, 1, 0.35],
        },
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
