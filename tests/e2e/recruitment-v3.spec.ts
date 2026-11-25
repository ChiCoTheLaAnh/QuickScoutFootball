import { test, expect } from './browser-checks';
import data from '../../app/dashboard/recruitment/v3/synthetic.json';

for (const width of [1400, 390]) {
  test(`synthetic scouting controls at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await page.goto('/dashboard/recruitment/v3');
    const profile = data.profiles.find(p => p.id === 'SIM-001')!;
    await page.locator('aside').getByRole('button', { name: /SIM-001/ }).click();
    await expect(page.getByRole('heading', {name:'SIM-001'})).toBeVisible();
    const bars = page.locator('progress');
    await expect(bars).toHaveCount(24);
    for (const [i, percentile] of profile.pct.entries()) {
      await expect(bars.nth(i)).toHaveAttribute('value', String(percentile));
    }
    const target = page.locator('polygon[stroke-dasharray]');
    await expect(target).toHaveCount(1);
    await page.getByRole('checkbox').uncheck();
    await expect(target).toHaveCount(0);
    await page.getByRole('slider', {name:'similarity', exact:true}).press('Home');
    await page.getByRole('slider', {name:'feasibility', exact:true}).press('Home');
    await expect(page.locator('summary')).toContainText(data.rows['SIM-001'].performance.toFixed(2));
    const ordered = Object.entries(data.rows);
    const shortlist = page.locator('aside button');
    for (const key of ['v3','baseline_a','baseline_b','v2','advanced_similarity'] as const) {
      await page.getByLabel('Rank by').selectOption(key);
      const field = key === 'v3' ? 'performance' : key;
      const expected = [...ordered].sort(([a,x],[b,y]) => y[field]-x[field] || a.localeCompare(b));
      await expect.poll(async () => await shortlist.locator('[data-player-id]').allTextContents())
        .toEqual(expected.map(([id])=>id));
    }
    const frontierId = data.frontier[0];
    await page.getByRole('button',{name:`Inspect ${frontierId} on price plot`}).press('Enter');
    await expect(page.getByRole('heading',{name:frontierId})).toBeVisible();
    await expect(page.getByText(`${frontierId} · Pareto-efficient`,{exact:true})).toBeVisible();
    await page.locator('header').scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.tmp/v3-preview/${width}.png`});
  });
}
