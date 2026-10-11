import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockOpenMeteo } from './support';

const STATES = [
  'freezing',
  'very_cold',
  'cold',
  'chilly',
  'cool',
  'comfortable',
  'warm',
  'hot',
  'overheated',
  'dangerous_heat',
];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.clear());
});

async function shotQa(page: Page, state: string, mode: '2d' | '3d') {
  await page.goto(`./#/dev/avatar-qa?state=${state}&mode=${mode}`);
  await page.reload();
  const el = mode === '3d' ? page.getByTestId('avatar-3d') : page.locator('svg.avatar2d');
  await el.waitFor();
  await page.waitForTimeout(mode === '3d' ? 600 : 100);
  return el.screenshot();
}

test('3D avatar renders on the Now screen within the draw-call budget', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto(
    './#/?c=43.70,-79.42&n=Toronto&o=thermal_top,sweater,winter_coat,thermal_bottoms,jeans,toque,scarf,gloves,wool_socks,winter_boots&a=walking',
  );
  const avatar = page.getByTestId('avatar-3d');
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute('role', 'img');
  await expect(avatar).toHaveAttribute('aria-label', /^Avatar looking /);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __wrAvatar?: { drawCalls: number } }).__wrAvatar?.drawCalls ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const calls = await page.evaluate(
    () => (window as unknown as { __wrAvatar: { drawCalls: number } }).__wrAvatar.drawCalls,
  );
  expect(calls).toBeLessThanOrEqual(30); // TDD §14
});

test('every comfort state is visually distinct with reduced motion (3D and 2D)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 420, height: 800 });
  for (const mode of ['3d', '2d'] as const) {
    const shots = new Map<string, string>();
    for (const s of STATES) shots.set(s, (await shotQa(page, s, mode)).toString('base64'));
    const unique = new Set(shots.values());
    expect(unique.size, `${mode}: distinct renders`).toBe(STATES.length);
  }
});

test('reduced motion holds a static pose (no animation between frames)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 420, height: 800 });
  const a = await shotQa(page, 'freezing', '3d');
  await page.waitForTimeout(700);
  const b = await page.getByTestId('avatar-3d').screenshot();
  expect(a.equals(b)).toBe(true);
});

test('full motion animates (shiver) between frames', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  const a = await shotQa(page, 'freezing', '3d');
  await page.waitForTimeout(350);
  const b = await page.getByTestId('avatar-3d').screenshot();
  expect(a.equals(b)).toBe(false);
});

test('falls back to the 2D avatar without WebGL', async ({ page, context }) => {
  await context.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await mockOpenMeteo(page);
  await page.goto('./#/?c=43.70,-79.42&n=Toronto');
  await expect(page.locator('svg.avatar2d')).toBeVisible();
  await expect(page.getByTestId('avatar-3d')).toHaveCount(0);
});

test('character creator changes appearance but never the number', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('./#/?c=43.70,-79.42&n=Toronto');
  const n = await page.getByTestId('perceived').textContent();
  await page.getByRole('link', { name: 'Avatar' }).click();
  await page.getByRole('radio', { name: 'Tone 9' }).check();
  await page.getByRole('radio', { name: 'Heavyset' }).check();
  await page.getByRole('radio', { name: 'Senior' }).check();
  await page.getByRole('radio', { name: 'Ponytail' }).check();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Now' }).click();
  await expect(page.getByTestId('perceived')).toHaveText(n!);
  await page.getByRole('link', { name: 'Avatar' }).click();
  await page.getByRole('slider', { name: /I run/ }).fill('2');
  await page.getByRole('link', { name: 'Now' }).click();
  await expect(page.getByTestId('perceived')).not.toHaveText(n!);
});
