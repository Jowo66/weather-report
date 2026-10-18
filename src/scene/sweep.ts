import { BufferAttribute, BufferGeometry } from 'three';
import { BONES, type BoneName } from './rig';

/**
 * A horizontal cross-section ring in rest pose (model space, unscaled, Y up, facing +Z).
 * Rings are swept into a smooth tube with blended skin weights, so joints bend smoothly
 * instead of showing separate segments.
 */
export interface Ring {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** Superellipse exponent: 2 = ellipse, higher = boxier. */
  p: number;
  /** Bone influences (normalised on output). */
  w: Partial<Record<BoneName, number>>;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixWeights(a: Ring['w'], b: Ring['w'], t: number): Ring['w'] {
  const out: Ring['w'] = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<BoneName>) {
    out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
  }
  return out;
}

export function lerpRing(a: Ring, b: Ring, t: number): Ring {
  return {
    y: lerp(a.y, b.y, t),
    cx: lerp(a.cx, b.cx, t),
    cz: lerp(a.cz, b.cz, t),
    rx: lerp(a.rx, b.rx, t),
    rz: lerp(a.rz, b.rz, t),
    p: lerp(a.p, b.p, t),
    w: mixWeights(a.w, b.w, t),
  };
}

/** Catmull-Rom smoothing of the numeric profile (weights interpolate linearly). */
export function densify(keys: readonly Ring[], perSpan = 4): Ring[] {
  const out: Ring[] = [];
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)]!;
    const k1 = keys[i]!;
    const k2 = keys[i + 1]!;
    const k3 = keys[Math.min(keys.length - 1, i + 2)]!;
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const f = (k: keyof Pick<Ring, 'y' | 'cx' | 'cz' | 'rx' | 'rz' | 'p'>) =>
        cr(k0[k], k1[k], k2[k], k3[k], t);
      out.push({
        y: f('y'),
        cx: f('cx'),
        cz: f('cz'),
        rx: Math.max(0.001, f('rx')),
        rz: Math.max(0.001, f('rz')),
        p: f('p'),
        w: mixWeights(k1.w, k2.w, t),
      });
    }
  }
  out.push({ ...keys[keys.length - 1]! });
  return out;
}

/** Keep the part of a ring stack between two heights (interpolating the cut rings). */
export function slice(rings: readonly Ring[], yTop: number, yBottom: number): Ring[] {
  const desc = rings[0]!.y > rings[rings.length - 1]!.y;
  const r = desc ? rings : [...rings].reverse(); // top → bottom
  const out: Ring[] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i]!;
    const b = r[i + 1]!;
    const inA = a.y <= yTop && a.y >= yBottom;
    if (inA) out.push(a);
    for (const cut of [yTop, yBottom]) {
      if ((a.y - cut) * (b.y - cut) < 0) out.push(lerpRing(a, b, (a.y - cut) / (a.y - b.y)));
    }
  }
  const last = r[r.length - 1]!;
  if (last.y <= yTop && last.y >= yBottom) out.push(last);
  out.sort((p, q) => q.y - p.y);
  return out;
}

/** Grow every ring outward by `o` (garment layers), optionally scaling. */
export function inflate(rings: readonly Ring[], o: number, k = 1): Ring[] {
  return rings.map((r) => ({ ...r, rx: r.rx * k + o, rz: r.rz * k + o }));
}

export interface SweepOpts {
  radial?: number;
  capTop?: boolean;
  capBottom?: boolean;
  /** Cap depth as a fraction of the end radius (1 = hemisphere). */
  capDepth?: number;
  zone?: number | ((ring: Ring, index: number) => number);
  color?: [number, number, number];
}

function capRings(end: Ring, dir: 1 | -1, n = 5, depthScale = 1): Ring[] {
  const out: Ring[] = [];
  const depth = Math.min(end.rx, end.rz) * depthScale;
  for (let i = 1; i <= n; i++) {
    const th = (i / (n + 0.0001)) * (Math.PI / 2);
    const c = Math.cos(th);
    out.push({ ...end, y: end.y + dir * Math.sin(th) * depth, rx: end.rx * c, rz: end.rz * c });
  }
  return out;
}

/** Sweep rings (top → bottom or bottom → top) into an indexed, skinned tube geometry. */
export function sweep(input: readonly Ring[], opts: SweepOpts = {}): BufferGeometry {
  const radial = opts.radial ?? 40;
  let rings = [...input];
  if (opts.capTop) {
    const top = rings[0]!.y >= rings[rings.length - 1]!.y ? 0 : rings.length - 1;
    const caps = capRings(
      rings[top]!,
      rings[0]!.y >= rings[rings.length - 1]!.y ? 1 : -1,
      5,
      opts.capDepth ?? 1,
    );
    rings = top === 0 ? [...caps.reverse(), ...rings] : [...rings, ...caps];
  }
  if (opts.capBottom) {
    const descending = rings[0]!.y >= rings[rings.length - 1]!.y;
    const end = descending ? rings.length - 1 : 0;
    const caps = capRings(rings[end]!, descending ? -1 : 1);
    rings = end === 0 ? [...caps.reverse(), ...rings] : [...rings, ...caps];
  }
  const nV = rings.length * radial;
  const pos = new Float32Array(nV * 3);
  const uv = new Float32Array(nV * 2);
  const si = new Uint16Array(nV * 4);
  const sw = new Float32Array(nV * 4);
  const zone = new Float32Array(nV);
  const col = new Float32Array(nV * 3);
  const c = opts.color ?? [1, 1, 1];
  rings.forEach((r, j) => {
    const ws = (Object.entries(r.w) as [BoneName, number][])
      .filter(([, v]) => v > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = ws.reduce((s, [, v]) => s + v, 0) || 1;
    const z = typeof opts.zone === 'function' ? opts.zone(r, j) : (opts.zone ?? 0);
    const e = 2 / Math.max(1.2, r.p);
    for (let i = 0; i < radial; i++) {
      const t = (i / radial) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const k = j * radial + i;
      pos[k * 3] = r.cx + r.rx * Math.sign(st) * Math.abs(st) ** e;
      pos[k * 3 + 1] = r.y;
      pos[k * 3 + 2] = r.cz + r.rz * Math.sign(ct) * Math.abs(ct) ** e;
      uv[k * 2] = i / radial;
      uv[k * 2 + 1] = j / (rings.length - 1);
      ws.forEach(([b, v], m) => {
        si[k * 4 + m] = BONES.indexOf(b);
        sw[k * 4 + m] = v / total;
      });
      zone[k] = z;
      col.set(c, k * 3);
    }
  });
  const idx: number[] = [];
  const desc = rings[0]!.y >= rings[rings.length - 1]!.y;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * radial + i;
      const b = j * radial + ((i + 1) % radial);
      const c2 = (j + 1) * radial + i;
      const d = (j + 1) * radial + ((i + 1) % radial);
      // Winding so normals face outward for top→bottom stacks.
      if (desc) idx.push(a, c2, b, b, c2, d);
      else idx.push(a, b, c2, b, d, c2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  g.setAttribute('zone', new BufferAttribute(zone, 1));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
