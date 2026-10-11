import { describe, expect, it } from 'vitest';
import {
  evaluate,
  recommend,
  type Context,
  type EngineWeather,
  type GarmentId,
} from '../../src/engine';

// Performance budgets (TDD §14): evaluate() ≤ 0.2 ms median, recommend() ≤ 5 ms median.
const w: EngineWeather = {
  tAir: -15,
  rh: 70,
  windKmh: 25,
  ghi: 250,
  dni: 500,
  dhi: 80,
  sunAlt: 20,
  precipMmH: 0,
  snowDepthM: 0.2,
};
const c: Context = { activity: 'walking', shade: false, umbrella: false, personalOffset: 0 };
const kit: GarmentId[] = [
  'thermal_top',
  'sweater',
  'winter_coat',
  'jeans',
  'toque',
  'gloves',
  'wool_socks',
  'winter_boots',
];

function medianMs(fn: () => void, runs: number): number {
  for (let i = 0; i < 50; i++) fn(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

describe('performance budgets', () => {
  it('evaluate() median ≤ 0.2 ms', () => {
    const m = medianMs(() => evaluate(w, kit, c), 2000);
    console.info(`evaluate() median ${(m * 1000).toFixed(1)} µs`);
    expect(m).toBeLessThanOrEqual(0.2);
  });

  it('recommend() median ≤ 5 ms', () => {
    const m = medianMs(() => recommend(w, c), 200);
    console.info(`recommend() median ${m.toFixed(3)} ms`);
    expect(m).toBeLessThanOrEqual(5);
  });
});
