'use client';

import Link from 'next/link';
import {useRef,useState} from 'react';
import type {Study,Player,Agreement} from '@/src/lib/recruitment/wyscout';

const methods={category:'Category-weighted distance',npg:'Non-penalty goals /90',attack:'Attacking-output distance',euclidean:'Standardized Euclidean',cosine:'Cosine distance'};
type Method=keyof typeof methods;
const tabs=['Overview','Statistical Profile','Comparison','Model Analysis'] as const;
const definitions={
  npg90:'Goals excluding penalties and own goals per 90 regulation minutes.',
  np_shots90:'Non-penalty shots, including direct free-kick attempts and scoring corners, per 90.',
  sot90:'Shots with a goal or an in-goal destination tag, including penalties, per 90.',
  key_passes90:'Events carrying Wyscout key-pass tag 302 per 90.',
  progressive90:'Completed passes advancing at least ten points on the attacking-direction 0–100 pitch axis per 90.',
  completion_pct:'Completed event-type 8 passes divided by all such attempts, times 100.',
  interceptions90:'Events carrying Wyscout interception tag 1401 per 90.',
};
const fmt=(v:number|null|undefined,d=2)=> v==null?'Unavailable':v.toFixed(d);
const clubs=(p:Player)=>p.clubs.map(c=>c.name).join(' / ');
const methodName=(s:string)=>methods[s as Method]??(s==='pca'?'Exploratory PCA':s);
function Results({rows}:{rows:[string,Agreement][]}){
  return <div className="scroll"><table><thead><tr>{['Comparison','Common N','Spearman','Kendall','Shared top 5 / 10 / 20','Within common pool'].map(x=><th key={x}>{x}</th>)}</tr></thead>
    <tbody>{rows.map(([s,v])=><tr key={s}><th>{s.split(' vs ').map(methodName).join(' vs ')}</th><td>{v.common}</td><td>{fmt(v.spearman,3)}</td><td>{fmt(v.kendall,3)}</td><td>{[v.shared5,v.shared10,v.shared20].join(' / ')}</td><td>{[v.common_shared5,v.common_shared10,v.common_shared20].join(' / ')}</td></tr>)}</tbody></table></div>;
}
function Radar({data,p,target}:{data:Study,p:Player,target:Player}){
  const [overlay,setOverlay]=useState(true);
  const dims=[...new Set(data.metrics.map(m=>m.dimension))];
  const point=(i:number,r:number)=>[185+Math.cos(i*Math.PI/3-Math.PI/2)*r,124+Math.sin(i*Math.PI/3-Math.PI/2)*r];
  function polygon(player:Player){
    const radii=dims.map(dim=>{
      const vals=data.metrics.filter(m=>m.dimension===dim).map(m=>player.percentiles[m.key]);
      return vals.some(n=>n===null)?null:vals.reduce<number>((s,n)=>s+(n??0),0)/vals.length;
    });
    return radii.includes(null)?undefined:radii.map((r,i)=>point(i,r!).join(',')).join(' ');
  }
  return <><label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/> Show Salah · dashed outline</label>
    <svg role="img" aria-label="Six dimensions, mean metric percentile by dimension" viewBox="0 0 370 254">
    {[25,50,75,100].map(r=><polygon key={r} points={dims.map((_,i)=>point(i,r)).join(' ')} fill="none" stroke="#43564c"/>)}
    {overlay&&<polygon points={polygon(target)} fill="none" stroke="#efac76" strokeDasharray="4 3"/>}
    {polygon(p)&&<polygon points={polygon(p)} stroke="#77dfa9" fill="#77dfa933"/>}
    {dims.map((dim,i)=><text key={dim} x={point(i,114)[0]} y={point(i,114)[1]} textAnchor="middle">{dim}</text>)}</svg>
    <p>Axes show mean reference percentiles. Shooting averages two measures. {polygon(p)?'':'Candidate outline unavailable because scoring is missing.'}</p></>;
}
function Credits({data,hash}:{data:Study,hash:string}){
  const a=data.attribution;
  return <footer className="study-credits">Wyscout research release · <a href={a.licenseUrl}>{a.license}</a>
    <details><summary>Sources, limitations and reproduction</summary><p>{a.paper} · <a href={'https://doi.org/'+a.doi}>Research paper</a></p><p>{a.changes}</p>
    <ul>{a.sources.map(s=><li key={s.item}><a href={s.url}>{s.item} v{s.version}</a> · {s.authors.join(', ')}</li>)}</ul>
    <p>Artifact v{data.schemaVersion} · SHA-256 <code>{hash}</code></p>
    <p>From the project root run <code>python3 research/wyscout2017/pipeline.py</code>, then <code>python3 research/wyscout2017/profiling/analyze.py</code> and <code>python3 research/wyscout2017/release/build.py</code>.</p>
    <ul>{data.limitations.map(l=><li key={l}>{l}</li>)}</ul><p>Tactical suitability, recruitment accuracy and time savings remain unevaluated.</p></details></footer>;
}
export default function StudyWorkspace({data,hash}:{data:Study,hash:string}){
  const target=data.profiles.find(p=>p.id===data.targetId)!;
  const [id,select]=useState(data.profiles.find(p=>p.ranks?.category===1)!.id);
  const [method,setMethod]=useState<Method>('category');
  const [sort,setSort]=useState('rank');
  const [reverse,setReverse]=useState(false);
  const [query,search]=useState('');
  const [tab,setTab]=useState<typeof tabs[number]>('Overview');
  const [mobile,report]=useState(false);
  const list=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const p=data.profiles.find(p=>p.id===id)!;
  const ordered=data.profiles.filter(r=>r.id!==target.id && (r.name+' '+clubs(r)).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>{
    if(!a.ranks||!b.ranks)return Number(!a.ranks)-Number(!b.ranks);
    const diff=sort==='rank'?a.ranks[method]-b.ranks[method]:sort==='name'?a.name.localeCompare(b.name):b[sort as 'minutes'|'starts'|'wideShare']-a[sort as 'minutes'|'starts'|'wideShare'];
    return (reverse?-diff:diff)||a.id-b.id;
  });
  const gaps=p.squaredContributions;
  const byGap=gaps?[...data.metrics].sort((a,b)=>gaps[a.key]-gaps[b.key]):[];
  function evidence(m:Study['metrics'][number]){
    return <>{m.label}: <strong>{fmt(p.values[m.key])}</strong> against Salah’s {fmt(target.values[m.key])} {m.unit}.</>;
  }
  return <main className="vthree" data-mobile-report={mobile}>
    <header className="brief"><strong>Salah · Big Five 2017/18</strong><span>Retrospective similarity study · Wyscout</span><small><Link href="/dashboard/recruitment/v3">V3 simulation →</Link></small></header>
    <div className="layout"><aside className="study-controls"><h2>Shortlist</h2><label>Rank by <select value={method} onChange={e=>{setMethod(e.target.value as Method);setSort('rank');setReverse(false)}}>{Object.entries(methods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <input type="search" aria-label="Search players or clubs" placeholder="Search player or club" value={query} onChange={e=>search(e.target.value)}/>
    <div className="sort"><label>Sort by <select value={sort} onChange={e=>{setSort(e.target.value);setReverse(false)}}>{Object.entries({rank:'Active ranking',minutes:'Minutes',starts:'Starts',wideShare:'Wide involvement',name:'Name'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button onClick={()=>setReverse(!reverse)} aria-pressed={reverse}>Reverse order</button></div>
    <div className="row labels study-row"><span>#</span><span>Player / exposure</span><span>{method==='npg'?'NPG/90':'Distance'}</span></div>
    <div className="list" ref={list}>{ordered.map(r=><button key={r.id} className="row study-row" aria-pressed={r.id===id} onClick={()=>{select(r.id);report(true);requestAnimationFrame(()=>heading.current?.focus())}}>
      <span>{r.ranks?.[method]??'—'}</span><span className="who"><b>{r.name}</b><small>{clubs(r)}</small><small>{r.minutes} min · {r.starts} starts · {fmt(100*r.wideShare,0)}% wide</small></span><span>{r.scores?fmt(r.scores[method],3):'Unranked'}</span></button>)}{!ordered.length&&<p>No matching players.</p>}</div></aside>
    <article><button className="back" onClick={()=>{report(false);requestAnimationFrame(()=>list.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true}))}}>← Back to shortlist</button>
    <div className="identity"><p>{clubs(p)} · {p.clubs.map(c=>c.league).join(' / ')} · 2017/18</p><h1 ref={heading} tabIndex={-1}>{p.name}</h1><p>{p.minutes} minutes · {p.starts} starts · {p.wideActions}/{p.attackingHalfActions} attacking-half actions wide ({fmt(100*p.wideShare,1)}%)</p><b>{p.ranks?'#'+p.ranks[method]+' of 150 · '+methods[method]+' · '+fmt(p.scores?.[method],3):'Unranked · incomplete scoring profile'}</b></div>
    <div className="tabs study-tabs" role="tablist" aria-label="Player report">{tabs.map((t,i)=><button key={t} role="tab" id={'study-tab-'+i} aria-controls="study-panel" aria-selected={t===tab} tabIndex={t===tab?0:-1} onClick={()=>setTab(t)} onKeyDown={e=>{
      const next=({ArrowLeft:(i+3)%4,ArrowRight:(i+1)%4,Home:0,End:3} as Record<string,number>)[e.key];
      if(next!==undefined){e.preventDefault();setTab(tabs[next]);document.getElementById('study-tab-'+next)?.focus()}
    }}>{t}</button>)}</div>
    <div role="tabpanel" id="study-panel" aria-labelledby={'study-tab-'+tabs.indexOf(tab)}>
    {tab==='Overview'&&<section><h2>Profile against Salah</h2>{byGap.length?<><p className="finding">{evidence(byGap[0])}</p><p>This contributes least to the category-weighted gap. The largest contribution comes from {evidence(byGap[byGap.length-1])}</p></>:<p>Sterling has six observed metrics. His non-penalty goals were withheld after a team-score discrepancy.</p>}
    {p.videoQuestion&&<div className="question"><b>Video question</b>{p.videoQuestion}</div>}<button className="action" onClick={()=>setTab('Comparison')}>Compare measurements →</button></section>}
    {tab==='Statistical Profile'&&<section><h2>Season measurements</h2><p>{data.eligibility} Percentiles use the {data.referenceSize}-player reference. Higher percentiles indicate higher observed values.</p>
    <table><thead><tr><th>Metric / definition</th><th>Measurement</th><th>Percentile</th><th>N</th></tr></thead><tbody>{data.metrics.map(m=><tr key={m.key}><th><details><summary>{m.label}</summary>{definitions[m.key]}</details></th><td>{fmt(p.values[m.key])} {p.values[m.key]!==null&&m.unit}</td><td>{p.percentiles[m.key]===null?'Unavailable':<>{fmt(p.percentiles[m.key],1)} <progress aria-label={m.label+' percentile'} value={p.percentiles[m.key]!} max={100}/></>}</td><td>{m.n}</td></tr>)}</tbody></table></section>}
    {tab==='Comparison'&&<section><h2>{p.name} against Salah</h2><p>{p.minutes} candidate minutes · {target.minutes} target minutes</p><Radar data={data} p={p} target={target}/>
    <div className="scroll"><table><thead><tr><th>Measurement</th><th>{p.name}</th><th>Salah</th><th>Squared distance term</th></tr></thead><tbody>{data.metrics.map(m=><tr key={m.key}><th>{m.label} ({m.unit})</th><td>{fmt(p.values[m.key])}</td><td>{fmt(target.values[m.key])}</td><td>{fmt(gaps?.[m.key],4)}</td></tr>)}</tbody></table></div><p>Terms sum to the squared category-weighted distance. The radar shows percentile levels on a 0–100 scale.</p></section>}
    {tab==='Model Analysis'&&<><section><h2>Benchmark agreement</h2><p>150 complete candidates across all five methods. Each category has equal weight; non-penalty shots and shots on target share the shooting weight because both measure volume.</p>
    <details><summary>Five ranking methods</summary>{Object.entries(methods).map(([k,v])=><p key={k}><b>{v}</b> · {data.methods[k as Method]}</p>)}</details><Results rows={Object.entries(data.benchmark).filter(([key])=>!key.includes('pca'))}/></section>
    <section><h2>Ranking sensitivity</h2><p>Lowering the wide threshold to 50% retains {data.robustness['wide 0.5 minutes 1200'].shared10}/10. Raising the minutes floor to 1,800 retains {data.robustness['wide 0.6 minutes 1800'].shared10}/10.</p><details><summary>All 27 robustness comparisons</summary><Results rows={Object.entries(data.robustness)}/></details></section></>}
    </div><Credits data={data} hash={hash}/></article></div></main>;
}
