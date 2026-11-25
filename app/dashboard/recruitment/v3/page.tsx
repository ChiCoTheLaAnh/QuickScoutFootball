'use client';
import Link from 'next/link';
import {useState} from 'react';
import data from './synthetic.json';
import './style.css';
import {components as parts, preferenceScore, shortlistOrder} from '@/src/lib/recruitment/v3-ranking';

const rows: Record<string,Record<string,number>> = data.rows;

const labels: Record<string,string> = {baseline_a:'Goals + assists /90',baseline_b:'Original similarity',v2:'QuickScout V2',advanced_similarity:'Advanced similarity',v3:'QuickScout V3'};
const profiles = new Map(data.profiles.map(p=>[p.id,p]));
const axes = Object.entries(data.axes);
const target = data.profiles[0];
const format = (n:number)=>n.toFixed(2);
function point(i:number, radius:number){
  const angle = i*2*Math.PI/7-Math.PI/2;
  return [150+radius*Math.cos(angle),125+radius*Math.sin(angle)];
}
function shape(p:typeof target){
  return axes.map(([,keys],i)=>point(i,keys.reduce((sum,k)=>sum+p.pct[data.metrics.findIndex(m=>m.key===k)],0)/keys.length)).join(' ');
}

export default function Workspace(){
  const [id,select]=useState('SIM-198');
  const [weights,setWeights]=useState([40,40,20]);
  const [method,setMethod]=useState('v3');
  const [showTarget,toggle]=useState(true);
  const [scenario,setScenario]=useState('equal thirds');
  const total=weights.reduce((a,b)=>a+b);
  const score=(r:Record<string,number>)=>preferenceScore(r,weights);
  const ids=shortlistOrder(rows,method,weights);
  const p=profiles.get(id)!;
  const r=rows[id];
  const extremes=p.pct.map((v,i)=>({v,i})).filter(x=>!['minutes','starts'].includes(data.metrics[x.i].key)).sort((a,b)=>b.v-a.v);
  const sens=data.sensitivity[scenario as keyof typeof data.sensitivity];
  return <main className="vthree"><header><Link href="/dashboard/recruitment">← Recruitment brief</Link><small>QUICKSCOUT FOOTBALL　 /　 SYNTHETIC DEMO</small><h1>Recruitment workspace</h1><p>Right wing · 108 candidates · 169 reference players · Fictional target SIM-000</p></header>
  <div className="layout"><aside><h2>Shortlist</h2><label>Rank by<select value={method} onChange={e=>setMethod(e.target.value)}>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>{method==='baseline_b'&&<p>Distance to target · lower is closer</p>}<div className="list">{ids.map((key,i)=><button aria-pressed={key===id} onClick={()=>select(key)} key={key}><span>{i+1}</span><span data-player-id={key}>{key}</span><b>{format(method==='v3'?score(rows[key]):method==='baseline_b'?-rows[key][method]:rows[key][method])}</b></button>)}</div></aside>
  <article><section><small>PLAYER REPORT　 /　 SIMULATED</small><h2>{id}</h2><p>€{format(r.value_eur/1e6)}m · Age {r.age_years} · {r.minutes} minutes · {r.starts} starts</p><div className="cards">{parts.map((k,i)=><div key={k}><small>{k}</small><strong>{format(r[k])}</strong><span>{format(r[k]*weights[i]/total)} points</span></div>)}</div>
  <details open><summary>Recruitment preferences · {format(score(r))} / 100</summary>{parts.map((k,i)=><label key={k}>{k} · {(100*weights[i]/total).toFixed(1)}%<input aria-label={k} type="range" min="0" max="100" value={weights[i]} onChange={e=>{const next=weights.map((w,j)=>j===i?+e.target.value:w);if(next.some(Boolean))setWeights(next)}}/></label>)}<p>V3 rank {(method==='v3'?ids:shortlistOrder(rows,'v3',weights)).indexOf(id)+1} · Default rank {r.v3_rank}. Weights normalize to 100%. Performance and similarity both use npxG and xAG. Feasibility averages affordability and youth.</p></details></section>
  <section><h2>Playing style</h2><label><input type="checkbox" checked={showTarget} onChange={e=>toggle(e.target.checked)}/> Compare with SIM-000 · dashed outline</label><svg viewBox="0 0 300 250" role="img" aria-label="Seven dimension percentile radar">{[25,50,75,100].map(n=><polygon key={n} points={axes.map((_,i)=>point(i,n)).join(' ')} fill="none" stroke="#bfcfc6"/>)}{axes.map(([k],i)=><text key={k} x={point(i,113)[0]} y={point(i,113)[1]} textAnchor="middle">{i+1}</text>)}<polygon points={shape(p)} fill="#16806b44" stroke="#08745d"/>{showTarget&&<polygon points={shape(target)} fill="none" stroke="#99542c" strokeDasharray="4 3"/>}</svg><p>{axes.map(([k],i)=>`${i+1}. ${k}`).join(' · ')}. Axes average retained feature percentiles.</p>
  <p><b>Highest and lowest peer percentiles</b> · {[extremes[0],extremes.at(-1)!].map(x=>data.metrics[x.i].label+' P'+x.v.toFixed(1)).join(' / ')}</p><p>Video question · What team instructions and opportunities could explain the observed {data.metrics[extremes[0].i].label.toLowerCase()} rate? Review actions in settled play and transition.</p></section>
  <section><h2>Statistical evidence</h2><p>Season totals for availability, percentages for efficiency, and per-90 rates for event counts. Lower loss rates earn higher percentiles.</p><div className="scroll"><table><thead><tr>{['Measurement','Candidate','Target','RW percentile'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.metrics.map((m,i)=><tr key={m.key}><td title={m.label}><small>{m.group}</small>{m.label} ({m.unit})</td><td>{format(p.values[i])}</td><td>{format(target.values[i])}</td><td><progress max="100" value={p.pct[i]}/> {p.pct[i].toFixed(1)}</td></tr>)}</tbody></table></div></section>
  <section><h2>Performance versus price</h2><p>Horizontal · €0–45m　 Vertical · performance 0–100, increasing upwards. Green points are Pareto-efficient across price, performance and similarity. Select a point to inspect.</p><svg viewBox="0 0 480 210" role="group" aria-label="Performance versus market value"><path d="M15 8 V194 H467" fill="none" stroke="#83978a"/>{Object.entries(rows).map(([key,v])=><circle key={key} role="button" tabIndex={0} aria-label={`Inspect ${key} on price plot`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(key)}}} cx={15+450*v.value_eur/45e6} cy={194-185*v.performance/100} r={key===id?6:4} stroke={key===id?'black':'white'} fill={data.frontier.includes(key)?'#067960':'#899b96'} onClick={()=>select(key)}><title>{`${key} · €${format(v.value_eur/1e6)}m · ${format(v.performance)}`}</title></circle>)}</svg><p>{id} · {data.frontier.includes(id)?'Pareto-efficient':'Dominated on the three benchmark objectives'}</p></section>
  <section><h2>Benchmark agreement</h2><p>Frozen 40/40/20 benchmark · 108 common candidates</p><div className="scroll"><table><thead><tr>{['Methods','Spearman','Kendall','Shared top 5 / 10 / 20'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{data.pairs.map(b=><tr key={b.first+b.second}><td>{labels[b.first]} × {labels[b.second]}</td><td>{format(b.spearman)}</td><td>{format(b.kendall_tau_b)}</td><td>{[b.overlap_5,b.overlap_10,b.overlap_20].join(' / ')}</td></tr>)}</tbody></table></div><label>Sensitivity scenario<select value={scenario} onChange={e=>setScenario(e.target.value)}>{Object.keys(data.sensitivity).map(k=><option key={k}>{k}</option>)}</select></label><p>{sens.overlap_10}/10 retained · Largest movement {sens.max_move} ranks · Spearman {format(sens.spearman)}</p></section></article></div></main>
}
