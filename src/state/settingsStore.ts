import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage } from './persist';

export type TempUnit = 'C' | 'F';
export type WindUnit = 'kmh' | 'mph';
export type MotionPref = 'system' | 'reduce' | 'full';

export interface SettingsState {
  tempUnit: TempUnit;
  windUnit: WindUnit;
  motion: MotionPref;
  highContrast: boolean;
  setTempUnit: (u: TempUnit) => void;
  setWindUnit: (u: WindUnit) => void;
  setMotion: (m: MotionPref) => void;
  setHighContrast: (v: boolean) => void;
}

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']);

export function localeDefaults(lang: string | undefined): {
  tempUnit: TempUnit;
  windUnit: WindUnit;
} {
  const region = lang?.split('-')[1]?.toUpperCase();
  const imperial = region ? IMPERIAL_REGIONS.has(region) : false;
  return imperial ? { tempUnit: 'F', windUnit: 'mph' } : { tempUnit: 'C', windUnit: 'kmh' };
}

const nav = typeof navigator === 'undefined' ? undefined : navigator.language;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...localeDefaults(nav),
      motion: 'system',
      highContrast: false,
      setTempUnit: (tempUnit) => set({ tempUnit }),
      setWindUnit: (windUnit) => set({ windUnit }),
      setMotion: (motion) => set({ motion }),
      setHighContrast: (highContrast) => set({ highContrast }),
    }),
    { name: 'wr:settings:v1', version: 1, storage: jsonStorage },
  ),
);
