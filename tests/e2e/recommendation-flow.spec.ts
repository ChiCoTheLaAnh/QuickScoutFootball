import { expect, test } from '@playwright/test';

const targetSearchQuery = process.env.E2E_SEARCH_QUERY?.trim() || 'salah';
const targetName = process.env.E2E_TARGET_NAME?.trim() || 'Mohamed Salah';
const targetProviderSource = process.env.E2E_TARGET_PROVIDER_SOURCE?.trim() || 'seed';
const targetProviderPlayerId = process.env.E2E_TARGET_PROVIDER_PLAYER_ID?.trim() || 'seed-mohamed-salah';
const escapedTargetName = targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('scout can search for a target player and see recommendations', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByRole('heading', { name: /QuickScout Football Recommender/i })).toBeVisible();

  await page.getByLabel('Target player name').fill(targetSearchQuery);
  const targetSuggestion = page
    .getByRole('button', { name: new RegExp(escapedTargetName, 'i') })
    .filter({ hasText: `${targetProviderSource} #${targetProviderPlayerId}` });
  await expect(targetSuggestion).toHaveCount(1);
  await expect(targetSuggestion).toBeVisible();
  await targetSuggestion.click();

  await page.getByRole('button', { name: 'Get Recommendations' }).click();

  await expect(page.getByText(new RegExp(`Target:\\s*${escapedTargetName}`, 'i'))).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByText('Score / 100')).toBeVisible();

  const currentDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Current CSV' }).click();
  const currentDownload = await currentDownloadPromise;
  expect(currentDownload.suggestedFilename()).toBe('quickscout-current-results.csv');

  await expect(page.getByRole('heading', { name: 'Shortlist' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Shortlist' }).first().click();
  await expect(page.getByText('1 candidates selected for comparison.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.getByText('No shortlisted candidates yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add to Shortlist' }).first().click();

  const shortlistDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Shortlist CSV' }).click();
  const shortlistDownload = await shortlistDownloadPromise;
  expect(shortlistDownload.suggestedFilename()).toBe('quickscout-shortlist.csv');

  await expect(page.getByRole('heading', { name: 'Run History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: targetName }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open Run' }).first().click();

  await expect(page.getByRole('heading', { name: 'Run Detail' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay Filters' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Replay' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Run CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('results.csv');
});
