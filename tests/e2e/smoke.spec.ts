import { expect, test } from '@playwright/test';

test('app shell loads with attribution and disclaimer', async ({ page }) => {
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
