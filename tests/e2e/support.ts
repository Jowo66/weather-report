import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Mock Open-Meteo forecast + geocoding with synthetic fixtures. Never hits the network. */
export async function mockOpenMeteo(page: Page, opts: { forecast?: string } = {}) {
  const calls = { forecast: 0, geocoding: 0, archive: 0 };
  await page.route('https://api.open-meteo.com/**', (route) => {
    calls.forecast++;
    const lat = Number(new URL(route.request().url()).searchParams.get('latitude'));
    const name = opts.forecast ?? (lat < 38 ? 'forecast-phoenix.json' : 'forecast-toronto.json');
    return route.fulfill({ contentType: 'application/json', body: fixture(name) });
  });
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
    calls.geocoding++;
    const q = new URL(route.request().url()).searchParams.get('name')?.toLowerCase() ?? '';
    const body = q.startsWith('pho')
      ? fixture('geocoding-phoenix.json')
      : fixture('geocoding-toronto.json');
    return route.fulfill({ contentType: 'application/json', body });
  });
  await page.route('https://archive-api.open-meteo.com/**', (route) => {
    calls.archive++;
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        syntheticArchive(Number(q.get('latitude')), q.get('start_date')!, q.get('end_date')!),
      ),
    });
  });
  return calls;
}

/** Synthetic hourly archive (UTC) for the requested window: seasonal + diurnal temperature, rain every third day. */
export function syntheticArchive(lat: number, start: string, end: string) {
  const t0 = Date.parse(`${start}T00:00:00Z`) / 1000;
  const t1 = Date.parse(`${end}T23:00:00Z`) / 1000;
  const keys = [
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
  const h: Record<string, number[]> = { time: [] };
  for (const k of keys) h[k] = [];
  const base = lat > 40 ? 6 : 24;
  for (let t = t0; t <= t1; t += 3600) {
    const d = new Date(t * 1000);
    const hour = d.getUTCHours();
    const doy = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1) / 1000) / 86400);
    const season = -8 * Math.cos(((doy - 15) / 365) * 2 * Math.PI);
    const ghi = hour >= 7 && hour <= 18 ? 650 * Math.sin(((hour - 7) / 11) * Math.PI) : 0;
    h.time!.push(t);
    h.temperature_2m!.push(
      +(base + season + 5 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)).toFixed(1),
    );
    h.relative_humidity_2m!.push(65);
    h.wind_speed_10m!.push(14);
    h.precipitation!.push(d.getUTCDate() % 3 === 0 && hour === 16 ? 3 : 0);
    h.shortwave_radiation!.push(Math.round(ghi));
    h.direct_normal_irradiance!.push(Math.round(ghi * 0.8));
    h.diffuse_radiation!.push(Math.round(ghi * 0.2));
    h.snow_depth!.push(0);
    h.cloud_cover!.push(40);
  }
  return { latitude: lat, longitude: 0, timezone: 'UTC', utc_offset_seconds: 0, hourly: h };
}
