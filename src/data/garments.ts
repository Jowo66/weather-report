import type { GarmentId, ZoneId } from '../engine';
import raw from './garments.json';

export type GarmentCategory =
  'top' | 'bottom' | 'outer' | 'head' | 'neck' | 'hands' | 'socks' | 'footwear';
export type SlotId =
  | 'torso_base'
  | 'torso_mid'
  | 'torso_insulation'
  | 'torso_outer'
  | 'legs_base'
  | 'legs_outer'
  | 'head'
  | 'neck'
  | 'hands'
  | 'socks'
  | 'footwear';

/** Catalogue entry (TDD §5.1). Physics fields must match src/engine/garments.ts (tested). */
export interface GarmentDef {
  id: GarmentId;
  name: string;
  category: GarmentCategory;
  slot: SlotId;
  layer: 1 | 2 | 3 | 4 | 5;
  clo: number;
  cloSource: 'ASHRAE55' | 'ISO9920' | 'estimate';
  coverage: Partial<Record<ZoneId, number>>;
  i_m: number;
  windproof: boolean;
  waterproof: boolean;
  wetLoss: number;
  eligibleMaxT?: number;
  eligibleMinT?: number;
  mesh: { glb: string; hidesBody: ZoneId[]; shapeKeys: true };
  tint: { default: string; dyeable: boolean };
}

export const GARMENT_DEFS = raw as GarmentDef[];

export const GARMENT_BY_ID: Readonly<Record<GarmentId, GarmentDef>> = Object.fromEntries(
  GARMENT_DEFS.map((g) => [g.id, g]),
) as Record<GarmentId, GarmentDef>;

export const SLOT_ORDER: readonly SlotId[] = [
  'head',
  'neck',
  'torso_base',
  'torso_mid',
  'torso_insulation',
  'torso_outer',
  'hands',
  'legs_base',
  'legs_outer',
  'socks',
  'footwear',
];

export const SLOT_LABEL: Record<SlotId, string> = {
  head: 'Head',
  neck: 'Neck',
  torso_base: 'Base layer',
  torso_mid: 'Shirt',
  torso_insulation: 'Warm layer',
  torso_outer: 'Outer layer',
  hands: 'Hands',
  legs_base: 'Under layer',
  legs_outer: 'Legs',
  socks: 'Socks',
  footwear: 'Shoes',
};
