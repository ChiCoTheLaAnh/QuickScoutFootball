import { expect, test } from '@playwright/test';

test('compare two fictional candidates across all supplied methods on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/recruitment?demo=1');
  await expect(
    page.getByRole('heading', { name: 'Replacing Mohamed Salah' }),
  ).toBeVisible();
  await expect(page.locator('nav').getByText('Synthetic demo')).toBeVisible();
  await expect(page.locator('article').first()).toContainText('Elias Vale');
  for (const name of ['Elias Vale', 'Nico Solren'])
    await page.getByRole('checkbox', { name: 'Compare ' + name }).check();
  await page.getByRole('button', { name: 'Goals + assists / 90' }).click();
  await expect(page.locator('article').first()).toContainText('Nico Solren');
  await page.getByRole('button', { name: 'Statistical similarity' }).click();
  const comparison = page.getByRole('table', {
    name: 'Selected candidate comparison',
  });
  await expect(
    comparison.getByRole('row', { name: /Estimated value/ }),
  ).toContainText('€45M');
  await expect(
    comparison.getByRole('row', { name: /Eligibility/ }),
  ).toContainText('Within brief');
  await expect(
    page.getByRole('checkbox', { name: 'Compare Milo Arden' }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Compare Elias Vale' }).uncheck();
  await page.getByRole('checkbox', { name: 'Compare Milo Arden' }).check();
  await expect(
    comparison.getByRole('row', { name: /Eligibility/ }),
  ).toContainText('Unverified');
  await page.getByText('Scouting notes for Milo Arden').click();
  await expect(
    page.locator('article').getByText('Valuation and assists are unavailable.'),
  ).toBeVisible();
  await expect(page.getByText('Not completed', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('desktop brief identifies the demo and attributes the local case note', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard/recruitment?demo=1');
  await expect(page.locator('nav')).toContainText('Synthetic demo');
  await expect(page.getByText(/All candidate profiles and ranks in this view are fictional/)).toBeVisible();
  await page.getByText('Reported local retrospective findings', { exact: true }).click();
  await expect(page.getByText(/Cloud has not independently reproduced/)).toBeVisible();
});
