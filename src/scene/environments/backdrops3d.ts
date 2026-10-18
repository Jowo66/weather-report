import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Backdrop } from '../../data/backdrops';

/**
 * Low-poly backdrops built in code (TDD §8.6; self-made, no assets). Each backdrop merges its
 * pieces into a handful of meshes (vertex-coloured) so it costs only a few draw calls.
 */
type Piece = {
  geo: BufferGeometry;
  at: [number, number, number];
  rot?: [number, number, number];
  color: string;
};

function colored(p: Piece): BufferGeometry {
  const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
  p.geo.dispose();
  if (p.rot) {
    g.rotateX(p.rot[0]);
    g.rotateY(p.rot[1]);
    g.rotateZ(p.rot[2]);
  }
  g.translate(...p.at);
  const c = new Color(p.color);
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

function merged(pieces: Piece[], mat: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const geo = mergeGeometries(pieces.map(colored), false)!;
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

// Deterministic pseudo-random for layout.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface BackdropScene {
  group: Group;
  ground: string;
  /** Lit windows / lamps; toggled for night. */
  setNight: (night: boolean) => void;
  dispose: () => void;
}

export function buildBackdrop(kind: Backdrop): BackdropScene {
  const group = new Group();
  const solid = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    flatShading: true,
  });
  const glow = new MeshBasicMaterial({ vertexColors: true });
  const r = rng(kind === 'city' ? 7 : kind === 'arctic' ? 11 : 13);
  const solids: Piece[] = [];
  const lights: Piece[] = [];
  let ground = '#8f978a';

  if (kind === 'city') {
    ground = '#7d8288';
    solids.push({ geo: new BoxGeometry(30, 0.02, 3.2), at: [0, 0.005, -1.4], color: '#5a5f66' }); // street
    solids.push({ geo: new BoxGeometry(30, 0.12, 2), at: [0, 0.06, -4], color: '#a3a7ab' }); // far sidewalk
    const palette = ['#c9b79c', '#9db0c2', '#b98f7a', '#d8d2c4', '#8e9aa6', '#c7a27c', '#a8b49c'];
    for (let i = 0; i < 9; i++) {
      const w = 2.6 + r() * 1.6;
      const h = 4 + r() * 8;
      const x = -14 + i * 3.5 + r() * 0.6;
      const z = -13 - r() * 2.5;
      solids.push({
        geo: new BoxGeometry(w, h, 1.6),
        at: [x, h / 2, z],
        color: palette[i % palette.length]!,
      });
      for (let fy = 0.8; fy < h - 0.4; fy += 0.75) {
        for (let fx = -w / 2 + 0.35; fx < w / 2 - 0.2; fx += 0.5) {
          lights.push({
            geo: new BoxGeometry(0.26, 0.36, 0.02),
            at: [x + fx, fy, z + 0.81],
            color: r() > 0.4 ? '#ffd98a' : '#3b4a5a',
          });
        }
      }
    }
    for (const x of [-2.6, 2.8]) {
      solids.push({
        geo: new CylinderGeometry(0.04, 0.05, 3, 8),
        at: [x, 1.5, -2.9],
        color: '#3a3d42',
      });
      lights.push({ geo: new SphereGeometry(0.14, 10, 8), at: [x, 3.05, -2.9], color: '#fff1c4' });
    }
    solids.push({
      geo: new CylinderGeometry(0.08, 0.1, 1.4, 8),
      at: [-4.2, 0.7, -3.4],
      color: '#5b4636',
    });
    solids.push({ geo: new SphereGeometry(0.8, 10, 8), at: [-4.2, 1.9, -3.4], color: '#4f7a45' });
  } else if (kind === 'arctic') {
    ground = '#eef3f7';
    for (let i = 0; i < 7; i++) {
      const s = 2 + r() * 3;
      solids.push({
        geo: new ConeGeometry(s, s * 0.6, 7),
        at: [-12 + i * 4 + r() * 2, s * 0.25, -11 - r() * 4],
        color: i % 2 ? '#dfe9f1' : '#cfdeea',
      });
    }
    for (let i = 0; i < 6; i++) {
      const x = (i < 3 ? -1 : 1) * (2.3 + r() * 3.5);
      const z = -2.5 - r() * 4;
      const h = 1.6 + r() * 1.4;
      solids.push({
        geo: new CylinderGeometry(0.07, 0.09, 0.5, 6),
        at: [x, 0.25, z],
        color: '#4a3a2c',
      });
      for (let k = 0; k < 3; k++) {
        const rad = (0.75 - k * 0.2) * (h / 2.2);
        solids.push({
          geo: new ConeGeometry(rad, h * 0.42, 8),
          at: [x, 0.5 + k * h * 0.26 + h * 0.2, z],
          color: '#2f5a43',
        });
        solids.push({
          geo: new ConeGeometry(rad * 0.75, h * 0.16, 8),
          at: [x, 0.5 + k * h * 0.26 + h * 0.36, z],
          color: '#f4f8fb',
        });
      }
    }
  } else {
    ground = '#e8d3a6';
    solids.push({
      geo: new PlaneGeometry(60, 30),
      at: [0, 0.01, -18],
      rot: [-Math.PI / 2, 0, 0],
      color: '#3a8cc4',
    });
    solids.push({
      geo: new PlaneGeometry(60, 1.2),
      at: [0, 0.015, -3.3],
      rot: [-Math.PI / 2, 0, 0],
      color: '#d9c393',
    });
    // palm
    for (let k = 0; k < 6; k++) {
      solids.push({
        geo: new CylinderGeometry(0.09 - k * 0.008, 0.11 - k * 0.008, 0.62, 7),
        at: [-2.8 + k * 0.07, 0.31 + k * 0.6, -2.6],
        rot: [0, 0, -0.1],
        color: '#8b6b45',
      });
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      solids.push({
        geo: new BoxGeometry(1.3, 0.04, 0.32),
        at: [-2.4 + Math.cos(a) * 0.62, 3.55 - 0.18, -2.6 + Math.sin(a) * 0.62],
        rot: [0, -a, -0.35],
        color: '#3f8f45',
      });
    }
    // umbrella + lounger
    solids.push({
      geo: new CylinderGeometry(0.025, 0.025, 2, 6),
      at: [2.6, 1, -2.4],
      color: '#dddddd',
    });
    solids.push({ geo: new ConeGeometry(1.0, 0.35, 12), at: [2.6, 2.05, -2.4], color: '#e05a47' });
    solids.push({ geo: new BoxGeometry(0.6, 0.1, 1.6), at: [2.3, 0.28, -2.2], color: '#f2efe6' });
  }

  const s = merged(solids, solid);
  group.add(s);
  let glowMesh: Mesh | null = null;
  if (lights.length) {
    glowMesh = merged(lights, glow);
    group.add(glowMesh);
  }
  const baseCol = glowMesh
    ? (glowMesh.geometry.attributes.color!.array as Float32Array).slice()
    : null;
  return {
    group,
    ground,
    setNight(night) {
      if (!glowMesh || !baseCol) return;
      const col = glowMesh.geometry.attributes.color!;
      const arr = col.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const lit = baseCol[i]! > 0.6;
        // Day: windows read as dark glass; night: lit ones glow.
        const f = night ? (lit ? 1 : 0.35) : 0.45;
        arr[i] = baseCol[i]! * f;
        arr[i + 1] = baseCol[i + 1]! * f;
        arr[i + 2] = baseCol[i + 2]! * (night ? f : 0.6);
      }
      col.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      solid.dispose();
      glow.dispose();
    },
  };
}
