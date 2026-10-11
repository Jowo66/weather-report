import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CONFIG, isGarmentId, type Activity, type GarmentId } from '../engine';
import { jsonStorage } from './persist';

export interface OutfitState {
  worn: GarmentId[];
  activity: Activity;
  shade: boolean;
  umbrella: boolean;
  setWorn: (ids: GarmentId[]) => void;
  setActivity: (a: Activity) => void;
  setShade: (v: boolean) => void;
  setUmbrella: (v: boolean) => void;
}

export const DEFAULT_OUTFIT: GarmentId[] = [...DEFAULT_CONFIG.REF_OUTFIT];

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

export const useOutfit = create<OutfitState>()(
  persist(
    (set) => ({
      worn: [...DEFAULT_OUTFIT],
      activity: 'standing',
      shade: false,
      umbrella: false,
      setWorn: (worn) => set({ worn }),
      setActivity: (activity) => set({ activity }),
      setShade: (shade) => set({ shade }),
      setUmbrella: (umbrella) => set({ umbrella }),
    }),
    {
      name: 'wr:outfit:v1',
      version: 1,
      storage: jsonStorage,
      partialize: (s) => ({
        worn: s.worn,
        activity: s.activity,
        shade: s.shade,
        umbrella: s.umbrella,
      }),
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
