import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { GARMENT_BY_ID } from '../data/garments';
import {
  ZONE_IDS,
  type ComfortState,
  type Flag,
  type GarmentId,
  type ZoneId,
  type ZoneState,
} from '../engine';
import type { AvatarAppearance } from '../state/avatarStore';
import { composePose, JOINTS } from './animation/clips';
import {
  initialAnimState,
  nextAnimState,
  type AnimEvent,
  type AnimInputs,
  type AnimState,
} from './animation/stateMachine';
import { garmentParts, hairParts } from './garments3d';
import {
  applySkinResponse,
  createHairMaterial,
  createSkinMaterial,
  type SkinUniforms,
} from './materials/skinMaterial';
import { skinResponse } from './materials/skinResponse';
import { WeatherParticles } from './particles/weatherParticles';
import {
  bake,
  bodyParts,
  buildRig,
  capsule,
  cap,
  dimsFor,
  faceParts,
  type Part,
  type Rig,
} from './rig';
import { skinHex } from './skinTone';

export interface SceneWeather {
  tAir: number;
  windKmh: number;
  gustKmh: number;
  precipMmH: number;
  snowfallCmH: number;
  snowDepthM: number;
  isDay: boolean;
  sunAltDeg: number;
  sunAzDeg: number;
  ghi: number;
  cloudCover: number;
}

export interface AvatarSceneProps {
  appearance: AvatarAppearance;
  worn: readonly GarmentId[];
  perceived: number;
  state: ComfortState;
  flags: readonly Flag[];
  zones: Record<ZoneId, ZoneState>;
  wetness: Record<ZoneId, number>;
  weather: SceneWeather | null;
  shade: boolean;
  umbrella: boolean;
  reducedMotion: boolean;
}

const lum = (hex: string) => {
  const c = new Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
};

function greyHair(hex: string, senior: boolean) {
  if (!senior) return hex;
  return `#${new Color(hex).lerp(new Color('#c9c9c9'), 0.7).getHexString()}`;
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export class AvatarScene {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.1, 50);
  private hemi = new HemisphereLight('#dfe9f5', '#5b5346', 1.4);
  private sun = new DirectionalLight('#fff4e0', 2.2);
  private ground: Mesh;
  private rig!: Rig;
  private body!: SkinnedMesh;
  private face!: SkinnedMesh;
  private hair!: SkinnedMesh;
  private hairFrost!: { value: number };
  private skin!: SkinUniforms;
  private garments = new Map<GarmentId, SkinnedMesh>();
  private props: SkinnedMesh | null = null;
  private particles: WeatherParticles;
  private anim: AnimState;
  private propsCur: AvatarSceneProps | null = null;
  private events: AnimEvent[] = [];
  private raf = 0;
  private last = 0;
  private clock = 0;
  private gusted = false;
  private disposed = false;
  private resizeObs: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    opts: { mobile: boolean },
  ) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.88, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -1.5;
    this.sun.shadow.camera.right = 1.5;
    this.sun.shadow.camera.top = 2.2;
    this.sun.shadow.camera.bottom = -0.5;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.ground = new Mesh(
      new CircleGeometry(2.4, 48),
      new MeshStandardMaterial({ color: '#8a8f86', roughness: 0.95 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.particles = new WeatherParticles(this.scene, opts.mobile);
    this.anim = initialAnimState({ perceived: 22, flags: [] });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (!document.hidden) this.kick();
  };

  private resize() {
    const w = this.container.clientWidth || 300;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole body in frame on narrow canvases.
    const fit = Math.max(1, 0.56 / this.camera.aspect);
    this.camera.position.set(0, 0.98, 3.75 * fit);
    this.camera.lookAt(0, 0.88, 0);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  // ---------------------------------------------------------------- building
  private disposeMesh(m: SkinnedMesh | null) {
    if (!m) return;
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as Material).dispose();
  }

  private skinned(parts: Part[], material: Material): SkinnedMesh {
    const geo = bake(this.rig, parts);
    const m = new SkinnedMesh(geo, material);
    m.bind(this.rig.skeleton);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private buildAvatar(a: AvatarAppearance) {
    for (const m of [this.body, this.face, this.hair]) this.disposeMesh(m ?? null);
    for (const m of this.garments.values()) this.disposeMesh(m);
    this.garments.clear();
    this.disposeMesh(this.props);
    this.props = null;
    if (this.rig) this.scene.remove(this.rig.root);

    this.rig = buildRig(dimsFor(a));
    this.scene.add(this.rig.root);
    const skin = createSkinMaterial(skinHex(a.melanin, a.undertone));
    skin.material.roughness = this.rig.dims.senior ? 0.68 : 0.55;
    this.skin = skin.uniforms;
    this.body = this.skinned(bodyParts(this.rig), skin.material);
    this.face = this.skinned(
      faceParts([0, 0, 0]),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }),
    );
    this.face.castShadow = false;
  }

  private buildHair(a: AvatarAppearance, worn: readonly GarmentId[]) {
    this.disposeMesh(this.hair ?? null);
    const hatted = worn.includes('toque') || worn.includes('rain_shell');
    const hex = greyHair(a.hairColor, a.ageLook === 'senior');
    const parts = hairParts(this.rig, a.hairStyle, hatted);
    // Brows live in the hair mesh so frost applies to them too.
    const browColor = new Color(lum(hex) > 0.6 ? '#8a7a6a' : hex);
    for (const s of ['L', 'R'] as const) {
      parts.push({
        bone: `brow${s}`,
        geo: capsule(0.0045, 0.026, 6),
        rot: [0, 0, Math.PI / 2],
        color: [browColor.r, browColor.g, browColor.b],
      });
    }
    const { material, frost } = createHairMaterial('#ffffff');
    material.vertexColors = true;
    const c = new Color(hex);
    for (const p of parts) p.color ??= [c.r, c.g, c.b];
    this.hairFrost = frost;
    this.hair = this.skinned(parts, material);
  }

  private syncGarments(worn: readonly GarmentId[]) {
    for (const [id, m] of this.garments) {
      if (!worn.includes(id)) {
        this.disposeMesh(m);
        this.garments.delete(id);
      }
    }
    for (const id of worn) {
      if (this.garments.has(id)) continue;
      const def = GARMENT_BY_ID[id];
      const mat = new MeshStandardMaterial({
        color: new Color(def.tint.default),
        roughness: id === 'rain_shell' ? 0.45 : 0.88,
      });
      mat.userData.base = new Color(def.tint.default);
      this.garments.set(id, this.skinned(garmentParts(this.rig, id), mat));
    }
  }

  private syncProps(umbrella: boolean) {
    if (umbrella && !this.props) {
      const parts: Part[] = [
        {
          bone: 'handR',
          geo: capsule(0.008, 0.95, 6),
          at: [0, 0.4, 0.02],
          color: [0.2, 0.2, 0.22],
        },
        {
          bone: 'handR',
          geo: cap(0.55, Math.PI * 0.32, 24),
          at: [0, 0.78, 0.02],
          scale: [1, 0.55, 1],
          color: [0.12, 0.3, 0.55],
        },
      ];
      this.props = this.skinned(
        parts,
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: 2 }),
      );
    } else if (!umbrella && this.props) {
      this.disposeMesh(this.props);
      this.props = null;
    }
  }

  // ---------------------------------------------------------------- updates
  update(p: AvatarSceneProps) {
    const prev = this.propsCur;
    this.propsCur = p;
    const appearanceChanged =
      !prev || JSON.stringify(prev.appearance) !== JSON.stringify(p.appearance);
    if (appearanceChanged) {
      this.buildAvatar(p.appearance);
      this.garments.clear();
    }
    if (appearanceChanged || !prev || !sameSet(prev.worn, p.worn)) {
      if (prev && !appearanceChanged) {
        if (p.worn.some((g) => !prev.worn.includes(g))) this.events.push('garment_added');
        if (prev.worn.some((g) => !p.worn.includes(g))) this.events.push('garment_removed');
      }
      this.syncGarments(p.worn);
      this.buildHair(p.appearance, p.worn);
    }
    if (appearanceChanged || !prev || prev.umbrella !== p.umbrella) {
      if (appearanceChanged) this.props = null;
      this.syncProps(p.umbrella);
    }
    if (prev?.weather && p.weather) {
      if (prev.weather.precipMmH < 0.2 && p.weather.precipMmH >= 0.2)
        this.events.push('rain_start');
    }
    if (p.weather && p.weather.gustKmh > 40 && !this.gusted) {
      this.gusted = true;
      this.events.push('gust');
    }
    if (!prev) this.anim = initialAnimState({ perceived: p.perceived, flags: p.flags });

    // Body hiding (TDD §8.2.3): a zone is hidden when a worn garment declares it and covers ≥ 0.8.
    const hidden = new Set<string>();
    for (const id of p.worn) {
      const g = GARMENT_BY_ID[id];
      for (const z of g.mesh.hidesBody) if ((g.coverage[z] ?? 0) >= 0.8) hidden.add(z);
    }
    applySkinResponse(
      this.skin,
      skinResponse(p.zones, this.anim.state),
      hidden,
      p.appearance.melanin,
    );

    // Wet fabric: darken ×0.75 and lower roughness (TDD §8.5).
    for (const [id, m] of this.garments) {
      const g = GARMENT_BY_ID[id];
      const wet = Math.max(
        0,
        ...ZONE_IDS.filter((z) => (g.coverage[z] ?? 0) > 0).map((z) => p.wetness[z]),
      );
      const mat = m.material as MeshStandardMaterial;
      mat.color.copy(mat.userData.base as Color).multiplyScalar(1 - 0.25 * Math.min(1, wet));
      mat.roughness = (id === 'rain_shell' ? 0.45 : 0.88) - 0.35 * Math.min(1, wet);
    }
    this.applyEnvironment(p);
    this.particles.setVisible(!p.reducedMotion);
    this.kick();
  }

  private applyEnvironment(p: AvatarSceneProps) {
    const w = p.weather;
    const day = w ? w.isDay : true;
    const sky = !w
      ? '#cfdde8'
      : !day
        ? '#1b2333'
        : w.precipMmH > 0.2
          ? '#9aa6b0'
          : w.cloudCover > 70
            ? '#b8c4cc'
            : '#a9cdee';
    this.scene.background = new Color(sky);
    const snowy = !!w && w.snowDepthM > 0.01;
    (this.ground.material as MeshStandardMaterial).color.set(
      snowy ? '#eef3f7' : day ? '#8f978a' : '#3a3f45',
    );
    this.hemi.intensity = day ? 1.3 : 0.45;
    this.hemi.color.set(day ? '#e3edf7' : '#8fa2c4');
    const alt = w ? Math.max(5, w.sunAltDeg) : 45;
    const az = w ? w.sunAzDeg : 200;
    const r = 6;
    const a = (alt * Math.PI) / 180;
    const z = ((az - 180) * Math.PI) / 180;
    // The camera looks north-ish; put the sun in front-left/right so the face is lit.
    this.sun.position.set(
      Math.sin(z) * r * Math.cos(a),
      Math.sin(a) * r,
      Math.abs(Math.cos(z)) * r * Math.cos(a) + 1,
    );
    this.sun.intensity =
      !day || (w && w.sunAltDeg <= 0)
        ? 0.25
        : p.shade
          ? 0.5
          : 0.6 + Math.min(2.4, (w?.ghi ?? 600) / 300);
    this.sun.color.set(day ? '#fff2dc' : '#b8c8ff');
  }

  // ---------------------------------------------------------------- loop
  invalidate() {
    this.kick();
  }

  private kick() {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.propsCur) return;
    const p = this.propsCur;
    const dtMs = Math.min(100, now - this.last);
    this.last = now;
    this.clock += dtMs / 1000;
    const w = p.weather;
    const inputs: AnimInputs = {
      perceived: p.perceived,
      flags: p.flags,
      zones: p.zones,
      glare: !!w && w.isDay && w.ghi > 600 && !p.shade && !p.umbrella,
      wind: w ? Math.min(12, (0.67 * w.windKmh) / 3.6) / 12 : 0,
      events: this.events,
      reducedMotion: p.reducedMotion,
    };
    this.events = [];
    const prevState = this.anim.state;
    this.anim = nextAnimState(this.anim, inputs, dtMs);
    if (this.anim.state !== prevState) {
      applySkinResponse(
        this.skin,
        skinResponse(p.zones, this.anim.state),
        this.hiddenZones(p),
        p.appearance.melanin,
      );
      this.container.dispatchEvent(
        new CustomEvent('wr-anim-state', { detail: this.anim.state, bubbles: true }),
      );
    }
    this.applyPose(p, inputs.wind);
    if (!p.reducedMotion) this.updateParticles(p, dtMs / 1000);
    this.renderer.render(this.scene, this.camera);
    // Demand loop: keep going while anything moves; in reduced motion stop once settled.
    if (!document.hidden && (!p.reducedMotion || this.anim.pending || this.anim.fade.t < 1)) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private hiddenZones(p: AvatarSceneProps) {
    const hidden = new Set<string>();
    for (const id of p.worn) {
      const g = GARMENT_BY_ID[id];
      for (const z of g.mesh.hidesBody) if ((g.coverage[z] ?? 0) >= 0.8) hidden.add(z);
    }
    return hidden;
  }

  private applyPose(p: AvatarSceneProps, wind: number) {
    const pose = composePose(this.anim, this.clock, p.reducedMotion);
    const b = this.rig.bones;
    for (const j of JOINTS) {
      const r = pose.rot[j];
      if (r) b[j].rotation.set(r[0], r[1], r[2]);
      else b[j].rotation.set(0, 0, 0);
    }
    if (p.appearance.ageLook === 'senior') b.spine.rotation.x += 0.06;
    b.hips.position.y = this.rig.dims.hipsY + pose.hipsY;
    b.torsoShell.scale.set(1 + pose.breath, 1 + pose.breath * 0.5, 1 + pose.breath);
    b.eyeL.scale.y = b.eyeR.scale.y = Math.max(0.15, 1 - 0.75 * pose.face.squint);
    b.mouth.scale.set(1 + 0.35 * Math.max(0, pose.face.smile), 0.6 + 2.2 * pose.face.mouthOpen, 1);
    b.browL.rotation.z = -0.25 * Math.min(0, pose.face.smile);
    b.browR.rotation.z = 0.25 * Math.min(0, pose.face.smile);
    // Wind sway on hair and loose garments (TDD §8.5).
    const sway = p.reducedMotion ? 0 : wind;
    const gust = Math.sin(this.clock * 2.3) * 0.6 + Math.sin(this.clock * 5.1) * 0.4;
    b.hairSway.rotation.set(0.15 * sway + 0.08 * sway * gust, 0, 0.12 * sway * gust);
    b.scarfTail.rotation.set(-0.35 * sway - 0.1 * sway * gust, 0, 0.2 * sway * gust);
    b.hem.rotation.set(0.04 * sway * gust, 0, 0.03 * sway * gust);
    this.rig.root.updateMatrixWorld(true);
    this.hairFrost.value =
      this.anim.state === 'freezing' ? 1 : this.anim.state === 'very_cold' ? 0.3 : 0;
  }

  private _v = new Vector3();
  private updateParticles(p: AvatarSceneProps, dt: number) {
    const w = p.weather;
    const b = this.rig.bones;
    const mouth = b.mouth.getWorldPosition(new Vector3());
    const head = b.head.getWorldPosition(new Vector3()).add(this._v.set(0, 0.18, 0));
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      b.head.getWorldQuaternion(new Quaternion()),
    );
    const sweat = Math.max(
      ...ZONE_IDS.map((z) => this.skin.uSweat.value[ZONE_IDS.indexOf(z)] ?? 0),
    );
    const drips: Vector3[] = [];
    if (w && w.precipMmH > 0.2) {
      for (const id of this.garments.keys()) {
        const g = GARMENT_BY_ID[id];
        const wet = Math.max(
          0,
          ...ZONE_IDS.filter((z) => (g.coverage[z] ?? 0) > 0).map((z) => p.wetness[z]),
        );
        if (
          wet > 0.5 &&
          (g.slot === 'torso_outer' || g.slot === 'torso_insulation' || g.slot === 'torso_base')
        ) {
          drips.push(b.hem.getWorldPosition(new Vector3()).add(new Vector3(0, -0.08, 0.1)));
        }
      }
    }
    this.particles.update(dt, {
      rainMmH: w ? w.precipMmH : 0,
      snow: !!w && (w.snowfallCmH > 0 || (w.precipMmH > 0 && w.tAir <= 0)),
      windX: w ? Math.min(12, (0.67 * w.windKmh) / 3.6) * 0.6 : 0,
      breath:
        !!w && w.tAir <= 5 && ['chilly', 'cold', 'very_cold', 'freezing'].includes(this.anim.state),
      mouth,
      forward,
      sweat: this.anim.state === 'overheated' || this.anim.state === 'heat_distress' ? sweat : 0,
      head,
      drips,
    });
  }

  /** Render one frame synchronously (tests, screenshots, reduced motion). */
  renderNow() {
    if (!this.propsCur) return;
    this.applyPose(this.propsCur, 0);
    this.renderer.render(this.scene, this.camera);
  }

  get drawCalls() {
    return this.renderer.info.render.calls;
  }

  get bodyState() {
    return this.anim.state;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObs.disconnect();
    for (const m of [this.body, this.face, this.hair, this.props]) this.disposeMesh(m ?? null);
    for (const m of this.garments.values()) this.disposeMesh(m);
    this.particles.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
