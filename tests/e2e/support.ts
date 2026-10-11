import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Mock Open-Meteo forecast + geocoding with synthetic fixtures. Never hits the network. */
export async function mockOpenMeteo(page: Page, opts: { forecast?: string } = {}) {
  const calls = { forecast: 0, geocoding: 0 };
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
  await page.route('https://archive-api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":true,"reason":"not mocked"}',
    }),
  );
  return calls;
}
