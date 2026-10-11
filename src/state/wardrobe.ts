import { GARMENT_BY_ID, SLOT_ORDER } from '../data/garments';
import type { GarmentId } from '../engine';

export interface ToggleResult {
  worn: GarmentId[];
  added?: GarmentId;
  removed?: GarmentId;
  /** Garments displaced by a slot conflict. */
  replaced: GarmentId[];
}

/** One garment per slot (TDD §5.3). Adding a conflicting item swaps it out. */
export function toggleGarment(worn: readonly GarmentId[], id: GarmentId): ToggleResult {
  if (worn.includes(id)) {
    return { worn: worn.filter((g) => g !== id), removed: id, replaced: [] };
  }
  const slot = GARMENT_BY_ID[id].slot;
  const replaced = worn.filter((g) => GARMENT_BY_ID[g].slot === slot);
  return {
    worn: sortOutfit([...worn.filter((g) => !replaced.includes(g)), id]),
    added: id,
    replaced,
  };
}

/** Draw / list order: by slot (head → feet) then layer. */
export function sortOutfit(ids: readonly GarmentId[]): GarmentId[] {
  return [...ids].sort((a, b) => {
    const ga = GARMENT_BY_ID[a];
    const gb = GARMENT_BY_ID[b];
    return SLOT_ORDER.indexOf(ga.slot) - SLOT_ORDER.indexOf(gb.slot) || ga.layer - gb.layer;
  });
}

/** Outfits that break the one-per-slot rule (recommendations may layer a rain shell over a coat). */
export function slotConflicts(ids: readonly GarmentId[]): GarmentId[][] {
  const bySlot = new Map<string, GarmentId[]>();
  for (const id of ids) {
    const s = GARMENT_BY_ID[id].slot;
    bySlot.set(s, [...(bySlot.get(s) ?? []), id]);
  }
  return [...bySlot.values()].filter((v) => v.length > 1);
}
