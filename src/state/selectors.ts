import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  evaluate,
  explain,
  forecastFeelsLike,
  recommend,
  type ComfortResult,
  type Context,
  type Explanation,
  type GarmentId,
  type Recommendation,
} from '../engine';
import { hourIndexAt } from '../services/openMeteo';
import { toEngineWeather, type Forecast, type WeatherSample } from '../services/types';
import { useAvatar } from './avatarStore';
import { useOutfit } from './outfitStore';
import { useWeather } from './weatherStore';

export function useComfortContext(): Context {
  const { activity, shade, umbrella } = useOutfit(
    useShallow((s) => ({ activity: s.activity, shade: s.shade, umbrella: s.umbrella })),
  );
  const personalOffset = useAvatar((s) => s.personalOffset);
  return useMemo(
    () => ({ activity, shade, umbrella, personalOffset }),
    [activity, shade, umbrella, personalOffset],
  );
}

export function useCurrentSample(): WeatherSample | null {
  return useWeather((s) => s.forecast?.current ?? null);
}

export interface ComfortView {
  sample: WeatherSample;
  result: ComfortResult;
  forecastFeelsLike: number;
}

export function useComfort(): ComfortView | null {
  const sample = useCurrentSample();
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  return useMemo(() => {
    if (!sample) return null;
    return {
      sample,
      result: evaluate(toEngineWeather(sample), worn, ctx),
      forecastFeelsLike: forecastFeelsLike(sample.tAir, sample.rh, sample.windKmh),
    };
  }, [sample, worn, ctx]);
}

export function useExplanation(): Explanation | null {
  const sample = useCurrentSample();
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  return useMemo(
    () => (sample ? explain(toEngineWeather(sample), worn, ctx) : null),
    [sample, worn, ctx],
  );
}

export interface HourView {
  sample: WeatherSample;
  result: ComfortResult;
  recommendation: Recommendation;
}

/** Pure helper: next `hours` hourly samples from the current time. */
export function upcomingHours(forecast: Forecast, hours: number): WeatherSample[] {
  const start = hourIndexAt(forecast.hourly, forecast.current.time);
  return forecast.hourly.slice(start, start + hours);
}

/** Recommendations depend on weather and context only, not on what you're wearing. */
export function hourlyRecommendations(
  samples: readonly WeatherSample[],
  ctx: Context,
): Recommendation[] {
  return samples.map((s) => recommend(toEngineWeather(s), ctx));
}

export function hourlyComfort(
  samples: readonly WeatherSample[],
  recs: readonly Recommendation[],
  worn: readonly GarmentId[],
  ctx: Context,
): HourView[] {
  return samples.map((sample, i) => ({
    sample,
    result: evaluate(toEngineWeather(sample), worn, ctx),
    recommendation: recs[i]!,
  }));
}

export function useHourlyComfort(hours = 24): HourView[] {
  const forecast = useWeather((s) => s.forecast);
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  const samples = useMemo(
    () => (forecast ? upcomingHours(forecast, hours) : []),
    [forecast, hours],
  );
  const recs = useMemo(() => hourlyRecommendations(samples, ctx), [samples, ctx]);
  return useMemo(() => hourlyComfort(samples, recs, worn, ctx), [samples, recs, worn, ctx]);
}

export function useRecommendation(): Recommendation | null {
  const sample = useCurrentSample();
  const ctx = useComfortContext();
  return useMemo(() => (sample ? recommend(toEngineWeather(sample), ctx) : null), [sample, ctx]);
}
