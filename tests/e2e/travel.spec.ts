import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockOpenMeteo } from './support';

function iso(daysFromNow: number) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.clear());
});

test('a 10-day trip produces per-day outfits and a packing list with missing-item detection', async ({
  page,
}) => {
  const calls = await mockOpenMeteo(page);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text());
  });
  await page.goto('./#/travel');
  await page.getByRole('combobox', { name: 'Destination' }).fill('Toronto');
  await page.getByRole('option', { name: 'Toronto, Ontario, Canada' }).click();
  await page.getByLabel('Start').fill(iso(40));
  await page.getByLabel('End').fill(iso(49));
  await page.getByRole('radio', { name: 'Mostly walking' }).check();

  await expect(page.getByTestId('trip-day')).toHaveCount(10);
  await expect(page.getByTestId('trip-day').first()).toContainText('Typical, not forecast');
  await expect(page.getByTestId('trip-summary')).toContainText(
    /Typically .* rain on ~\d+ of 10 days/,
  );
  expect(calls.archive).toBe(10); // one request per year of normals

  const list = page.getByTestId('packing-list');
  await expect(list).toBeVisible();
  await expect(page.getByTestId('missing')).toBeVisible();
  // Pack everything → nothing missing.
  for (const plus of await list.getByRole('button', { name: /^One more / }).all()) {
    const label = (await plus.getAttribute('aria-label'))!.replace('One more ', '');
    const needed = Number(
      (await list.getByText(new RegExp(`^${label} × \\d+$`)).textContent())?.match(
        /× (\d+)/,
      )?.[1] ?? 1,
    );
    for (let i = 0; i < needed; i++) await plus.click();
  }
  for (const cb of await list.getByRole('checkbox').all()) await cb.check();
  await expect(page.getByTestId('all-packed')).toBeVisible();
  await list
    .getByRole('button', { name: /^One fewer / })
    .first()
    .click();
  await expect(page.getByTestId('missing')).toBeVisible();
  await expect(page.locator('.day-short').first()).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('compare up to 3 cities side by side', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('./#/compare');
  const search = () => page.getByRole('combobox', { name: /Add a city/ });
  await search().fill('Toronto');
  await page.getByRole('option', { name: 'Toronto, Ontario, Canada' }).click();
  await search().fill('Phoenix');
  await page.getByRole('option', { name: /Phoenix/ }).click();
  await search().fill('Toronto');
  await page.getByRole('option', { name: 'Toronto, Ohio, United States' }).click();
  const cols = page.getByTestId('compare-col');
  await expect(cols).toHaveCount(3);
  await expect(cols.nth(0)).toContainText('Wear:');
  await expect(cols.nth(1)).toContainText(/You’ll feel .* over the next 24 h/);
  await expect(page.getByText('Comparing 3 cities')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Remove Phoenix' }).click();
  await expect(cols).toHaveCount(2);
});
