import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SwrCache, coordKey, type KeyValueStorage } from '../../src/services/cache';
import { geocodingUrl, placeLabel, searchPlaces } from '../../src/services/geocoding';
import {
  FORECAST_TTL_MS,
  OpenMeteoError,
  forecastUrl,
  hourIndexAt,
  loadForecast,
  normaliseForecast,
  type OpenMeteoForecastResponse,
} from '../../src/services/openMeteo';
import { sunPosition } from '../../src/services/solarPosition';
import type { Forecast } from '../../src/services/types';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const toronto = fixture('forecast-toronto.json') as OpenMeteoForecastResponse;

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('solar position (TDD §3.4)', () => {
  it('equinox noon at the equator ≈ 90°', () => {
    // 2026-03-20 12:00 UTC at lon 0; allow for the equation of time and declination.
    const alt = sunPosition(Date.UTC(2026, 2, 20, 12, 7) / 1000, 0, 0).altitude;
    expect(alt).toBeGreaterThan(89);
  });

  it('Toronto June-solstice solar noon ≈ 69.8°', () => {
    // Solar noon in Toronto ≈ 17:18 UTC in late June.
    const alt = sunPosition(Date.UTC(2026, 5, 21, 17, 18) / 1000, 43.65, -79.38).altitude;
    expect(alt).toBeCloseTo(69.8, 0);
  });

  it('Toronto December-solstice solar noon ≈ 22.9°', () => {
    const alt = sunPosition(Date.UTC(2026, 11, 21, 17, 9) / 1000, 43.65, -79.38).altitude;
    expect(alt).toBeCloseTo(22.9, 0);
  });

  it('is below the horizon at midnight', () => {
    expect(sunPosition(Date.UTC(2026, 5, 21, 5, 0) / 1000, 43.65, -79.38).altitude).toBeLessThan(0);
  });

  it('azimuth is south-ish at northern-hemisphere noon', () => {
    const az = sunPosition(Date.UTC(2026, 11, 21, 17, 9) / 1000, 43.65, -79.38).azimuth;
    expect(az).toBeGreaterThan(170);
    expect(az).toBeLessThan(190);
  });
});

describe('forecast request', () => {
  it('asks for instant radiation, unixtime and 16 days in SI units', () => {
    const u = new URL(forecastUrl(43.65, -79.38));
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('current')).toContain('shortwave_radiation_instant');
    expect(u.searchParams.get('current')).not.toMatch(/(^|,)shortwave_radiation(,|$)/);
    expect(u.searchParams.get('hourly')).toContain('precipitation_probability');
    expect(u.searchParams.get('timeformat')).toBe('unixtime');
    expect(u.searchParams.get('forecast_days')).toBe('16');
    expect(u.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(u.searchParams.has('apikey')).toBe(false);
  });
});

describe('normaliser', () => {
  const f = normaliseForecast(toronto, 1000);

  it('maps current and hourly samples', () => {
    expect(f.timezone).toBe('America/Toronto');
    expect(f.hourly).toHaveLength(384);
    expect(f.daily).toHaveLength(16);
    expect(f.current.tAir).toBe(toronto.current!.temperature_2m);
    expect(f.current.precipProbability).toBeNull();
    expect(typeof f.hourly[0]!.precipProbability).toBe('number');
    expect(f.fetchedAt).toBe(1000);
  });

  it('computes sun altitude per sample', () => {
    const night = f.hourly[0]!; // local midnight
    expect(night.sunAltDeg).toBeLessThan(0);
    const noon = f.hourly[12]!; // 05:00 UTC + 12 h = 12:00 EST
    expect(noon.sunAltDeg).toBeGreaterThan(15);
  });

  it('tolerates nulls and clamps nonsense', () => {
    const r: OpenMeteoForecastResponse = {
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
      utc_offset_seconds: 0,
      current: { time: 0, temperature_2m: null, relative_humidity_2m: 140, wind_speed_10m: -3 },
      hourly: { time: [0] },
    };
    const n = normaliseForecast(r, 0);
    expect(n.current.tAir).toBe(0);
    expect(n.current.rh).toBe(100);
    expect(n.current.windKmh).toBe(0);
  });

  it('rejects malformed responses', () => {
    expect(() => normaliseForecast({} as OpenMeteoForecastResponse, 0)).toThrow(OpenMeteoError);
  });

  it('hourIndexAt finds the current hour', () => {
    expect(hourIndexAt(f.hourly, f.current.time)).toBe(12);
    expect(hourIndexAt(f.hourly, f.current.time + 1800)).toBe(12);
  });
});

describe('loadForecast caching (TDD §3.3)', () => {
  it('fetches once and serves from cache for 15 minutes', async () => {
    const cache = new SwrCache<Forecast>('t:', 20, memoryStorage());
    const fetchImpl = vi.fn(async () => jsonResponse(toronto));
    let t = 1_000_000;
    const now = () => t;
    await loadForecast(43.7, -79.42, { fetchImpl, now, cache });
    t += FORECAST_TTL_MS - 1;
    await loadForecast(43.7, -79.42, { fetchImpl, now, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 2;
    await loadForecast(43.7, -79.42, { fetchImpl, now, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to stale cache when offline', async () => {
    const storage = memoryStorage();
    const cache = new SwrCache<Forecast>('t:', 20, storage);
    let t = 0;
    await loadForecast(43.7, -79.42, {
      fetchImpl: async () => jsonResponse(toronto),
      now: () => t,
      cache,
    });
    t = 2 * 60 * 60 * 1000;
    // A fresh cache instance reads the persisted copy.
    const cache2 = new SwrCache<Forecast>('t:', 20, storage);
    const r = await loadForecast(43.7, -79.42, {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
      now: () => t,
      cache: cache2,
    });
    expect(r.offline).toBe(true);
    expect(r.forecast.timezone).toBe('America/Toronto');
  });

  it('surfaces the Open-Meteo reason on HTTP 400', async () => {
    const cache = new SwrCache<Forecast>('t:', 20, memoryStorage());
    await expect(
      loadForecast(999, 0, {
        fetchImpl: async () =>
          jsonResponse({ error: true, reason: 'Latitude must be in range' }, 400),
        cache,
      }),
    ).rejects.toMatchObject({ kind: 'http', status: 400, reason: 'Latitude must be in range' });
  });

  it('throws network errors when nothing is cached', async () => {
    const cache = new SwrCache<Forecast>('t:', 20, memoryStorage());
    await expect(
      loadForecast(1, 1, {
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
        cache,
      }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('keys by coordinates rounded to 2 dp and evicts least-recently used', () => {
    expect(coordKey(43.65432, -79.38321)).toBe('43.65:-79.38');
    const c = new SwrCache<number>('t:', 2, null);
    c.set('a', 1, 0);
    c.set('b', 2, 0);
    c.get('a');
    c.set('c', 3, 0);
    expect(c.get('b')).toBeNull();
    expect(c.get('a')?.value).toBe(1);
  });
});

describe('geocoding', () => {
  it('builds the search URL and maps results', async () => {
    expect(geocodingUrl(' Toronto ')).toContain('name=Toronto');
    const places = await searchPlaces('Toronto', {
      fetchImpl: async () => jsonResponse(fixture('geocoding-toronto.json')),
    });
    expect(places).toHaveLength(2);
    expect(placeLabel(places[0]!)).toBe('Toronto, Ontario, Canada');
  });

  it('needs at least 2 characters', async () => {
    const fetchImpl = vi.fn();
    expect(await searchPlaces('T', { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('handles no results', async () => {
    expect(await searchPlaces('zzzz', { fetchImpl: async () => jsonResponse({}) })).toEqual([]);
  });
});
