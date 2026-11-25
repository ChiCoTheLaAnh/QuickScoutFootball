import {expect,test} from './browser-checks';
import artifact from '../../research/wyscout2017/release/wyscout-salah-2017-18.v1.json';

for(const width of [1400,390]){
  test('Wyscout study and separate simulation at '+width,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/dashboard/recruitment');
    const buttons=page.locator('aside .list button');
    const named=buttons.locator('b');
    const candidates=artifact.profiles.filter(p=>p.ranks);
    for(const method of ['npg','attack','cosine','euclidean','category'] as const){
      await page.getByLabel('Rank by').selectOption(method);
      const sorted=[...candidates].sort((a,b)=>a.ranks![method]-b.ranks![method]||a.id-b.id);
      await expect(named).toHaveText([...sorted.map(p=>p.name),'R. Sterling']);
      await page.getByRole('button',{name:'Reverse order'}).click();
      const reversed=sorted.sort((a,b)=>b.ranks![method]-a.ranks![method]||a.id-b.id);
      await expect(named).toHaveText([...reversed.map(p=>p.name),'R. Sterling']);
    }
    await page.getByRole('searchbox').fill('Real Madrid');
    await buttons.filter({hasText:'Cristiano Ronaldo'}).click();
    const player=artifact.profiles.find(p=>p.name==='Cristiano Ronaldo')!;
    await expect(page.getByText(player.videoQuestion!)).toBeVisible();
    await page.getByRole('tab',{name:'Statistical Profile'}).click();
    for(const m of artifact.metrics){
      const k=m.key as keyof typeof player.values;
      const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:player.values[k]!.toFixed(2)+' '+m.unit,exact:true})});
      await expect(row.filter({hasText:m.label})).toBeVisible();
    }
    await page.getByRole('tab',{name:'Comparison'}).click();
    await expect(page.getByRole('img',{name:/six dimensions/i})).toBeVisible();
    await page.getByRole('tab',{name:'Model Analysis'}).click();
    await page.getByText('All 27 robustness comparisons').click();
    await expect(page.getByRole('rowheader',{name:'Salah 2907 minutes'})).toBeVisible();
    if(width===390)await page.getByRole('button',{name:/Back to shortlist/}).click();
    await page.getByRole('searchbox').fill('Sterling');
    await buttons.first().click();
    await page.getByRole('tab',{name:'Statistical Profile'}).click();
    await expect(page.getByRole('row').filter({hasText:'Non-penalty goals'})).toContainText('Unavailable');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('link',{name:/V3 simulation/}).click();
    await expect(page.getByText('Synthetic demo',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:/Real-world Salah study/}).click();
    await expect(page.getByText('Retrospective similarity study · Wyscout')).toBeVisible();
  });
}
