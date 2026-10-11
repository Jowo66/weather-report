import { ZONE_IDS, type ZoneId, type ZoneState } from '../../engine';
import type { BodyState } from '../animation/stateMachine';

export interface SkinChannels {
  coldFlush: number;
  pallor: number;
  ash: number;
  heatFlush: number;
  sweat: number;
  frost: number;
}
export type SkinResponse = Record<ZoneId, SkinChannels>;

const NONE: SkinChannels = { coldFlush: 0, pallor: 0, ash: 0, heatFlush: 0, sweat: 0, frost: 0 };

const BY_ZONE_STATE: Record<ZoneState, Partial<SkinChannels>> = {
  ok: {},
  cool: { coldFlush: 0.2 },
  cold: { coldFlush: 0.5, ash: 0.3 },
  freezing: { coldFlush: 0.8, pallor: 0.4, ash: 0.5 },
  numb: { coldFlush: 0.3, pallor: 0.8, ash: 0.6 },
  warm: { heatFlush: 0.25, sweat: 0.2 },
  hot: { heatFlush: 0.5, sweat: 0.6 },
};

/** Whole-body skin cues per body state (TDD §7.2 table), applied as a floor on every zone. */
const BY_BODY_STATE: Partial<Record<BodyState, Partial<SkinChannels>>> = {
  cold: { coldFlush: 0.5 },
  very_cold: { coldFlush: 0.8, pallor: 0.3 },
  freezing: { coldFlush: 0.6, pallor: 0.6, frost: 1 },
  warm: { sweat: 0.2 },
  hot: { sweat: 0.5, heatFlush: 0.5 },
  overheated: { sweat: 0.8, heatFlush: 0.6 },
  heat_distress: { sweat: 1, heatFlush: 0.7 },
};

/**
 * Skin-response parameters (TDD §8.4) from zone states and the body state.
 * Cold flush shows mainly on the face and hands (nose, ears, cheeks, fingertips).
 */
export function skinResponse(
  zones: Partial<Record<ZoneId, ZoneState>>,
  body: BodyState,
): SkinResponse {
  const out = {} as SkinResponse;
  const b = BY_BODY_STATE[body] ?? {};
  for (const z of ZONE_IDS) {
    const zs = BY_ZONE_STATE[zones[z] ?? 'ok'];
    const flushZone = z === 'head' || z === 'hands';
    const c: SkinChannels = { ...NONE };
    for (const k of Object.keys(NONE) as (keyof SkinChannels)[]) {
      const fromBody = (b[k] ?? 0) * (k === 'coldFlush' && !flushZone ? 0.4 : 1);
      c[k] = Math.max(zs[k] ?? 0, fromBody);
    }
    if (z !== 'head') c.frost = 0;
    out[z] = c;
  }
  return out;
}
