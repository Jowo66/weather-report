import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mockOpenMeteo } from './support';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('wr-test-init')) {
      localStorage.clear();
      sessionStorage.setItem('wr-test-init', '1');
    }
  });
});

test('backdrop matches conditions automatically, with a manual override', async ({ page }) => {
  await mockOpenMeteo(page);
  // Synthetic Toronto fixture: snow on the ground → arctic.
  await page.goto('./#/?c=43.70,-79.42&n=Toronto');
  await expect(page.getByTestId('avatar-3d')).toHaveAttribute('data-backdrop', 'arctic');
  // Synthetic Phoenix fixture: hot, clear, daytime → beach.
  await page.goto('./#/?c=33.45,-112.07&n=Phoenix');
  await expect(page.getByTestId('avatar-3d')).toHaveAttribute('data-backdrop', 'beach');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __wrAvatar?: { currentBackdrop: string } }).__wrAvatar
            ?.currentBackdrop,
      ),
    )
    .toBe('beach');
  // Manual override.
  await page.getByRole('link', { name: 'Avatar' }).click();
  await page.getByRole('radio', { name: 'City' }).check();
  await page.getByRole('link', { name: 'Now' }).click();
  await expect(page.getByTestId('avatar-3d')).toHaveAttribute('data-backdrop', 'city');
});

test('calibration changes the number only when enabled, and exports a playtest CSV', async ({
  page,
}) => {
  await mockOpenMeteo(page);
  await page.goto('./#/?c=43.70,-79.42&n=Toronto&o=t_shirt,hoodie,jeans,socks,sneakers');
  const before = await page.getByTestId('perceived').textContent();
  await page.goto('./#/dev/calibration');
  await expect(page.getByTestId('cal-compare')).toContainText('model says');
  await page.getByRole('slider', { name: /Wind penetration, permeable/ }).fill('0');
  await page.getByRole('link', { name: 'Now' }).click();
  await expect(page.getByTestId('perceived')).toHaveText(before!); // not enabled yet
  await page.goto('./#/dev/calibration');
  await page.getByRole('switch', { name: 'Use calibrated values across the app' }).check();
  await page.getByRole('link', { name: 'Now' }).click();
  await expect(page.getByTestId('perceived')).not.toHaveText(before!);

  await page.goto('./#/dev/calibration');
  await page.getByRole('radio', { name: 'Slightly cool' }).check();
  await page.getByRole('button', { name: 'Log this' }).click();
  await expect(page.getByTestId('log-count')).toHaveText('1 entries');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^weather-report-playtest-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv.split('\n')[0]).toContain('perceivedDefault');
  expect(csv).toContain('t_shirt hoodie jeans socks sneakers');
  expect(csv).toContain(',-1,30,');
});
