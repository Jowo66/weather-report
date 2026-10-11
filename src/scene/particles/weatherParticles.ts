import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';

interface Drop {
  p: Vector3;
  v: Vector3;
  life: number;
  max: number;
}

/** Fixed-capacity InstancedMesh pool (TDD §8.5). */
class Pool {
  readonly mesh: InstancedMesh;
  items: Drop[] = [];
  constructor(
    readonly capacity: number,
    geo: BoxGeometry | SphereGeometry,
    color: string,
    opacity: number,
  ) {
    this.mesh = new InstancedMesh(
      geo,
      new MeshBasicMaterial({
        color: new Color(color),
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
      capacity,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

const dummy = new Object3D();

export interface ParticleInputs {
  rainMmH: number;
  snow: boolean;
  windX: number;
  breath: boolean;
  mouth: Vector3;
  forward: Vector3;
  sweat: number;
  head: Vector3;
  drips: Vector3[];
}

/** Rain, snow, breath vapour, sweat and drips. Disabled entirely in reduced motion. */
export class WeatherParticles {
  private rain: Pool;
  private snow: Pool;
  private breath: Pool;
  private sweat: Pool;
  private rng = 12345;
  private breathClock = 0;
  private sweatClock = 0;
  private dripClock = 0;

  constructor(scene: Scene, mobile: boolean) {
    this.rain = new Pool(mobile ? 600 : 1500, new BoxGeometry(0.006, 0.12, 0.006), '#a9c4de', 0.55);
    this.snow = new Pool(mobile ? 300 : 800, new SphereGeometry(0.012, 6, 4), '#ffffff', 0.95);
    this.breath = new Pool(24, new SphereGeometry(0.04, 8, 6), '#f4f8ff', 0.28);
    this.sweat = new Pool(40, new SphereGeometry(0.007, 6, 4), '#d6ecff', 0.9);
    for (const p of [this.rain, this.snow, this.breath, this.sweat]) scene.add(p.mesh);
  }

  private rand() {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 2 ** 32;
  }

  setVisible(v: boolean) {
    for (const p of [this.rain, this.snow, this.breath, this.sweat]) p.mesh.visible = v;
  }

  get active(): boolean {
    return [this.rain, this.snow, this.breath, this.sweat].some((p) => p.mesh.count > 0);
  }

  update(dtS: number, i: ParticleInputs) {
    const dt = Math.min(dtS, 0.05);
    // Precipitation: target density scales with intensity.
    const fall = (pool: Pool, target: number, speed: number, wobble: number) => {
      while (pool.items.length < target) {
        pool.items.push({
          p: new Vector3(
            (this.rand() - 0.5) * 3.2,
            this.rand() * 3.2,
            (this.rand() - 0.5) * 2.4 + 0.2,
          ),
          v: new Vector3(i.windX * 0.6, -speed * (0.8 + 0.4 * this.rand()), 0),
          life: 0,
          max: Infinity,
        });
      }
      if (pool.items.length > target) pool.items.length = target;
      pool.items.forEach((d, k) => {
        d.v.x =
          i.windX * (speed > 3 ? 0.6 : 1.2) + (wobble ? Math.sin((d.p.y + k) * 3) * wobble : 0);
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0) {
          d.p.set((this.rand() - 0.5) * 3.2, 3.2, (this.rand() - 0.5) * 2.4 + 0.2);
        }
        if (d.p.x > 1.8) d.p.x -= 3.6;
        if (d.p.x < -1.8) d.p.x += 3.6;
        dummy.position.copy(d.p);
        dummy.rotation.set(0, 0, speed > 3 ? -Math.atan2(d.v.x, -d.v.y) : 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        pool.mesh.setMatrixAt(k, dummy.matrix);
      });
      pool.mesh.count = pool.items.length;
      pool.mesh.instanceMatrix.needsUpdate = true;
    };
    const rainTarget = i.snow ? 0 : Math.round(Math.min(1, i.rainMmH / 4) * this.rain.capacity);
    const snowTarget = i.snow
      ? Math.round(Math.min(1, Math.max(0.15, i.rainMmH / 2)) * this.snow.capacity)
      : 0;
    fall(this.rain, rainTarget, 6, 0);
    fall(this.snow, snowTarget, 0.7, 0.25);

    // Breath vapour: a puff every 3.5 s.
    this.breathClock += dt;
    if (i.breath && this.breathClock > 3.5) {
      this.breathClock = 0;
      for (let k = 0; k < 6 && this.breath.items.length < this.breath.capacity; k++) {
        this.breath.items.push({
          p: i.mouth.clone(),
          v: i.forward
            .clone()
            .multiplyScalar(0.25 + 0.15 * this.rand())
            .add(new Vector3((this.rand() - 0.5) * 0.08, 0.05, 0)),
          life: -k * 0.05,
          max: 1.6,
        });
      }
    }
    this.age(this.breath, dt, (_d, t) => 0.4 + t * 1.8);

    // Sweat droplets from the forehead / temples.
    this.sweatClock += dt;
    if (i.sweat > 0.45 && this.sweatClock > 0.9 / i.sweat) {
      this.sweatClock = 0;
      const a = (this.rand() - 0.5) * 1.6;
      this.sweat.items.push({
        p: i.head.clone().add(new Vector3(Math.sin(a) * 0.1, 0.03, Math.cos(a) * 0.09)),
        v: new Vector3(0, -0.05, 0),
        life: 0,
        max: 1.1,
      });
    }
    // Drips below wet hems.
    this.dripClock += dt;
    if (i.drips.length && this.dripClock > 0.35) {
      this.dripClock = 0;
      const src = i.drips[Math.floor(this.rand() * i.drips.length)]!;
      this.sweat.items.push({
        p: src.clone().add(new Vector3((this.rand() - 0.5) * 0.2, 0, (this.rand() - 0.5) * 0.1)),
        v: new Vector3(0, -0.2, 0),
        life: 0,
        max: 1.0,
      });
    }
    if (this.sweat.items.length > this.sweat.capacity)
      this.sweat.items.splice(0, this.sweat.items.length - this.sweat.capacity);
    this.age(this.sweat, dt, () => 1, 9.8);
  }

  private age(pool: Pool, dt: number, scale: (d: Drop, t: number) => number, gravity = 0) {
    pool.items = pool.items.filter((d) => d.life < d.max);
    pool.items.forEach((d, k) => {
      d.life += dt;
      if (d.life >= 0) {
        d.v.y -= gravity * dt * 0.3;
        d.p.addScaledVector(d.v, dt);
      }
      const t = Math.max(0, d.life) / d.max;
      dummy.position.copy(d.p);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(d.life < 0 ? 0 : scale(d, t));
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(k, dummy.matrix);
    });
    pool.mesh.count = pool.items.length;
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const p of [this.rain, this.snow, this.breath, this.sweat]) p.dispose();
  }
}
