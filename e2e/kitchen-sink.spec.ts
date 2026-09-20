import { expect, test } from '@playwright/test';

// Step 0.4 acceptance check (docs/BUILD-PLAN-CLAUDE-CODE.md): the Baseline port must not
// scroll sideways at 390px, in either theme.
test.describe('kitchen sink · no horizontal scroll at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/kitchen-sink');
      await expect(page.getByRole('heading', { name: 'Kitchen sink' })).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
