import { GARMENT_BY_ID, type SlotId } from '../data/garments';
import type { GarmentId } from '../engine';
import type { DayPlan } from './planner';

export type Rewear = number | 'trip';

/** Re-wear policy (TDD §6.3), configurable. Days a garment can be worn before it needs washing. */
export const DEFAULT_REWEAR: Record<SlotId, Rewear> = {
  torso_base: 1,
  legs_base: 1,
  socks: 1,
  torso_mid: 2,
  legs_outer: 3,
  torso_insulation: 'trip',
  torso_outer: 'trip',
  footwear: 'trip',
  head: 'trip',
  neck: 'trip',
  hands: 'trip',
};

export type ExtraId = 'umbrella' | 'sunscreen' | 'sunglasses';

export interface PackingItem {
  id: GarmentId;
  garmentDays: number;
  needed: number;
  /** Dates on which the garment is worn. */
  days: string[];
}

export interface PackingList {
  items: PackingItem[];
  extras: ExtraId[];
}

export function packingList(
  plans: readonly DayPlan[],
  opts: { laundry: boolean; rewear?: Partial<Record<SlotId, Rewear>> } = { laundry: false },
): PackingList {
  const policy = { ...DEFAULT_REWEAR, ...opts.rewear };
  const tripDays = plans.length;
  const days = new Map<GarmentId, string[]>();
  for (const p of plans) for (const g of p.items) days.set(g, [...(days.get(g) ?? []), p.date]);
  const items: PackingItem[] = [...days.entries()].map(([id, ds]) => {
    const rw = policy[GARMENT_BY_ID[id].slot];
    let needed: number;
    if (rw === 'trip') needed = 1;
    else {
      needed = Math.ceil(ds.length / rw);
      if (opts.laundry) needed = Math.min(needed, Math.ceil(Math.min(tripDays, 7) / rw));
    }
    return { id, garmentDays: ds.length, needed, days: ds };
  });
  items.sort((a, b) => b.garmentDays - a.garmentDays || a.id.localeCompare(b.id));
  const extras: ExtraId[] = [];
  if (plans.some((p) => p.precipProbability >= 0.4)) extras.push('umbrella');
  if (plans.some((p) => p.uvMax >= 3)) extras.push('sunscreen', 'sunglasses');
  return { items, extras };
}

export interface Shortfall {
  id: GarmentId;
  needed: number;
  packed: number;
  /** Days that are short once the packed count runs out (in trip order). */
  days: string[];
}

/** Missing-item detection: compare packed counts to the list and say which days are short. */
export function shortfalls(
  list: PackingList,
  packed: Partial<Record<string, number>>,
): Shortfall[] {
  const out: Shortfall[] = [];
  for (const item of list.items) {
    const have = packed[item.id] ?? 0;
    if (have >= item.needed) continue;
    // Spread available garments evenly; the uncovered tail of days is short.
    const perItem = item.garmentDays / item.needed;
    const coveredDays = Math.floor(have * perItem);
    out.push({
      id: item.id,
      needed: item.needed,
      packed: have,
      days: item.days.slice(coveredDays),
    });
  }
  return out;
}
