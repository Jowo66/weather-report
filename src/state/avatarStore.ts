import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage } from './persist';

export interface AvatarState {
  /** "I run cold / hot", −3…+3 °C. The only avatar setting that changes the maths. */
  personalOffset: number;
  setPersonalOffset: (v: number) => void;
}

export const clampOffset = (v: number) => Math.max(-3, Math.min(3, Math.round(v * 2) / 2));

export const useAvatar = create<AvatarState>()(
  persist(
    (set) => ({
      personalOffset: 0,
      setPersonalOffset: (v) => set({ personalOffset: clampOffset(v) }),
    }),
    { name: 'wr:avatar:v1', version: 1, storage: jsonStorage },
  ),
);
