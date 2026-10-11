import { getJson, type Fetch } from './openMeteo';
import type { Place } from './types';

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
  timezone?: string;
}

export function geocodingUrl(query: string, language = 'en'): string {
  const p = new URLSearchParams({ name: query.trim(), count: '8', language, format: 'json' });
  return `${GEOCODING_URL}?${p.toString()}`;
}

export async function searchPlaces(
  query: string,
  opts: { fetchImpl?: Fetch; signal?: AbortSignal; language?: string } = {},
): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  const data = await getJson<{ results?: GeoResult[] }>(
    geocodingUrl(query, opts.language),
    fetchImpl,
    opts.signal,
  );
  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    countryCode: r.country_code,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  }));
}

export function placeLabel(p: Place): string {
  return [p.name, p.admin1, p.country].filter(Boolean).join(', ');
}
