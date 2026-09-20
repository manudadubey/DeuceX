import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Step 0.5 acceptance checks (docs/BUILD-PLAN-CLAUDE-CODE.md): navigation works, the bare
// shell (signin, onboarding, coach) renders without a sidebar/topbar, and nothing here
// scrolls sideways at 390px. The app shell itself (sidebar, topbar, tab bar) is gated on a
// real session and covered instead by the component tests in components/shell/*.test.tsx —
// there's no way to mint a real Supabase session from this suite without either a live
// email click-through or forging a JWT, neither of which belongs in a test.
test.describe('unauthenticated routing', () => {
  test('/ redirects to /signin', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('the bare shell has no password field anywhere (M-ID-1)', async ({ page }) => {
    for (const path of ['/signin', '/onboarding']) {
      await page.goto(path);
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    }
  });
});

test.describe('bare shell · no horizontal scroll at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of ['light', 'dark'] as const) {
    for (const path of ['/signin', '/onboarding', '/coach/preview-token']) {
      test(`${path} · ${theme} theme`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(path);

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });
    }
  }
});

test.describe('accessibility', () => {
  test('sign-in page has no automatically detectable violations', async ({ page }) => {
    await page.goto('/signin');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
