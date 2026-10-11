import { sunPosition } from './solarPosition';
import { SwrCache, coordKey, isFresh, type CacheEntry } from './cache';
import type { DailySummary, Forecast, WeatherSample } from './types';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const FORECAST_TTL_MS = 15 * 60 * 1000;

const SAMPLE_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'shortwave_radiation_instant',
  'direct_normal_irradiance_instant',
  'diffuse_radiation_instant',
  'uv_index',
  'snow_depth',
] as const;

const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'uv_index_max',
  'sunrise',
  'sunset',
  'wind_speed_10m_max',
  'weather_code',
] as const;

export function forecastUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: SAMPLE_VARS.join(','),
    hourly: [...SAMPLE_VARS, 'precipitation_probability'].join(','),
    daily: DAILY_VARS.join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '16',
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
  });
  return `${FORECAST_URL}?${p.toString()}`;
}

type Num = number | null | undefined;
type Series = Record<string, Num[] | undefined>;
type Scalars = Record<string, Num>;

export interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  current?: Scalars & { time: number };
  hourly?: Series & { time: number[] };
  daily?: Series & { time: number[] };
}

export class OpenMeteoError extends Error {
  constructor(
    message: string,
    readonly kind: 'http' | 'network' | 'parse',
    readonly status?: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'OpenMeteoError';
  }
}

const n = (v: Num, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function sample(
  get: (k: string) => Num,
  time: number,
  lat: number,
  lon: number,
  precipProbability: number | null,
): WeatherSample {
  const sun = sunPosition(time, lat, lon);
  const tAir = n(get('temperature_2m'));
  return {
    time,
    tAir,
    rh: Math.min(100, Math.max(0, n(get('relative_humidity_2m'), 50))),
    windKmh: Math.max(0, n(get('wind_speed_10m'))),
    gustKmh: Math.max(0, n(get('wind_gusts_10m'))),
    windDirDeg: n(get('wind_direction_10m')),
    ghi: Math.max(0, n(get('shortwave_radiation_instant'))),
    dni: Math.max(0, n(get('direct_normal_irradiance_instant'))),
    dhi: Math.max(0, n(get('diffuse_radiation_instant'))),
    sunAltDeg: sun.altitude,
    sunAzDeg: sun.azimuth,
    // `precipitation` already sums rain, showers and snowfall water equivalent.
    precipMmH: Math.max(0, n(get('precipitation'))),
    snowfallCmH: Math.max(0, n(get('snowfall'))),
    snowDepthM: Math.max(0, n(get('snow_depth'))),
    weatherCode: n(get('weather_code')),
    cloudCover: n(get('cloud_cover')),
    isDay: n(get('is_day')) === 1,
    uvIndex: Math.max(0, n(get('uv_index'))),
    apparentTemp: n(get('apparent_temperature'), tAir),
    precipProbability,
  };
}

/** Normalise an Open-Meteo forecast response (timeformat=unixtime) into our model. */
export function normaliseForecast(r: OpenMeteoForecastResponse, fetchedAt: number): Forecast {
  if (!r.current || !r.hourly || !Array.isArray(r.hourly.time)) {
    throw new OpenMeteoError('Unexpected forecast response', 'parse');
  }
  const { latitude: lat, longitude: lon } = r;
  const cur = r.current;
  const current = sample((k) => cur[k], cur.time, lat, lon, null);
  const hs = r.hourly;
  const hourly = hs.time.map((t, i) =>
    sample((k) => hs[k]?.[i], t, lat, lon, hs.precipitation_probability?.[i] ?? null),
  );
  const ds = r.daily;
  const daily: DailySummary[] = (ds?.time ?? []).map((t, i) => ({
    time: t,
    tMax: n(ds?.temperature_2m_max?.[i]),
    tMin: n(ds?.temperature_2m_min?.[i]),
    precipSumMm: n(ds?.precipitation_sum?.[i]),
    precipProbabilityMax: n(ds?.precipitation_probability_max?.[i]),
    uvIndexMax: n(ds?.uv_index_max?.[i]),
    sunrise: n(ds?.sunrise?.[i]),
    sunset: n(ds?.sunset?.[i]),
    windMaxKmh: n(ds?.wind_speed_10m_max?.[i]),
    weatherCode: n(ds?.weather_code?.[i]),
  }));
  return {
    latitude: lat,
    longitude: lon,
    timezone: r.timezone,
    utcOffsetSeconds: r.utc_offset_seconds,
    current,
    hourly,
    daily,
    fetchedAt,
  };
}

export type Fetch = typeof fetch;

export async function getJson<T>(url: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, signal ? { signal } : undefined);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new OpenMeteoError('Network error', 'network');
  }
  if (!res.ok) {
    let reason: string | undefined;
    try {
      reason = ((await res.json()) as { reason?: string }).reason;
    } catch {
      // body wasn't JSON
    }
    throw new OpenMeteoError(`HTTP ${res.status}`, 'http', res.status, reason);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new OpenMeteoError('Invalid JSON', 'parse');
  }
}

export const forecastCache = new SwrCache<Forecast>('wr:wx:');

export interface ForecastResult {
  forecast: Forecast;
  /** true when served from cache because the network failed */
  offline: boolean;
}

/**
 * Fetch a forecast, at most once per location per 15 min (TDD §3.3).
 * Fresh cache → no request. Network failure → stale cache (offline) or throw.
 */
export async function loadForecast(
  lat: number,
  lon: number,
  opts: {
    fetchImpl?: Fetch;
    now?: () => number;
    signal?: AbortSignal;
    cache?: SwrCache<Forecast>;
  } = {},
): Promise<ForecastResult> {
  const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  const now = opts.now ?? Date.now;
  const cache = opts.cache ?? forecastCache;
  const key = coordKey(lat, lon);
  const cached: CacheEntry<Forecast> | null = cache.get(key);
  if (cached && isFresh(cached, FORECAST_TTL_MS, now())) {
    return { forecast: cached.value, offline: false };
  }
  try {
    const raw = await getJson<OpenMeteoForecastResponse>(
      forecastUrl(lat, lon),
      fetchImpl,
      opts.signal,
    );
    const forecast = normaliseForecast(raw, now());
    cache.set(key, forecast, now());
    return { forecast, offline: false };
  } catch (e) {
    if (cached && e instanceof OpenMeteoError && e.kind === 'network') {
      return { forecast: cached.value, offline: true };
    }
    throw e;
  }
}

/** Read whatever is cached for a location (for showing stale data immediately). */
export function peekForecast(lat: number, lon: number, cache = forecastCache): Forecast | null {
  return cache.get(coordKey(lat, lon))?.value ?? null;
}

/** Index of the hourly sample at or just before `t` (unix s). */
export function hourIndexAt(hourly: readonly WeatherSample[], t: number): number {
  let lo = 0;
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i]!.time <= t) lo = i;
    else break;
  }
  return lo;
}
