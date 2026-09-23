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

// Step 2.3: the coach/manager view (/coach/[token]) and the account-
// deletion confirm page are the two bare-shell routes this step adds, both
// reachable with no session — the same reason this file's own routes are
// covered here rather than a real Playwright login flow (see the top-of-
// file comment: no way to mint a real Supabase session from this suite).
test.describe('sharing and account-deletion routes (step 2.3)', () => {
  test('an unknown/revoked/expired coach token shows the generic not-found copy, never a stack trace', async ({
    page,
  }) => {
    await page.goto('/coach/this-token-does-not-exist');
    await expect(page.getByText(/isn.t valid or has expired/i)).toBeVisible();
  });

  test('the account-deletion confirm page with no token shows the invalid-link copy', async ({
    page,
  }) => {
    await page.goto('/account/delete/confirm');
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test('the account-deletion confirm page with a token renders the confirm form, never auto-submitting on GET', async ({
    page,
  }) => {
    await page.goto('/account/delete/confirm?token=preview-token');
    await expect(page.getByRole('button', { name: /confirm account deletion/i })).toBeVisible();
    // A bare GET must never itself call the confirm endpoint (link-scanner
    // safety, matching auth/confirm's own established pattern) — the page
    // is still showing the form, not a redirect to /signin, proving no
    // submission happened on load.
    await expect(page).toHaveURL(/\/account\/delete\/confirm/);
  });
});

test.describe('bare shell · no horizontal scroll at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of ['light', 'dark'] as const) {
    for (const path of [
      '/signin',
      '/onboarding',
      '/coach/preview-token',
      '/account/delete/confirm?token=preview-token',
    ]) {
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
