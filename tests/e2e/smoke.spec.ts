import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockOpenMeteo } from './support';

test.beforeEach(async ({ context }) => {
  // Fixed locale so units are predictable.
  await context.addInitScript(() => localStorage.clear());
});

test('app shell loads with attribution and disclaimer', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Weather Report' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute(
    'href',
    'https://open-meteo.com/',
  );
  await expect(page.getByText('Not medical or safety advice.')).toBeVisible();
});

test('deep links fall back to the app via 404.html', async ({ request }) => {
  const res = await request.get('404.html');
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain('<div id="root"></div>');
});

test('search a city and see "You\'ll feel X, state, because …"', async ({ page }) => {
  const calls = await mockOpenMeteo(page);
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Search for a city' }).fill('Toronto');
  await page.getByRole('option', { name: 'Toronto, Ontario, Canada' }).click();
  await expect(page.getByTestId('perceived')).toHaveText(/^-?\d+°[CF]$/);
  await expect(page.getByTestId('comfort-state')).not.toBeEmpty();
  await expect(page.getByTestId('official')).toHaveText(/^-?\d+°[CF]$/);
  await expect(page.getByTestId('explanation').locator('li').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Hourly forecast' }).locator('li')).toHaveCount(24);
  // Shareable URL reflects the place.
  await expect(page).toHaveURL(/c=43\.70,-79\.42/);
  expect(calls.forecast).toBe(1);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test('a hot city shows heat guidance', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('./#/?c=33.45,-112.07&n=Phoenix');
  await expect(page.getByTestId('perceived')).toBeVisible();
  await expect(page.getByTestId('comfort-state')).toContainText(/hot|overheated|dangerous heat/i);
});

test('how it works page passes axe', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('./#/how-it-works');
  await expect(page.getByRole('heading', { name: 'How this works' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
