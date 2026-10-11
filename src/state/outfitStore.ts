import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CONFIG, isGarmentId, type Activity, type GarmentId } from '../engine';
import { runMigrations } from './migrations';
import { jsonStorage } from './persist';
import { sortOutfit, toggleGarment, type ToggleResult } from './wardrobe';

export interface OutfitState {
  worn: GarmentId[];
  activity: Activity;
  shade: boolean;
  umbrella: boolean;
  /** Last change, for announcements ("Replaced T-shirt with Thermal top"). */
  lastChange: (ToggleResult & { at: number }) | null;
  setWorn: (ids: GarmentId[]) => void;
  toggle: (id: GarmentId) => ToggleResult;
  setActivity: (a: Activity) => void;
  setShade: (v: boolean) => void;
  setUmbrella: (v: boolean) => void;
}

export const DEFAULT_OUTFIT: GarmentId[] = [...DEFAULT_CONFIG.REF_OUTFIT];
export const OUTFIT_STORE_VERSION = 2;

export function sanitizeOutfit(ids: unknown): GarmentId[] {
  if (!Array.isArray(ids)) return [...DEFAULT_OUTFIT];
  const out: GarmentId[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && isGarmentId(id)) {
      if (!out.includes(id)) out.push(id);
    } else {
      console.warn(`Dropping unknown garment id: ${String(id)}`);
    }
  }
  return out;
}

const ACTIVITIES: readonly Activity[] = ['standing', 'strolling', 'walking'];

/** v1 → v2: sanitize ids, sort head-to-feet, validate activity. */
export function migrateOutfit(persisted: unknown, fromVersion: number): Record<string, unknown> {
  return runMigrations(
    {
      1: (s) => ({
        ...s,
        worn: sortOutfit(sanitizeOutfit(s.worn)),
        activity: ACTIVITIES.includes(s.activity as Activity) ? s.activity : 'standing',
        shade: s.shade === true,
        umbrella: s.umbrella === true,
      }),
    },
    persisted,
    fromVersion,
    OUTFIT_STORE_VERSION,
  );
}

export const useOutfit = create<OutfitState>()(
  persist(
    (set, get) => ({
      worn: [...DEFAULT_OUTFIT],
      activity: 'standing',
      shade: false,
      umbrella: false,
      lastChange: null,
      setWorn: (worn) => set({ worn: sortOutfit(worn) }),
      toggle: (id) => {
        const r = toggleGarment(get().worn, id);
        set({ worn: r.worn, lastChange: { ...r, at: Date.now() } });
        return r;
      },
      setActivity: (activity) => set({ activity }),
      setShade: (shade) => set({ shade }),
      setUmbrella: (umbrella) => set({ umbrella }),
    }),
    {
      name: 'wr:outfit:v1',
      version: OUTFIT_STORE_VERSION,
      storage: jsonStorage,
      partialize: (s) => ({
        worn: s.worn,
        activity: s.activity,
        shade: s.shade,
        umbrella: s.umbrella,
      }),
      migrate: (persisted, version) => migrateOutfit(persisted, version) as unknown as OutfitState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OutfitState>;
        return {
          ...current,
          ...p,
          worn: p.worn === undefined ? current.worn : sanitizeOutfit(p.worn),
        };
      },
    },
  ),
);
