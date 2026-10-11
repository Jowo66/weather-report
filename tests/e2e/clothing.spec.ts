import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockOpenMeteo } from './support';

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => localStorage.clear());
  await mockOpenMeteo(page);
  await page.goto('./#/?c=43.70,-79.42&n=Toronto&o=t_shirt,jeans,socks,sneakers&a=standing');
  await expect(page.getByTestId('perceived')).toBeVisible();
});

test('putting on a winter coat updates number, zones and URL quickly', async ({ page }) => {
  const before = await page.getByTestId('perceived').textContent();
  const torsoBefore = await page.getByTestId('zone-torso').textContent();
  await page.getByRole('button', { name: '+ Add clothes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wardrobe' });
  await expect(dialog).toBeVisible();

  const coat = dialog.getByRole('button', { name: /Winter coat/ });
  const elapsed = await page.evaluate(async () => {
    const btn = [
      ...document.querySelectorAll<HTMLButtonElement>('dialog button[aria-pressed]'),
    ].find((b) => b.textContent?.includes('Winter coat'))!;
    const el = document.querySelector('[data-testid="perceived"]')!;
    const before = el.textContent;
    const t0 = performance.now();
    btn.click();
    return await new Promise<number>((resolve) => {
      const check = () =>
        el.textContent !== before ? resolve(performance.now() - t0) : requestAnimationFrame(check);
      check();
    });
  });
  // TDD §14 budget: 50 ms (≈ 20 ms locally, measured to the next frame). 2× headroom for CI runners.
  expect(elapsed).toBeLessThan(100);
  console.info(`toggle → new number: ${elapsed.toFixed(1)} ms`);
  await expect(coat).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('perceived')).not.toHaveText(before!);
  await expect(page.getByTestId('zone-torso')).not.toHaveText(torsoBefore!);
  await expect(page).toHaveURL(/o=[^&]*winter_coat/);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('outfit-tray')).toContainText('Winter coat');
});

test('slot conflicts swap with an announcement', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add clothes' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Thermal top/ })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Replaced T-shirt with Thermal top.' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: /T-shirt/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('wardrobe grid is keyboard operable', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add clothes' }).click();
  const dialog = page.getByRole('dialog');
  const first = dialog.locator('button[aria-pressed]').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const focused = dialog.locator('button[aria-pressed]:focus');
  await expect(focused).toHaveCount(1);
  const pressedBefore = await focused.getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(focused).not.toHaveAttribute('aria-pressed', pressedBefore!);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('toggles change the number', async ({ page }) => {
  const p = page.getByTestId('perceived');
  const standing = await p.textContent();
  await page.getByRole('radio', { name: 'Walking' }).check();
  await expect(p).not.toHaveText(standing!);
  const walking = await p.textContent();
  await page.getByRole('slider').fill('3');
  await expect(p).not.toHaveText(walking!);
});

test('recommend button applies the suggestion', async ({ page }) => {
  const card = page.getByTestId('recommendation');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Wear this' }).click();
  await expect(card.getByRole('button', { name: /wearing it/ })).toBeDisabled();
  await expect(page.getByTestId('comfort-state')).toBeVisible();
});

test('now and wardrobe pass axe with zones and avatar', async ({ page }) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '+ Add clothes' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Wardrobe' }).click();
  await expect(page.getByTestId('wardrobe')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
