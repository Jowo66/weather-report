import {
  NeutralToneMapping,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshPhysicalMaterial,
  PMREMGenerator,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
  Fog,
  InstancedMesh,
  Object3D,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Backdrop } from '../data/backdrops';
import { GARMENT_BY_ID } from '../data/garments';
import { buildBackdrop, type BackdropScene } from './environments/backdrops3d';
import {
  ZONE_IDS,
  type ComfortState,
  type Flag,
  type GarmentId,
  type ZoneId,
  type ZoneState,
} from '../engine';
import type { AvatarAppearance } from '../state/avatarStore';
import { composePose } from './animation/clips';
import {
  initialAnimState,
  nextAnimState,
  type AnimEvent,
  type AnimInputs,
  type AnimState,
} from './animation/stateMachine';
import { loadedCharacter, loadCharacter, type CharacterAssets, type Sex } from './character/data';
import {
  bodyGeometry,
  bodyModel,
  defaultBrows,
  eyesGeometry,
  garmentGeometry,
  hairClip,
  hairGeometry,
  headMetrics,
  hiddenMask,
  lidsGeometry,
  type BodyModel,
} from './character/parts';
import { applyPose, buildRig, type CharacterRig } from './character/skeleton';
import { characterTextures, loadCharacterTextures } from './character/textures';
import {
  applySkinResponse,
  createHairMaterial,
  createSkinMaterial,
  type SkinUniforms,
} from './materials/skinMaterial';
import { skinResponse } from './materials/skinResponse';
import { WeatherParticles } from './particles/weatherParticles';
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
  backdrop: Backdrop;
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

/** Load the character data and textures for this sex (the scene builds synchronously from them). */
export async function preloadCharacter(sex: Sex): Promise<void> {
  await Promise.all([loadCharacter(sex), loadCharacterTextures(sex)]);
}

export class AvatarScene {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.1, 50);
  private hemi = new HemisphereLight('#dfe9f5', '#5b5346', 1.4);
  private sun = new DirectionalLight('#fff4e0', 2.2);
  private ground: Mesh;
  private rig!: CharacterRig;
  private model!: BodyModel;
  private assets!: CharacterAssets;
  private contact: Mesh;
  private body!: SkinnedMesh;
  private eyes!: SkinnedMesh;
  private lids!: SkinnedMesh;
  private hair: SkinnedMesh | null = null;
  private hairFrost = { value: 0 };
  private skin!: SkinUniforms;
  private garments = new Map<GarmentId, SkinnedMesh>();
  private props: Mesh | null = null;
  /** Appearance (JSON) the current meshes were built from; null until the first build. */
  private builtFor: string | null = null;
  private loadingSex: Sex | null = null;
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
  private backdrop: BackdropScene | null = null;
  private backdropKind: Backdrop | null = null;
  private footprints: InstancedMesh;
  /** Snow accumulation on garments, 0–1 over 60 s of snowfall (cosmetic). */
  private snowAmount = 0;
  private snowUniforms = new Set<{ value: number }>();

  constructor(
    private readonly container: HTMLElement,
    opts: { mobile: boolean },
  ) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    });
    this.lowPower = AvatarScene.detectLowPower(this.renderer);
    this.renderer.setPixelRatio(this.lowPower ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.88, 0);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -1.5;
    this.sun.shadow.camera.right = 1.5;
    this.sun.shadow.camera.top = 2.2;
    this.sun.shadow.camera.bottom = -0.5;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.mapSize.set(this.lowPower ? 512 : 2048, this.lowPower ? 512 : 2048);
    // Low power: refresh the shadow map every third frame instead of every frame.
    if (this.lowPower) this.renderer.shadowMap.autoUpdate = false;
    // Soft image-based lighting so surfaces read as smooth and rounded (skipped on weak/software GPUs,
    // where per-pixel environment sampling dominates frame time).
    if (!this.lowPower) {
      const pmrem = new PMREMGenerator(this.renderer);
      const t0 = performance.now();
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, {
        size: 128,
      }).texture;
      this.scene.environmentIntensity = 0.32;
      this.envMs = performance.now() - t0;
      pmrem.dispose();
    }
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.ground = new Mesh(
      new CircleGeometry(2.4, 48),
      new MeshStandardMaterial({ color: '#8a8f86', roughness: 0.95 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // Soft contact shadow under the feet (grounds the figure).
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    if (cx) {
      const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 64, 64);
    }
    this.contact = new Mesh(
      new PlaneGeometry(0.75, 0.55),
      new MeshBasicMaterial({ map: new CanvasTexture(cv), transparent: true, depthWrite: false }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.set(0, 0.003, 0.03);
    this.scene.add(this.contact);
    // Footprints in snow (TDD §8.6 / R5): a static trail leading to the avatar.
    this.footprints = new InstancedMesh(
      new CircleGeometry(0.06, 12),
      new MeshStandardMaterial({
        color: '#c9d6e2',
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      10,
    );
    const d = new Object3D();
    for (let i = 0; i < 10; i++) {
      d.position.set(i % 2 ? 0.1 : -0.1, 0.004, -0.35 - i * 0.38);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.set(0.8, 1.9, 1);
      d.updateMatrix();
      this.footprints.setMatrixAt(i, d.matrix);
    }
    this.footprints.visible = false;
    this.scene.add(this.footprints);
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
    if (this.cameraLocked) return;
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
  private disposeMesh(m: Mesh | null) {
    if (!m) return;
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as Material).dispose();
  }

  private skinnedGeo(geo: BufferGeometry, material: Material): SkinnedMesh {
    const m = new SkinnedMesh(geo, material);
    this.scene.add(m);
    // Meshes sit at the scene origin; the root bone carries the height scale.
    m.bind(this.rig.skeleton, new Matrix4());
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** Build the body for this appearance; false while its assets are still loading. */
  private buildAvatar(a: AvatarAppearance): boolean {
    const assets = loadedCharacter(a.sex);
    const tex = characterTextures(a.sex);
    if (!assets || !tex) {
      if (this.loadingSex !== a.sex) {
        this.loadingSex = a.sex;
        preloadCharacter(a.sex)
          .then(() => {
            this.loadingSex = null;
            if (this.propsCur && !this.disposed) this.update(this.wanted ?? this.propsCur);
          })
          .catch((e: unknown) => {
            this.loadingSex = null;
            console.warn('Weather Report: character assets unavailable.', e);
          });
      }
      return false;
    }
    for (const m of [this.body, this.eyes, this.lids, this.hair]) this.disposeMesh(m ?? null);
    this.hair = null;
    for (const id of [...this.garments.keys()]) this.removeGarment(id);
    this.disposeMesh(this.props);
    this.props = null;
    if (this.rig) this.scene.remove(this.rig.root);

    this.assets = assets;
    const head = headMetrics(assets.body, assets.hair[defaultBrows(a.sex)]);
    this.model = bodyModel(assets.body, a.build, head);
    this.rig = buildRig(assets.body, head);
    this.rig.root.scale.setScalar(1 + 0.06 * a.height);
    this.scene.add(this.rig.root);
    const skinColor = skinHex(a.melanin, a.undertone);
    const skin = createSkinMaterial(skinColor, {
      detail: tex.detail,
      normal: this.lowPower ? null : tex.normal,
    });
    skin.material.roughness = a.ageLook === 'senior' ? 0.68 : 0.55;
    this.skin = skin.uniforms;
    this.body = this.skinnedGeo(bodyGeometry(this.model), skin.material);
    this.eyes = this.skinnedGeo(
      eyesGeometry(this.model),
      new MeshPhysicalMaterial({ map: tex.eye, roughness: 0.2, clearcoat: 0.6 }),
    );
    this.eyes.castShadow = false;
    this.lids = this.skinnedGeo(
      lidsGeometry(this.model),
      new MeshStandardMaterial({ color: new Color(skinColor), roughness: 0.6 }),
    );
    this.lids.castShadow = false;
    return true;
  }

  private buildHair(a: AvatarAppearance, worn: readonly GarmentId[]) {
    this.disposeMesh(this.hair);
    this.hair = null;
    const hex = greyHair(a.hairColor, a.ageLook === 'senior');
    // Very light hair keeps darker brows so the face still reads.
    const brow = new Color(lum(hex) > 0.6 ? '#8a7a6a' : hex);
    const c = new Color(hex);
    const geo = hairGeometry(this.assets, this.model, {
      style: a.hairStyle,
      facialHair: a.facialHair,
      hair: [c.r, c.g, c.b],
      brows: [brow.r, brow.g, brow.b],
      clip: hairClip(this.model.head, worn),
    });
    if (!geo) return;
    const { material, frost } = createHairMaterial(characterTextures(a.sex)?.hair ?? null);
    material.roughness = 0.6;
    this.hairFrost = frost;
    this.hair = this.skinnedGeo(geo, material);
  }

  private removeGarment(id: GarmentId) {
    const m = this.garments.get(id);
    if (m) {
      this.snowUniforms.delete(
        (m.material as MeshStandardMaterial).userData.snow as { value: number },
      );
      this.disposeMesh(m);
    }
    this.garments.delete(id);
  }

  private syncGarments(worn: readonly GarmentId[]) {
    for (const id of [...this.garments.keys()]) if (!worn.includes(id)) this.removeGarment(id);
    for (const id of worn) {
      if (this.garments.has(id)) continue;
      const def = GARMENT_BY_ID[id];
      const mat = this.lowPower
        ? new MeshStandardMaterial({
            color: new Color(def.tint.default),
            roughness: id === 'rain_shell' ? 0.45 : 0.85,
            side: DoubleSide,
            vertexColors: true,
          })
        : new MeshPhysicalMaterial({
            color: new Color(def.tint.default),
            roughness: id === 'rain_shell' ? 0.45 : 0.85,
            // Cloth: soft sheen at grazing angles; shells are glossier.
            sheen: id === 'rain_shell' ? 0.1 : 0.7,
            sheenRoughness: 0.7,
            sheenColor: new Color(def.tint.default).lerp(new Color('#ffffff'), 0.35),
            side: DoubleSide,
            vertexColors: true,
          });
      mat.userData.base = new Color(def.tint.default);
      this.garments.set(id, this.skinnedGeo(garmentGeometry(this.model, id), mat));
    }
    // Skin fully under a garment is discarded (no poke-through, less overdraw).
    const hide = this.body.geometry.attributes.hide as BufferAttribute;
    (hide.array as Float32Array).set(hiddenMask(this.model, worn));
    hide.needsUpdate = true;
  }

  private syncProps(umbrella: boolean) {
    if (umbrella && !this.props) {
      const tint = (g: BufferGeometry, c: [number, number, number]) => {
        const n = g.attributes.position!.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set(c, i * 3);
        g.setAttribute('color', new BufferAttribute(col, 3));
        return g;
      };
      const shaft = new CylinderGeometry(0.008, 0.008, 0.95, 8).translate(0, 0.4, 0.02);
      const canopy = new SphereGeometry(0.55, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.32)
        .scale(1, 0.55, 1)
        .translate(0, 0.78, 0.02);
      const parts = [
        tint(shaft.toNonIndexed(), [0.2, 0.2, 0.22]),
        tint(canopy.toNonIndexed(), [0.12, 0.3, 0.55]),
      ];
      shaft.dispose();
      canopy.dispose();
      const geo = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      this.props = new Mesh(
        geo,
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: DoubleSide }),
      );
      this.props.castShadow = true;
      this.rig.anchors.handR.add(this.props);
    } else if (!umbrella && this.props) {
      this.disposeMesh(this.props);
      this.props = null;
    }
  }

  // ---------------------------------------------------------------- updates
  update(p: AvatarSceneProps) {
    const u0 = performance.now();
    this.updateInner(p);
    this.updateMs = performance.now() - u0;
  }

  /** Last update() duration (diagnostics). */
  updateMs = 0;
  /** Latest requested props (may be ahead of propsCur while a body is loading). */
  private wanted: AvatarSceneProps | null = null;

  private updateInner(next: AvatarSceneProps) {
    this.wanted = next;
    let p = next;
    const prev = this.propsCur;
    const hadBody = this.builtFor !== null;
    const look = JSON.stringify(p.appearance);
    let rebuilt = false;
    if (this.builtFor !== look) {
      if (this.buildAvatar(p.appearance)) {
        this.builtFor = look;
        rebuilt = true;
      } else if (!this.builtFor) {
        // First body still loading: nothing to show yet.
        this.propsCur = p;
        return;
      } else {
        // Keep showing the current body until the new one has loaded.
        p = { ...p, appearance: JSON.parse(this.builtFor) as AvatarAppearance };
      }
    }
    this.propsCur = p;
    if (rebuilt || !prev || !sameSet(prev.worn, p.worn)) {
      if (prev && hadBody && !rebuilt) {
        if (p.worn.some((g) => !prev.worn.includes(g))) this.events.push('garment_added');
        if (prev.worn.some((g) => !p.worn.includes(g))) this.events.push('garment_removed');
      }
      this.syncGarments(p.worn);
      this.buildHair(p.appearance, p.worn);
      this.setSnow(0); // snow resets on outfit change
    }
    if (rebuilt || !prev || prev.umbrella !== p.umbrella) this.syncProps(p.umbrella);
    if (prev?.weather && p.weather) {
      if (prev.weather.precipMmH < 0.2 && p.weather.precipMmH >= 0.2)
        this.events.push('rain_start');
    }
    if (p.weather && p.weather.gustKmh > 40 && !this.gusted) {
      this.gusted = true;
      this.events.push('gust');
    }
    if (!this.animStarted) {
      this.animStarted = true;
      this.anim = initialAnimState({ perceived: p.perceived, flags: p.flags });
    }
    applySkinResponse(this.skin, skinResponse(p.zones, this.anim.state), p.appearance.melanin);

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
  private animStarted = false;

  private setSnow(v: number) {
    this.snowAmount = v;
    for (const u of this.snowUniforms) u.value = v;
  }

  private applyEnvironment(p: AvatarSceneProps) {
    const w = p.weather;
    const day = w ? w.isDay : true;
    if (this.backdropKind !== p.backdrop) {
      if (this.backdrop) {
        this.scene.remove(this.backdrop.group);
        this.backdrop.dispose();
      }
      this.backdrop = buildBackdrop(p.backdrop);
      this.backdropKind = p.backdrop;
      this.scene.add(this.backdrop.group);
    }
    this.backdrop?.setNight(!day);
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
    this.scene.fog = new Fog(sky, 9, 26);
    const snowy = !!w && w.snowDepthM > 0.01;
    const groundCol = new Color(snowy ? '#eef3f7' : (this.backdrop?.ground ?? '#8f978a'));
    if (!day) groundCol.multiplyScalar(0.45);
    (this.ground.material as MeshStandardMaterial).color.copy(groundCol);
    this.footprints.visible = snowy;
    this.hemi.intensity = (day ? 0.85 : 0.35) * (this.lowPower ? 1.5 : 1);
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
    if (this.disposed || !this.propsCur || !this.builtFor) return;
    if (this.lowPower && now - this.lastRender < 50 && !this.propsCur.reducedMotion) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.lastRender = now;
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
      applySkinResponse(this.skin, skinResponse(p.zones, this.anim.state), p.appearance.melanin);
      this.container.dispatchEvent(
        new CustomEvent('wr-anim-state', { detail: this.anim.state, bubbles: true }),
      );
    }
    this.applyPose(p, inputs.wind);
    const snowing = !!w && (w.snowfallCmH > 0 || (w.precipMmH > 0 && w.tAir <= 0));
    if (snowing && this.snowAmount < 1) this.setSnow(Math.min(1, this.snowAmount + dtMs / 60_000));
    if (!p.reducedMotion) this.updateParticles(p, dtMs / 1000);
    const r0 = performance.now();
    if (this.lowPower && this.frameCount++ % 3 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - r0) * 0.1;
    // Demand loop: keep going while anything moves; in reduced motion stop once settled.
    if (!document.hidden && (!p.reducedMotion || this.anim.pending || this.anim.fade.t < 1)) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private applyPose(p: AvatarSceneProps, wind: number) {
    const pose = composePose(this.anim, this.clock, p.reducedMotion);
    // Wind sway on hair and loose garments (TDD §8.5).
    const sway = p.reducedMotion ? 0 : wind;
    const gust = Math.sin(this.clock * 2.3) * 0.6 + Math.sin(this.clock * 5.1) * 0.4;
    applyPose(this.rig, pose, {
      stoop: p.appearance.ageLook === 'senior' ? 0.06 : 0,
      sway: [0.25 * sway + 0.1 * sway * gust, 0.12 * sway * gust],
      scarf: [-0.35 * sway - 0.1 * sway * gust, 0.2 * sway * gust],
    });
    // Lids exist only to squint; skip their draw call otherwise.
    this.lids.visible = pose.face.squint > 0.01;
    this.hairFrost.value =
      this.anim.state === 'freezing' ? 0.4 : this.anim.state === 'very_cold' ? 0.12 : 0;
  }

  private _v = new Vector3();
  private updateParticles(p: AvatarSceneProps, dt: number) {
    const w = p.weather;
    const b = this.rig.anchors;
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
          drips.push(b.hem.getWorldPosition(new Vector3()));
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
    if (!this.propsCur || !this.builtFor) return;
    this.renderer.shadowMap.needsUpdate = true;
    this.applyPose(this.propsCur, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Debug/QA: frame a point at a distance (used by #/dev/avatar-qa?zoom=…). */
  debugCamera(lookY: number, dist: number, yaw = 0) {
    this.camera.position.set(Math.sin(yaw) * dist, lookY + 0.02, Math.cos(yaw) * dist);
    this.camera.lookAt(0, lookY, 0);
    this.camera.updateProjectionMatrix();
    if (this.builtFor) this.renderer.render(this.scene, this.camera);
    this.cameraLocked = true;
  }
  private cameraLocked = false;
  /** Software rendering or a weak device: 30 fps cap, smaller shadows, 1× pixel ratio (TDD §8.1). */
  readonly lowPower: boolean;
  private lastRender = 0;
  /** Time spent generating the environment map (diagnostics). */
  envMs = 0;
  /** Smoothed render time per frame (diagnostics). */
  frameMs = 0;
  private frameCount = 0;

  static detectLowPower(r: WebGLRenderer): boolean {
    // QA override: #/dev/avatar-qa?quality=high|low
    const q = /[?&]quality=(high|low)/.exec(window.location.hash)?.[1];
    if (q) return q === 'low';
    try {
      const gl = r.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|software/i.test(name)) return true;
    } catch {
      // ignore
    }
    return (navigator.hardwareConcurrency ?? 8) <= 4;
  }

  get drawCalls() {
    return this.renderer.info.render.calls;
  }

  get currentBackdrop() {
    return this.backdropKind;
  }

  get bodyState() {
    return this.anim.state;
  }

  /** True once a character has been built and rendered (QA / tests). */
  get ready() {
    return this.builtFor !== null;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObs.disconnect();
    for (const m of [this.body, this.eyes, this.lids, this.hair, this.props])
      this.disposeMesh(m ?? null);
    for (const id of [...this.garments.keys()]) this.removeGarment(id);
    this.particles.dispose();
    this.backdrop?.dispose();
    this.footprints.geometry.dispose();
    (this.footprints.material as Material).dispose();
    this.ground.geometry.dispose();
    (this.ground.material as Material).dispose();
    this.contact.geometry.dispose();
    (this.contact.material as MeshBasicMaterial).map?.dispose();
    (this.contact.material as Material).dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
