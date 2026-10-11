import type { EngineWeather } from '../engine';

/** Normalised weather sample (TDD §3.2). */
export interface WeatherSample {
  /** unix seconds UTC */
  time: number;
  tAir: number;
  rh: number;
  windKmh: number;
  gustKmh: number;
  windDirDeg: number;
  ghi: number;
  dni: number;
  dhi: number;
  sunAltDeg: number;
  sunAzDeg: number;
  precipMmH: number;
  snowfallCmH: number;
  snowDepthM: number;
  weatherCode: number;
  cloudCover: number;
  isDay: boolean;
  uvIndex: number;
  /** Open-Meteo's apparent temperature; display only. */
  apparentTemp: number;
  /** Hourly only; null for current conditions. */
  precipProbability: number | null;
}

export interface DailySummary {
  /** unix seconds of local midnight */
  time: number;
  tMax: number;
  tMin: number;
  precipSumMm: number;
  precipProbabilityMax: number;
  uvIndexMax: number;
  sunrise: number;
  sunset: number;
  windMaxKmh: number;
  weatherCode: number;
}

export interface Place {
  id: number | string;
  name: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface Forecast {
  latitude: number;
  longitude: number;
  timezone: string;
  utcOffsetSeconds: number;
  current: WeatherSample;
  hourly: WeatherSample[];
  daily: DailySummary[];
  /** ms epoch when fetched (client clock) */
  fetchedAt: number;
}

export function toEngineWeather(s: WeatherSample): EngineWeather {
  return {
    tAir: s.tAir,
    rh: s.rh,
    windKmh: s.windKmh,
    ghi: s.ghi,
    dni: s.dni,
    dhi: s.dhi,
    sunAlt: s.sunAltDeg,
    precipMmH: s.precipMmH,
    snowDepthM: s.snowDepthM,
  };
}
