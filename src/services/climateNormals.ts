import { SwrCache, coordKey, isFresh } from './cache';
import { getJson, type Fetch } from './openMeteo';
import { sunPosition } from './solarPosition';
import { addDays, localParts, localToUnix, parseIso, isoDate } from '../travel/time';

export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
export const NORMALS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const NORMAL_YEARS = 10;
export const WINDOW_DAYS = 3;
export const DAY_PART_HOURS = { morning: 8, afternoon: 14, evening: 20 } as const;
export type DayPart = keyof typeof DAY_PART_HOURS;

const VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'precipitation',
  'shortwave_radiation',
  'direct_normal_irradiance',
  'diffuse_radiation',
  'snow_depth',
  'cloud_cover',
] as const;

export interface ArchiveResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  hourly?: { time: number[] } & Partial<Record<(typeof VARS)[number], (number | null)[]>>;
}

export function archiveUrl(lat: number, lon: number, start: string, end: string): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start,
    end_date: end,
    hourly: VARS.join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });
  return `${ARCHIVE_URL}?${p.toString()}`;
}

/** Shift an ISO date to another year (Feb 29 → Feb 28 in non-leap years). */
export function withYear(iso: string, year: number): string {
  const { m, d } = parseIso(iso);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isoDate(year, m, m === 2 && d === 29 && !leap ? 28 : d);
}

export interface NormalPart {
  /** P25 / P50 / P75 air temperature (°C). */
  t25: number;
  t50: number;
  t75: number;
  rh: number;
  windKmh: number;
  ghi: number;
  dni: number;
  dhi: number;
  precipMmH: number;
  snowDepthM: number;
  cloudCover: number;
  sunAltDeg: number;
  sunAzDeg: number;
  n: number;
}

export interface NormalDay {
  date: string;
  parts: Record<DayPart, NormalPart>;
  /** Share of years with ≥ 1 mm on that calendar date. */
  precipProbability: number;
  /** UV max proxy from clear-sky-ish radiation (archive has no UV): GHI_max / 100. */
  uvMaxEstimate: number;
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
const median = (xs: number[]) =>
  quantile(
    [...xs].sort((a, b) => a - b),
    0.5,
  );

interface Row {
  md: string; // MM-DD
  year: number;
  hour: number;
  vals: Record<(typeof VARS)[number], number>;
}

/** Pure aggregation (TDD §6.2): per trip date and day part, percentiles over ±3 days × N years. */
export function aggregateNormals(
  responses: readonly ArchiveResponse[],
  dates: readonly string[],
  lat: number,
  lon: number,
  timeZone: string,
): NormalDay[] {
  const rows: Row[] = [];
  const dailyPrecip = new Map<string, number>(); // `${year}-${MM-DD}` → mm
  for (const r of responses) {
    const h = r.hourly;
    if (!h) continue;
    h.time.forEach((t, i) => {
      const lp = localParts(t, timeZone);
      const md = `${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`;
      const vals = Object.fromEntries(VARS.map((v) => [v, h[v]?.[i] ?? NaN])) as Row['vals'];
      rows.push({ md, year: lp.year, hour: lp.hour, vals });
      const key = `${lp.year}-${md}`;
      if (Number.isFinite(vals.precipitation))
        dailyPrecip.set(key, (dailyPrecip.get(key) ?? 0) + vals.precipitation);
    });
  }
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const k = `${row.md}@${row.hour}`;
    const list = byKey.get(k);
    if (list) list.push(row);
    else byKey.set(k, [row]);
  }
  const years = [...new Set(rows.map((r) => r.year))];
  return dates.map((date) => {
    const window = Array.from({ length: 2 * WINDOW_DAYS + 1 }, (_, i) =>
      addDays(date, i - WINDOW_DAYS).slice(5),
    );
    const parts = {} as Record<DayPart, NormalPart>;
    for (const [part, hour] of Object.entries(DAY_PART_HOURS) as [DayPart, number][]) {
      const sel = window.flatMap((md) => byKey.get(`${md}@${hour}`) ?? []);
      const col = (v: (typeof VARS)[number]) => sel.map((r) => r.vals[v]).filter(Number.isFinite);
      const temps = col('temperature_2m').sort((a, b) => a - b);
      const sun = sunPosition(localToUnix(date, hour, timeZone), lat, lon);
      parts[part] = {
        t25: quantile(temps, 0.25),
        t50: quantile(temps, 0.5),
        t75: quantile(temps, 0.75),
        rh: median(col('relative_humidity_2m')),
        windKmh: median(col('wind_speed_10m')),
        ghi: median(col('shortwave_radiation')),
        dni: median(col('direct_normal_irradiance')),
        dhi: median(col('diffuse_radiation')),
        precipMmH: median(col('precipitation')),
        snowDepthM: median(col('snow_depth')),
        cloudCover: median(col('cloud_cover')),
        sunAltDeg: sun.altitude,
        sunAzDeg: sun.azimuth,
        n: temps.length,
      };
    }
    const md = date.slice(5);
    const wetYears = years.filter((y) => (dailyPrecip.get(`${y}-${md}`) ?? 0) >= 1).length;
    // Typical peak radiation: the highest hour-of-day median GHI in the window.
    let ghiMax = 0;
    for (let hh = 0; hh < 24; hh++) {
      const g = window
        .flatMap((m) => byKey.get(`${m}@${hh}`) ?? [])
        .map((r) => r.vals.shortwave_radiation);
      const v = median(g.filter(Number.isFinite));
      if (v > ghiMax) ghiMax = v;
    }
    return {
      date,
      parts,
      precipProbability: years.length ? wetYears / years.length : 0,
      uvMaxEstimate: ghiMax / 100,
    };
  });
}

export const normalsCache = new SwrCache<NormalDay[]>('wr:normals:', 20);

/**
 * Climate normals for `dates` at a place: the same calendar window (±3 days) over the last
 * 10 years, one small archive request per year, cached for 30 days.
 */
export async function loadNormals(
  lat: number,
  lon: number,
  timeZone: string,
  dates: readonly string[],
  opts: {
    fetchImpl?: Fetch;
    now?: () => number;
    signal?: AbortSignal;
    cache?: SwrCache<NormalDay[]>;
  } = {},
): Promise<NormalDay[]> {
  if (dates.length === 0) return [];
  const now = opts.now ?? Date.now;
  const cache = opts.cache ?? normalsCache;
  const key = `${coordKey(lat, lon)}:${dates[0]}:${dates[dates.length - 1]}`;
  const hit = cache.get(key);
  if (hit && isFresh(hit, NORMALS_TTL_MS, now())) return hit.value;
  const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  const thisYear = new Date(now()).getUTCFullYear();
  const first = addDays(dates[0]!, -WINDOW_DAYS);
  const last = addDays(dates[dates.length - 1]!, WINDOW_DAYS);
  const spanDays = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000);
  const requests = Array.from({ length: NORMAL_YEARS }, (_, i) => {
    const y = thisYear - 1 - i;
    const start = withYear(first, y);
    const end = addDays(start, spanDays);
    return getJson<ArchiveResponse>(archiveUrl(lat, lon, start, end), fetchImpl, opts.signal);
  });
  const responses = await Promise.all(requests);
  const result = aggregateNormals(responses, dates, lat, lon, timeZone);
  cache.set(key, result, now());
  return result;
}
