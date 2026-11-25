'use client';
import Link from 'next/link';
import {useRef, useState} from 'react';
type Dataset = typeof import('./synthetic.json');
import './style.css';
import {components as parts, preferenceScore, shortlistOrder} from '@/src/lib/recruitment/v3-ranking';

const labels: Record<string,string> = {baseline_a:'Goals + assists /90',baseline_b:'Original similarity',v2:'QuickScout V2',advanced_similarity:'Advanced similarity',v3:'QuickScout V3'};
type Profile = Dataset["profiles"][number];
const format = (n:number)=>n.toFixed(2);
function point(i:number, radius:number){
  const angle = i*2*Math.PI/7-Math.PI/2;
  return [150+radius*Math.cos(angle),125+radius*Math.sin(angle)];
}
function shape(p: Profile, axes: [string, string[]][], metrics: Dataset["metrics"]){
  return axes.map(([,keys],i)=>point(i,keys.reduce((sum,k)=>sum+p.pct[metrics.findIndex(m=>m.key===k)],0)/keys.length)).join(' ');
}

export default function Workspace({data}: {data: Dataset}){
  const rows: Record<string,Record<string,number>> = data.rows;
  const axes = Object.entries(data.axes);
  const target = data.profiles[0];
  const [id,select]=useState('SIM-198');
  const [weights,setWeights]=useState([40,40,20]);
  const [method,setMethod]=useState('v3');
  const [showTarget,toggle]=useState(true);
  const [scenario,setScenario]=useState('equal thirds');
  const total=weights.reduce((a,b)=>a+b);
  const score=(r:Record<string,number>)=>preferenceScore(r,weights);
  const ids=shortlistOrder(rows,method,weights);
  const p=data.profiles.find(profile => profile.id === id)!;
  const r=rows[id];
  const extremes=p.pct.map((v,i)=>({v,i})).filter(x=>!['minutes','starts'].includes(data.metrics[x.i].key)).sort((a,b)=>b.v-a.v);
  const sens=data.sensitivity[scenario as keyof typeof data.sensitivity];
  const tabs = ['Overview','Statistical Profile','Comparison','Model Analysis'];
  const [tab,setTab] = useState('Overview');
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('measure');
  const [descending,setDescending] = useState(true);
  const [mobileReport,setMobileReport] = useState(false);
  const [groups,setGroups] = useState<string[]>(['Scoring threat']);
  const list = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const savedScroll = useRef(0);
  const groupOf = (name:string) => ({'Shooting and finishing':'Scoring threat','Chance creation':'Chance creation','Ball progression':'Ball progression'}[name] ?? name);
  const ranks = new Map(ids.map((key,i)=>[key,i+1]));
  const order = ids.filter(key=>key.toLowerCase().includes(query.toLowerCase().trim())).sort((a,b)=>{
    const diff = sort==='measure' ? ranks.get(a)!-ranks.get(b)! : rows[b][sort]-rows[a][sort];
    return (descending?diff:-diff)||a.localeCompare(b);
  });
  const measure = (key:string) => method==='v3'?score(rows[key]):method==='baseline_b'?-rows[key][method]:rows[key][method];
  const pick = (key:string) => {
    if (list.current?.offsetHeight) savedScroll.current = list.current.scrollTop;
    select(key);
    setMobileReport(true);
    requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));
  };
  const back = () => {
    setMobileReport(false);
    requestAnimationFrame(()=>{
      if(list.current) list.current.scrollTop=savedScroll.current;
      list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll:true});
    });
  };
  const metricIndex = (key:string)=>data.metrics.findIndex(m=>m.key===key);
  const creation = metricIndex('xag90'), box = metricIndex('box90');
  const measureLabels: Record<string,string> = {baseline_a:'G+A /90',baseline_b:'Distance ↓',v2:'V2 /100',advanced_similarity:'Similarity',v3:'V3 /100'};
  const measureLabel = measureLabels[method];
  return <main className="vthree" data-mobile-report={mobileReport}>
    <header className="brief"><Link href="/dashboard/recruitment">← Recruitment brief</Link><strong>Right-wing recruitment</strong><span>€45m ceiling · {ids.length} candidates</span><small>Synthetic demo</small></header>
    <div className="layout"><aside><h2>Shortlist</h2><label>Rank by<select value={method} onChange={e=>setMethod(e.target.value)}>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <input type="search" aria-label="Search shortlist" placeholder="Search candidate ID" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="sort"><label>Sort by<select value={sort} onChange={e=>{setSort(e.target.value);setDescending(e.target.value==='measure'||e.target.value==='minutes')}}>{[['measure','Active ranking'],['age_years','Age'],['value_eur','Estimated value'],['minutes','Minutes']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button onClick={()=>setDescending(!descending)} aria-label="Reverse shortlist order">{(sort==='measure'&&method==='baseline_b'?!descending:descending)?'Descending ↓':'Ascending ↑'}</button></div>
    <div className="row labels"><span>#</span><span>Player</span><span>Age</span><span>Value</span><span>{measureLabel}</span></div>
    <div className="list" ref={list}>{order.map(key=><button className="row" key={key} aria-pressed={key===id} onClick={()=>pick(key)}><span>{ranks.get(key)}</span><b data-player-id={key}>{key}</b><span>{rows[key].age_years}</span><span>€{(rows[key].value_eur/1e6).toFixed(1)}m</span><b>{format(measure(key))}</b></button>)}{!order.length&&<p>No matching candidates.</p>}</div></aside>
    <article><button className="back" onClick={back}>← Back to shortlist</button><div className="identity"><p>Right winger · Age {r.age_years}</p><h1 tabIndex={-1} ref={heading}>{id}</h1><p><strong>€{format(r.value_eur/1e6)}m</strong> estimated value　·　{r.minutes.toLocaleString('en-US')} minutes　·　{r.starts} starts</p><b>#{ranks.get(id)} of {ids.length} · {labels[method]}</b></div>
    <div role="tablist" aria-label="Player report" className="tabs">{tabs.map((name,i)=><button key={name} id={'tab-'+i} role="tab" aria-controls={'panel-'+i} aria-selected={tab===name} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={e=>{
      const dest=({ArrowRight:(i+1)%4,ArrowLeft:(i+3)%4,Home:0,End:3})[e.key as 'Home'];
      if(dest!==undefined){e.preventDefault();setTab(tabs[dest]);document.getElementById('tab-'+dest)?.focus()}
    }}>{name}</button>)}</div>
    <div role="tabpanel" id={'panel-'+tabs.indexOf(tab)} aria-labelledby={'tab-'+tabs.indexOf(tab)}>
    {tab==='Overview'&&<><section><h2>Chance creation &amp; box involvement</h2><p className="finding">{id} creates <strong>{p.values[creation].toFixed(3)} xAG per 90</strong> against the target’s {target.values[creation].toFixed(3)}. He records <strong>{format(p.values[box])} attacking-box touches per 90</strong> against {format(target.values[box])}.</p>
    <p className="question"><b>Video question</b>After releasing the ball in wide areas, does the player enter the box for the next action or stay available outside?</p><button className="action" onClick={()=>setTab('Comparison')}>Compare with {target.id} →</button></section>
  <section><h2>Performance versus price</h2><p>Green points are Pareto-efficient across price, performance and similarity. Select a point to inspect.</p><svg viewBox="-28 -12 515 235" role="group" aria-label="Performance versus market value">{[0,50,100].map(n=><text key={n} x={9} y={198-185*n/100} textAnchor="end">{n}</text>)}{[0,15,30,45].map(n=><text key={n} x={15+10*n} y={212} textAnchor="middle">€{n}m</text>)}<path d="M15 8 V194 H467" fill="none" stroke="#85988d"/>{Object.entries(rows).map(([key,v])=><circle key={key} role="button" tabIndex={0} aria-label={`Inspect ${key} on price plot`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(key)}}} cx={15+450*v.value_eur/45e6} cy={194-185*v.performance/100} r={key===id?6:4} stroke={key===id?'black':'white'} fill={data.frontier.includes(key)?'#76dfa9':'#9aafa4'} onClick={()=>pick(key)}><title>{`${key} · €${format(v.value_eur/1e6)}m · ${format(v.performance)}`}</title></circle>)}</svg><p>{id} · {data.frontier.includes(id)?'Pareto-efficient':'Dominated on the three benchmark objectives'}</p></section>
</>}
    {tab==='Statistical Profile'&&<section><h2>Season measurements</h2><p>RW percentiles · 169 reference players. Lower miscontrols and dispossessions earn higher percentiles.</p><p>Highest and lowest activity or efficiency percentiles: {[extremes[0],extremes.at(-1)!].map(x=>data.metrics[x.i].label+' · P'+x.v.toFixed(1)).join(' / ')}.</p>
    <button className="action" onClick={()=>setGroups(groups.length===8?[]:[...Object.keys(data.axes),'Availability'])}>{groups.length===8?'Collapse all':'Expand all'}</button>
    {[...Object.keys(data.axes),'Availability'].map(group=><div key={group}><button className="group" aria-expanded={groups.includes(group)} onClick={()=>setGroups(groups.includes(group)?groups.filter(g=>g!==group):[...groups,group])}>{group}<span>{groups.includes(group)?'−':'+'}</span></button>{groups.includes(group)&&<table><thead><tr><th>Measurement</th><th>Season value</th><th>RW percentile</th></tr></thead><tbody>{data.metrics.map((m,i)=>groupOf(m.group)===group&&<tr key={m.key}><td>{m.label}</td><td>{format(p.values[i])} {m.unit}</td><td><progress aria-label={m.label+' peer percentile'} max="100" value={p.pct[i]}/> P{p.pct[i].toFixed(1)}</td></tr>)}</tbody></table>}</div>)}</section>}
    {tab==='Comparison'&&<section><h2>{id} against {target.id}</h2><p>{r.minutes} candidate minutes · {target.values[metricIndex('minutes')]} target minutes. Axes show mean percentiles for each dimension’s retained features.</p>
<label><input type="checkbox" checked={showTarget} onChange={e=>toggle(e.target.checked)}/> Compare with SIM-000 · dashed outline</label><svg viewBox="-65 0 430 250" role="img" aria-label="Seven dimension percentile radar">{[25,50,75,100].map(n=><polygon key={n} points={axes.map((_,i)=>point(i,n)).join(' ')} fill="none" stroke="#52635a"/>)}{axes.map(([k],i)=><text key={k} x={point(i,113)[0]} y={point(i,113)[1]} textAnchor="middle">{k}</text>)}<polygon points={shape(p, axes, data.metrics)} fill="#76dfa933" stroke="#76dfa9"/>{showTarget&&<polygon points={shape(target, axes, data.metrics)} fill="none" stroke="#f0ae73" strokeDasharray="4 3"/>}</svg>
    <table><thead><tr><th>Measurement</th><th>{id}</th><th>{target.id}</th></tr></thead><tbody>{data.metrics.map((m,i)=><tr key={m.key}><td>{m.label} ({m.unit})</td><td>{format(p.values[i])}</td><td>{format(target.values[i])}</td></tr>)}</tbody></table></section>}
    {tab==='Model Analysis'&&<><section><h2>Recruitment preferences</h2><p>Adjusted V3 rank <strong>#{shortlistOrder(rows,'v3',weights).indexOf(id)+1}</strong> · Default #{r.v3_rank} · Adjusted score <output>{format(score(r))}</output> /100</p>
    <table><thead><tr><th>Component</th><th>Score</th><th>Weight</th><th>Points</th></tr></thead><tbody>{parts.map((k,i)=><tr key={k}><th>{k}</th><td>{format(r[k])}</td><td><label>{(100*weights[i]/total).toFixed(1)}% <input aria-label={k} type="range" min="0" max="100" value={weights[i]} onChange={e=>{const next=weights.map((w,j)=>j===i?+e.target.value:w);if(next.some(Boolean))setWeights(next)}}/></label></td><td>{format(r[k]*weights[i]/total)}</td></tr>)}</tbody></table><p>Weights normalize to 100%. Performance and similarity share npxG and xAG. Feasibility averages affordability and youth.</p></section>
  <section><h2>Benchmark agreement</h2><p>Frozen 40/40/20 benchmark · 108 common candidates</p><div className="scroll"><table><thead><tr>{['Methods','Spearman','Kendall','Shared top 5 / 10 / 20'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{data.pairs.map(b=><tr key={b.first+b.second}><td>{labels[b.first]} × {labels[b.second]}</td><td>{format(b.spearman)}</td><td>{format(b.kendall_tau_b)}</td><td>{[b.overlap_5,b.overlap_10,b.overlap_20].join(' / ')}</td></tr>)}</tbody></table></div><label>Sensitivity scenario<select value={scenario} onChange={e=>setScenario(e.target.value)}>{Object.keys(data.sensitivity).map(k=><option key={k}>{k}</option>)}</select></label><p>{sens.overlap_10}/10 retained · Largest movement {sens.max_move} ranks · Spearman {format(sens.spearman)}</p></section></>}</div></article></div></main>
}
