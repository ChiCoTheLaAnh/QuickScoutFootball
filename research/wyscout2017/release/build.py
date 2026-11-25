"""Verify the approved benchmark and export its licensed display data."""
import hashlib
from itertools import combinations
import json
from pathlib import Path
import re

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist
from scipy.stats import kendalltau, rankdata, spearmanr
from verify_events import recount, LEAGUES

HERE=Path(__file__).resolve().parent
STUDY=HERE.parent
DATA=STUDY.parents[1]/'.tmp/wyscout'
APPROVED=STUDY/'profiling/results'
ID=120353
KEYS=['npg90','np_shots90','sot90','key_passes90','progressive90','completion_pct','interceptions90']
LABELS=['Non-penalty goals','Non-penalty shots','Shots on target','Tagged key passes','Forward-progress passes','Pass completion','Tagged interceptions']
GROUPS=['Scoring','Shooting','Shooting','Creation','Forward passing','Passing efficiency','Defending']
METHODS=['category','npg','attack','euclidean','cosine','pca']
QUESTIONS=[
 'Across comparable chances, what changes in shot location and defensive pressure?',
 'How often does each receive in shooting positions, and when does he elect to shoot?',
 'From comparable shooting angles, how often is the attempt pressured or blocked?',
 'When receiving wide, which passing options are available before a teammate shoots?',
 'Which forward lanes are open when he receives, and which does he attempt to use?',
 'How do pass length, receiver movement and pressure differ on incomplete passes?',
 'Which defensive starting positions and opposition passes create chances to intercept?']


def subset(d,share=.60,minutes=1200):
    return d[(d.role=='Forward') & d.minutes.ge(minutes) & d.interval_flags.eq(0)
             & d.att_half.ge(100) & (d.wide/d.att_half).ge(share)]


def distances(rows,keys=KEYS,scale='standard',boost=None):
    x=rows[keys].dropna()
    values=x.to_numpy()
    if scale=='winsor':
        values=values.clip(*np.percentile(values,[2.5,97.5],axis=0))
    if scale=='robust':
        z=(values-np.median(values,axis=0))/np.diff(np.percentile(values,[25,75],axis=0),axis=0)
    else:
        z=(values-values.mean(axis=0))/values.std(axis=0)
    target=x.index.get_loc(ID)
    groups=[GROUPS[KEYS.index(k)] for k in keys]
    w=np.array([(2 if g==boost else 1)/groups.count(g) for g in groups])
    contributions=pd.DataFrame((z-z[target])**2*(w/w.sum()),index=x.index,columns=keys)
    eig,v=np.linalg.eigh(np.cov(z.T))
    n=np.searchsorted(np.cumsum(eig[::-1])/eig.sum(),.85)+1
    pc=np.einsum('ij,jk->ik',z,v[:,-n:])
    result=pd.DataFrame(index=x.index)
    result['category']=np.sqrt(contributions.sum(axis=1))
    for col,metric,a in [('euclidean','euclidean',z),('cosine','cosine',z),('pca','euclidean',pc)]:
        result[col]=cdist(a,a[[target]],metric=metric).ravel()
    if 'npg90' in keys and 'key_passes90' in keys:
        a=z[:,[keys.index('npg90'),keys.index('key_passes90')]]
        result['attack']=cdist(a,a[[target]]).ravel()
        result['npg']=x.npg90
    return result.drop(ID),contributions


def agreement(a,b):
    ids=a.index.intersection(b.index)
    x,y=a.loc[ids],b.loc[ids]
    out=dict(common=len(ids),spearman=float(spearmanr(x,y).statistic),kendall=float(kendalltau(x,y).statistic))
    for k in (5,10,20):
        for prefix,l,r in [('',a,b),('common_',x,y)]:
            out[f'{prefix}shared{k}']=len(l.sort_values(kind='stable').index[:k].intersection(r.sort_values(kind='stable').index[:k]))
    return out


def clean(value):
    return re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),value)


def optional(x):
    return round(float(x),8) if pd.notna(x) else None


def build():
    manifest=json.loads((STUDY/'sources.json').read_text())
    raw=DATA/'raw'
    for m in manifest:
        assert hashlib.sha256((raw/m['file']).read_bytes()).hexdigest()==m['sha256']
        assert m['license']['name']=='CC BY 4.0'
    d=pd.read_csv(DATA/'derived/player_seasons.csv').set_index('player_id').sort_index()
    ref=subset(d)
    p=pd.read_csv(APPROVED/'profiles.csv').set_index('player_id').sort_index()
    assert ref.index.equals(p.index) and set(ref.index)==set(d.index[d.eligible==1])
    recount(raw,p)
    players={x['wyId']:x for x in json.loads((raw/'players.json').read_text())}
    teams={x['wyId']:x['name'] for x in json.loads((raw/'teams.json').read_text())}
    for key in KEYS:
        values=(100*p.completed/p.passes if key=='completion_pct' else 90*p[key[:-2]]/p.minutes).round(6)
        np.testing.assert_allclose(values,p[key],atol=1e-8,rtol=0)
        observed=values.dropna().to_numpy()
        pct=values.map(lambda v:100*((observed<v).sum()+.5*(observed==v).sum())/len(observed) if pd.notna(v) else np.nan)
        np.testing.assert_allclose(pct,p[key+'_pct'],atol=1e-8,rtol=0)
        assert (p[key+'_n']==len(observed)).all()
    scores,contrib=distances(ref)
    assert len(ref)==152 and len(scores)==150 and ID not in scores.index
    assert list(p.loc[p.npg90.isna(),'name'])==['R. Sterling']
    old=pd.read_csv(APPROVED/'rankings.csv').set_index('player_id')
    saved=pd.read_csv(APPROVED/'squared_distance_contributions.csv').set_index('player_id')
    np.testing.assert_allclose(contrib.loc[saved.index,KEYS],saved[KEYS],atol=1e-8,rtol=0)
    ranks=scores.apply(lambda s:s.rank(method='min',ascending=s.name!='npg').astype(int))
    for k in ('category','euclidean','cosine','pca'):
        np.testing.assert_allclose(scores.loc[old.index,k],old[k],atol=1e-8,rtol=0)
        np.testing.assert_array_equal(ranks.loc[old.index,k],old[k+'_rank'])
    robust={}
    for a,b in combinations(['category','euclidean','cosine','pca'],2):
        robust[a+' vs '+b]=agreement(scores[a],scores[b])
    def scenario(name,rows,**kwargs):
        other=distances(rows,**kwargs)[0].category
        robust[name]=dict(agreement(scores.category,other),candidates=len(other))
    complete=ref.dropna(subset=KEYS)
    for k in KEYS:
        scenario('omit '+k,complete,keys=[x for x in KEYS if x!=k])
    scenario('omit npg including incomplete player',ref,keys=KEYS[1:])
    for g in sorted(set(GROUPS)):
        scenario('double '+g,complete,boost=g)
    for mode in ['winsor','robust']:
        scenario(mode,complete,scale=mode)
    for share,mins in [(.5,1200),(.6,900),(.6,1500),(.6,1800)]:
        scenario(f'wide {share} minutes {mins}',subset(d,share,mins))
    changed=complete.copy()
    for k in KEYS:
        if k.endswith('90'):
            changed.loc[ID,k]=changed.loc[ID,k]*2922/2907
    scenario('Salah 2907 minutes',changed)
    expected=pd.read_csv(APPROVED/'robustness.csv').set_index('scenario')
    assert set(expected.index)==set(robust)
    for s,obs in robust.items():
        for k,value in expected.loc[s].dropna().items():
            np.testing.assert_allclose(obs[k],value,atol=1e-8,rtol=0)
    comparisons={}
    for a,b in combinations(METHODS,2):
        comparisons[a+' vs '+b]=agreement(-scores[a] if a=='npg' else scores[a],-scores[b] if b=='npg' else scores[b])
    artifact=dict(schemaVersion=1,study='Independent retrospective statistical similarity case study',season='2017/18',
        targetId=ID,competitionFixtures=LEAGUES,referenceSize=len(p),candidateCount=len(scores),
        eligibility='Wyscout Forward; reliable minutes >= 1200; >= 100 attacking-half actions; >= 60% in outside lanes. Both flanks included.',
        methods={'category':'RMS standardized distance across six equal categories; shooting shares one category.',
        'npg':'Non-penalty goals per 90, descending.','attack':'Euclidean distance on standardized NPG/90 and tagged key passes/90.',
        'euclidean':'Euclidean distance across seven equally weighted z-scores.','cosine':'1 minus centered-profile cosine similarity.',
        'pca':'Euclidean distance on four unwhitened PCs (85% cumulative threshold).'},
        preprocessing='Means and population SDs fitted on all 151 complete references including Salah. Tied ranks share minimum rank; player ID breaks top-K boundary ties.',
        percentile='100 × (strictly lower count + half the tied count) / nonmissing reference size.',
        metrics=[dict(key=k,label=l,unit='%' if k=='completion_pct' else 'per 90',dimension=g,n=int(p[k].count())) for k,l,g in zip(KEYS,LABELS,GROUPS)],
        limitations=['Observed on-ball flank involvement; nominal position and off-ball runs unmeasured.',
        'Single-season, pooled leagues, no team or opponent adjustment.','Salah rates use 2922 reconstructed minutes; alternative 2907 tested.',
        'Sterling has missing NPG due to an unresolved team-score discrepancy.','Recruitment accuracy, tactical fit and transfer feasibility unevaluated.'],
        attribution=dict(collector='Wyscout',paper='Pappalardo et al., A public data set of spatio-temporal match events in soccer competitions (2019)',doi='10.1038/s41597-019-0247-7',
        license='CC BY 4.0',licenseUrl=manifest[0]['license']['url'],changes='Domestic events aggregated, minutes reconstructed, wide forwards selected, metrics standardized and ranked.',
        sources=[{k:m[k] for k in ('item','authors','version','url','sha256')} for m in manifest]),
        benchmark=comparisons,robustness=robust,profiles=[])
    summaries=['# 2017/18 shortlist for video review','', 'Wyscout research release · CC BY 4.0 · attribution and transformation details in the accompanying JSON.']
    for pid,r in p.iterrows():
        assert clean(players[pid]['shortName'])==r['name'] and players[pid]['role']['name']=='Forward'
        clubs=[]
        for stint in r.stints.split('|'):
            league,team=stint.split('/')
            clubs.append(dict(league=league,id=int(team),name=clean(teams[int(team)])))
        row=dict(id=pid,name=r['name'],clubs=clubs,minutes=int(r.minutes),starts=int(r.starts),
                 wideActions=int(r.wide),attackingHalfActions=int(r.att_half),wideShare=optional(r.wide/r.att_half),
                 values={k:optional(r[k]) for k in KEYS},percentiles={k:optional(r[k+'_pct']) for k in KEYS},
                 ranks=None,scores=None,squaredContributions=None)
        if pid in scores.index:
            row.update(ranks=ranks.loc[pid].to_dict(),scores={m:optional(scores.at[pid,m]) for m in METHODS},
                       squaredContributions={k:optional(contrib.at[pid,k]) for k in KEYS})
            if ranks.at[pid,'category']<=10:
                small,big=contrib.loc[pid].idxmin(),contrib.loc[pid].idxmax()
                row['videoQuestion']=QUESTIONS[KEYS.index(big)]
                summaries.append((int(ranks.at[pid,'category']),f"""## {ranks.at[pid,'category']}. {r['name']} — {', '.join(c['name'] for c in clubs)}

Distance {scores.at[pid,'category']:.3f}. {r.minutes:.0f} minutes, {r.starts} starts; {r.wide}/{r.att_half} attacking-half origins wide ({r.wide_share:.1%}).

Smallest contribution: {LABELS[KEYS.index(small)]}, {r[small]:.2f} versus Salah's {p.at[ID,small]:.2f}. Largest contribution: {LABELS[KEYS.index(big)]}, {r[big]:.2f} versus {p.at[ID,big]:.2f}. Values are per 90 except pass completion (%).

Shares of squared distance: """+', '.join(f'{label} {contrib.at[pid,k]/contrib.loc[pid].sum():.1%}' for k,label in zip(KEYS,LABELS))+f".\n\nVideo question: {row['videoQuestion']}"))
        artifact['profiles'].append(row)
    (HERE/'wyscout-salah-2017-18.v1.json').write_text(json.dumps(artifact,allow_nan=False,separators=(',',':'),ensure_ascii=False)+'\n')
    (HERE/'scouting.md').write_text('\n'.join(summaries[:3])+'\n\n'+'\n\n'.join(t for _,t in sorted(summaries[3:]))+'\n')
    ranks.join(p.name).sort_values('category').to_csv(HERE/'candidate-ranks.csv')
    pd.DataFrame(comparisons).T.to_csv(HERE/'benchmark.csv',float_format='%.8f')


if __name__=='__main__':
    build()
