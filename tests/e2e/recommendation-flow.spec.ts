import { expect, test } from '@playwright/test';

test('scout can search for a target player and see recommendations', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /QuickScout Football Recommender/i })).toBeVisible();

  await page.getByLabel('Target player name').fill('salah');
  await expect(page.getByRole('button', { name: /Mohamed Salah/i })).toBeVisible();
  await page.getByRole('button', { name: /Mohamed Salah/i }).click();

  await page.getByRole('button', { name: 'Get Recommendations' }).click();

  await expect(page.getByText(/Target:\s*Mohamed Salah/i)).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByText('Score / 100')).toBeVisible();
});
