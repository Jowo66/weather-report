import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OpenMeteoError, loadForecast, peekForecast } from '../services/openMeteo';
import type { Forecast, Place } from '../services/types';
import { jsonStorage } from './persist';

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WeatherState {
  place: Place | null;
  forecast: Forecast | null;
  status: WeatherStatus;
  offline: boolean;
  error: string | null;
  setPlace: (p: Place) => void;
  refresh: () => Promise<void>;
}

let inflight: AbortController | null = null;

export const useWeather = create<WeatherState>()(
  persist(
    (set, get) => ({
      place: null,
      forecast: null,
      status: 'idle',
      offline: false,
      error: null,
      setPlace: (place) => {
        // Show cached data immediately (SWR), then revalidate.
        set({ place, forecast: peekForecast(place.latitude, place.longitude), error: null });
        void get().refresh();
      },
      refresh: async () => {
        const place = get().place;
        if (!place) return;
        inflight?.abort();
        const ctrl = new AbortController();
        inflight = ctrl;
        set({ status: 'loading', error: null });
        try {
          const { forecast, offline } = await loadForecast(place.latitude, place.longitude, {
            signal: ctrl.signal,
          });
          if (inflight !== ctrl) return;
          set({ forecast, offline, status: 'ready' });
        } catch (e) {
          if (inflight !== ctrl || (e as Error)?.name === 'AbortError') return;
          const msg =
            e instanceof OpenMeteoError
              ? e.kind === 'network'
                ? 'You appear to be offline.'
                : import.meta.env.DEV && e.reason
                  ? `Open-Meteo: ${e.reason}`
                  : 'The weather service had a problem.'
              : 'Something went wrong.';
          set({
            status: 'error',
            error: msg,
            offline: e instanceof OpenMeteoError && e.kind === 'network',
          });
        }
      },
    }),
    {
      name: 'wr:location:v1',
      version: 1,
      storage: jsonStorage,
      // Only the selected place is persisted; forecasts live in the forecast cache.
      partialize: (s) => ({ place: s.place }),
    },
  ),
);
