import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place } from '../services/types';
import type { TripProfile } from '../travel/planner';
import { jsonStorage } from './persist';

export interface Trip {
  destination: Place | null;
  start: string;
  end: string;
  profile: TripProfile;
  laundry: boolean;
}

export interface TravelState {
  trip: Trip;
  /** Packed counts by garment id or extra id. */
  packed: Record<string, number>;
  compare: Place[];
  setTrip: (p: Partial<Trip>) => void;
  setPacked: (id: string, n: number) => void;
  clearPacked: () => void;
  addCompare: (p: Place) => void;
  removeCompare: (id: Place['id']) => void;
}

export const MAX_TRIP_DAYS = 30;
export const MAX_COMPARE = 3;

const blankTrip: Trip = { destination: null, start: '', end: '', profile: 'mixed', laundry: false };

export const useTravel = create<TravelState>()(
  persist(
    (set) => ({
      trip: blankTrip,
      packed: {},
      compare: [],
      setTrip: (p) => set((s) => ({ trip: { ...s.trip, ...p } })),
      setPacked: (id, n) =>
        set((s) => ({ packed: { ...s.packed, [id]: Math.max(0, Math.min(99, Math.round(n))) } })),
      clearPacked: () => set({ packed: {} }),
      addCompare: (p) =>
        set((s) =>
          s.compare.some((c) => c.id === p.id) || s.compare.length >= MAX_COMPARE
            ? s
            : { compare: [...s.compare, p] },
        ),
      removeCompare: (id) => set((s) => ({ compare: s.compare.filter((c) => c.id !== id) })),
    }),
    { name: 'wr:travel:v1', version: 1, storage: jsonStorage },
  ),
);
