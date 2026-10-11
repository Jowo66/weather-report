import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  evaluate,
  explain,
  forecastFeelsLike,
  recommend,
  type ComfortResult,
  type Context,
  type EngineConfig,
  type Explanation,
  type GarmentId,
  type Recommendation,
} from '../engine';
import { hourIndexAt } from '../services/openMeteo';
import { toEngineWeather, type Forecast, type WeatherSample } from '../services/types';
import { useAvatar } from './avatarStore';
import { activeConfig, useCalibration } from './calibrationStore';
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

/** Engine overrides from the calibration panel (T-24), memoised by value in the engine. */
export function useEngineConfig() {
  const enabled = useCalibration((s) => s.enabled);
  const overrides = useCalibration((s) => s.overrides);
  return useMemo(() => activeConfig({ enabled, overrides }), [enabled, overrides]);
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
  const cfg = useEngineConfig();
  return useMemo(() => {
    if (!sample) return null;
    return {
      sample,
      result: evaluate(toEngineWeather(sample), worn, ctx, cfg),
      forecastFeelsLike: forecastFeelsLike(sample.tAir, sample.rh, sample.windKmh),
    };
  }, [sample, worn, ctx, cfg]);
}

export function useExplanation(): Explanation | null {
  const sample = useCurrentSample();
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  const cfg = useEngineConfig();
  return useMemo(
    () => (sample ? explain(toEngineWeather(sample), worn, ctx, cfg) : null),
    [sample, worn, ctx, cfg],
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
  cfg?: Partial<EngineConfig>,
): Recommendation[] {
  return samples.map((s) => recommend(toEngineWeather(s), ctx, cfg));
}

export function hourlyComfort(
  samples: readonly WeatherSample[],
  recs: readonly Recommendation[],
  worn: readonly GarmentId[],
  ctx: Context,
  cfg?: Partial<EngineConfig>,
): HourView[] {
  return samples.map((sample, i) => ({
    sample,
    result: evaluate(toEngineWeather(sample), worn, ctx, cfg),
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
  const cfg = useEngineConfig();
  const recs = useMemo(() => hourlyRecommendations(samples, ctx, cfg), [samples, ctx, cfg]);
  return useMemo(
    () => hourlyComfort(samples, recs, worn, ctx, cfg),
    [samples, recs, worn, ctx, cfg],
  );
}

export function useRecommendation(): Recommendation | null {
  const sample = useCurrentSample();
  const ctx = useComfortContext();
  const cfg = useEngineConfig();
  return useMemo(
    () => (sample ? recommend(toEngineWeather(sample), ctx, cfg) : null),
    [sample, ctx, cfg],
  );
}
