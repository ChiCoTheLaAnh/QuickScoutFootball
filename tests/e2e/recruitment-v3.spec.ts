import {test, expect} from './browser-checks';
import data from '../../app/dashboard/recruitment/v3/synthetic.json';

for (const width of [1400,390]) {
  test(`recruitment walkthroughs at ${width}px`, async ({page})=>{
    const mobile = width===390;
    await page.setViewportSize({width,height:900});
    await page.goto('/dashboard/recruitment/v3');
    const search = page.getByRole('searchbox');
    const shortlist = page.locator('aside .list button');
    const back = page.getByRole('button',{name:'Back to shortlist',exact:false});
    const tab = (name:string)=>page.getByRole('tab',{name,exact:true});
    const capture = async (name:string)=>{
      await expect(page.getByRole('heading',{name:'SIM-198',exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`.tmp/ux-review/${width}-${name}.png`});
    };

    await expect(shortlist.first()).toContainText('SIM-198');
    // Preserve the server-rendered input while Chromium captures the initial shortlist.
    if(mobile) await page.screenshot({caret:'initial',path:'.tmp/ux-review/390-shortlist.png'});
    await search.fill('198');
    await expect(shortlist).toHaveCount(1);
    await shortlist.first().click();
    await expect(page.getByRole('slider')).toHaveCount(0);
    await expect(page.getByText('Video question',{exact:true})).toBeVisible();
    await capture('overview');

    await tab('Statistical Profile').click();
    await capture('profile');
    await page.getByRole('button',{name:'Expand all'}).click();
    const profile=data.profiles.find(p=>p.id==='SIM-198')!;
    await expect(page.locator('progress')).toHaveCount(24);
    for(const [i,m] of data.metrics.entries()){
      await expect(page.getByRole('progressbar',{name:m.label+' peer percentile',exact:true})).toHaveAttribute('value',String(profile.pct[i]));
    }
    await tab('Comparison').click();
    await capture('comparison');
    await expect(page.locator('polygon[stroke-dasharray]')).toHaveCount(1);
    await page.getByRole('checkbox').uncheck();
    await expect(page.locator('polygon[stroke-dasharray]')).toHaveCount(0);
    await expect(page.getByRole('cell',{name:'0.54',exact:true}).first()).toBeVisible();
    await tab('Model Analysis').click();
    await capture('model');
    await page.getByRole('slider',{name:'similarity',exact:true}).press('Home');
    await page.getByRole('slider',{name:'feasibility',exact:true}).press('Home');
    await expect(page.locator('output')).toHaveText(data.rows['SIM-198'].performance.toFixed(2));
    await expect(page.getByText('Frozen 40/40/20 benchmark',{exact:false})).toBeVisible();
    if(mobile) await back.click();
    await expect(search).toHaveValue('198');
    await search.fill('');
    for(const key of ['baseline_a','baseline_b','v2','advanced_similarity','v3'] as const){
      await page.getByLabel('Rank by').selectOption(key);
      const field=key==='v3'?'performance':key;
      const ordered=Object.entries(data.rows).sort(([a,x],[b,y])=>y[field]-x[field]||a.localeCompare(b));
      await expect(shortlist.locator('[data-player-id]')).toHaveText(ordered.map(([id])=>id));
    }
    for(const field of ['age_years','value_eur','minutes'] as const){
      await page.getByLabel('Sort by').selectOption(field);
      const ordered=Object.entries(data.rows).sort(([a,x],[b,y])=>(field==='minutes'?y[field]-x[field]:x[field]-y[field])||a.localeCompare(b));
      await expect(shortlist.locator('[data-player-id]')).toHaveText(ordered.map(([id])=>id));
    }
    await shortlist.first().click();
    await tab('Overview').click();
    const id=data.frontier[0];
    await page.getByRole('button',{name:`Inspect ${id} on price plot`}).press('Enter');
    await expect(page.getByRole('heading',{name:id,exact:true})).toBeVisible();
    await expect(page.getByText(`${id} · Pareto-efficient`,{exact:true})).toBeVisible();
  });
}
