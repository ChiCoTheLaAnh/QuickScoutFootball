"""Retrospective 2017/18 Wyscout similarity study. Run with Python 3.9+."""
from pathlib import Path
from itertools import combinations
import hashlib
import re
import numpy as np
import pandas as pd
from scipy.stats import kendalltau, spearmanr
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[2]/'.tmp/wyscout/derived/player_seasons.csv'
SHA = '6e37e395927a7550d87a4933ccc6713516b4625eb778ed9cbc2182ddff71af48'
TARGET = 120353
GROUP = {'npg90':'Scoring', 'np_shots90':'Shooting', 'sot90':'Shooting',
         'key_passes90':'Creation', 'progressive90':'Forward passing',
         'completion_pct':'Passing efficiency', 'interceptions90':'Defending'}
LABEL = ['Non-penalty goals','Non-penalty shots','Shots on target','Tagged key passes',
         'Forward-progress passes','Pass completion (%)','Tagged interceptions']
F = list(GROUP)
CREDIT = 'Source: Wyscout / Pappalardo & Massucco, Figshare, CC BY 4.0. QuickScout derived analysis.'
METHODS = ['category','euclidean','cosine','pca']


def cohort(data, share=.60, minutes=1200):
    return data.loc[(data.role=='Forward') & (data.minutes>=minutes) &
                    (data.interval_flags==0) & (data.att_half>=100) & (data.wide_share>=share)].copy()


def fit(frame, features=F, scaling='standard', boost=None):
    x = frame[features].dropna()
    if scaling=='winsor':
        x=x.clip(x.quantile(.025),x.quantile(.975),axis=1)
    center, spread = x.mean(),x.std(ddof=0)
    if scaling=='robust':
        center,spread=x.median(),x.quantile(.75)-x.quantile(.25)
    if (spread<=0).any():
        raise ValueError('Constant feature')
    z=(x-center)/spread
    groups=pd.Series({f:GROUP[f] for f in features})
    weights=groups.map(lambda g:(2 if g==boost else 1)/(groups==g).sum())
    weights/=weights.sum()
    delta=z-z.loc[TARGET]
    contributions=delta.pow(2)*weights
    _,s,vt=np.linalg.svd(z-z.mean(),full_matrices=False)
    # Fix arbitrary PCA signs by the largest absolute loading.
    vt*=np.sign(vt[np.arange(len(vt)),np.abs(vt).argmax(axis=1)])[:,None]
    variance=s*s/(s@s)
    k=int(np.searchsorted(variance.cumsum(),.85)+1)
    pcs=np.einsum('ij,kj->ik',(z-z.mean()).to_numpy(),vt)
    pos=z.index.get_loc(TARGET)
    norms=np.linalg.norm(z,axis=1)*np.linalg.norm(z.loc[TARGET])
    if (norms==0).any():
        raise ValueError('Undefined cosine for zero profile')
    scores=pd.DataFrame({'category':np.sqrt(contributions.sum(axis=1)),
                         'euclidean':np.linalg.norm(delta,axis=1),
                         'cosine':1-z.mul(z.loc[TARGET]).sum(axis=1)/norms,
                         'pca':np.linalg.norm(pcs[:,:k]-pcs[pos,:k],axis=1)},index=x.index)
    if not np.isfinite(scores.to_numpy()).all():
        raise ValueError('Non-finite similarity')
    return scores.drop(TARGET),contributions,variance,vt,pcs,k


def agreement(a,b):
    ids=a.index.intersection(b.index)
    x,y=a.loc[ids],b.loc[ids]
    result=dict(common=len(ids),spearman=spearmanr(x,y).statistic,kendall=kendalltau(x,y).statistic)
    for k in [5,10,20]:
        result[f'shared{k}']=len(set(a.nsmallest(k).index)&set(b.nsmallest(k).index))
        result[f'common_shared{k}']=len(set(x.nsmallest(k).index)&set(y.nsmallest(k).index))
    return result


def run(out):
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=SHA:
        raise ValueError('Unexpected Phase 4.2 input')
    data=pd.read_csv(SOURCE).set_index('player_id').sort_index()
    data['name']=data.name.map(lambda s:re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),s))
    ref=cohort(data)
    assert set(ref.index)==set(data.index[data.eligible==1]) and len(ref)==152
    out.mkdir(exist_ok=True)
    def save(name,table):
        table.to_csv(out/(name+'.csv'),float_format='%.8f')
    profiles=ref.copy()
    for f in F:
        v=ref[f]
        profiles[f+'_pct']=100*(v.rank(method='average')-.5)/v.count()
        profiles[f+'_n']=v.count()
    save('profiles',profiles)
    fields=ref.select_dtypes('number').columns.difference(['eligible'])
    eda=ref[fields].describe(percentiles=[.25,.5,.75]).T
    eda['missing']=len(ref)-eda['count']
    eda['skew']=ref[fields].skew()
    q1,q3=ref[fields].quantile(.25),ref[fields].quantile(.75)
    outliers=(ref[fields]<q1-1.5*(q3-q1))|(ref[fields]>q3+1.5*(q3-q1))
    eda['tukey_outliers']=outliers.sum()
    save('distributions',eda)
    save('outlier_flags',outliers)
    full=ref.dropna(subset=F)
    pearson=full[F].corr(); spear=full[F].corr(method='spearman')
    save('pearson',pearson);save('spearman',spear)
    def league(stints):
        countries={s.split('/')[0] for s in stints.split('|')}
        return next(iter(countries)) if len(countries)==1 else 'Multiple'
    leagues=ref.groupby(ref.stints.map(league))[F+['minutes','starts']].agg(['count','median','min','max'])
    save('league_summary',leagues)
    scores,contrib,var,vt,pcs,k=fit(full)
    ranks=scores.rank(method='min').astype(int).add_suffix('_rank')
    ordering=scores.category.sort_values(kind='stable').index
    save('rankings',ref[['name','stints','minutes','starts']].join(scores).join(ranks).loc[ordering])
    save('squared_distance_contributions',contrib.drop(TARGET).loc[ordering])
    save('pca_loadings',pd.DataFrame(vt.T,index=F,columns=[f'PC{i+1}' for i in range(len(F))]))
    save('pca_variance',pd.DataFrame({'fraction':var,'cumulative':var.cumsum()},index=range(1,len(var)+1)))
    checks=[]
    for a,b in combinations(METHODS,2):
        checks.append(dict(scenario=f'{a} vs {b}',**agreement(scores[a],scores[b])))
    def check(name,pop,**kwargs):
        other=fit(pop,**kwargs)[0].category
        checks.append(dict(scenario=name,candidates=len(other),**agreement(scores.category,other)))
    for f in F:
        check('omit '+f,full,features=[x for x in F if x!=f])
    check('omit npg including incomplete player',ref,features=F[1:])
    for g in sorted(set(GROUP.values())):
        check('double '+g,full,boost=g)
    for method in ['winsor','robust']:
        check(method,full,scaling=method)
    for share,minutes in [(.5,1200),(.6,900),(.6,1500),(.6,1800)]:
        check(f'wide {share} minutes {minutes}',cohort(data,share,minutes))
    adjusted=full.copy()
    adjusted.loc[TARGET,[f for f in F if f.endswith('90')]]*=2922/2907
    check('Salah 2907 minutes',adjusted)
    save('robustness',pd.DataFrame(checks).set_index('scenario'))
    fig,axes=plt.subplots(1,2,figsize=(12,6),constrained_layout=True)
    for ax,mat,title in zip(axes,[pearson,spear],['Pearson','Spearman']):
        ax.imshow(mat,cmap='RdBu_r',vmin=-1,vmax=1)
        ax.set(xticks=range(7),yticks=range(7),xticklabels=LABEL,yticklabels=LABEL,title=title)
        ax.tick_params(axis='x',rotation=90)
        for i in range(7):
            for j in range(7):
                ax.text(j,i,f'{mat.iloc[i,j]:.2f}',ha='center',va='center',fontsize=8,color='white' if abs(mat.iloc[i,j])>.65 else 'black')
    fig.suptitle('Playing-style correlations · 151 complete profiles')
    fig.savefig(out/'correlations.png',dpi=150);plt.close(fig)
    fig,ax=plt.subplots(figsize=(8,5),constrained_layout=True)
    ax.scatter(*pcs[:,:2].T,s=16,color='#a1aaa8')
    for pid in [TARGET,*ordering[:3]]:
        point=pcs[full.index.get_loc(pid),:2]
        ax.scatter(*point,color='#a84125' if pid==TARGET else '#126b54')
        ax.annotate(ref.at[pid,'name'],point,xytext=(5,6),textcoords='offset points',fontsize=9)
    ax.set(xlabel=f'PC1 ({var[0]:.1%})',ylabel=f'PC2 ({var[1]:.1%})',title='2017/18 wide forwards · exploratory projection')
    fig.savefig(out/'pca.png',dpi=160);plt.close(fig)
    with (out/'candidates.md').open('w') as doc:
        print('# Ten nearest observed profiles\n\n'+CREDIT,file=doc)
        for rank,pid in enumerate(ordering[:10],1):
            a,b=profiles.loc[pid],profiles.loc[TARGET]
            print(f'\n## {rank}. {a["name"]}\n\n{a.stints} · {a.minutes:.0f} minutes · {a.starts} starts · distance {scores.category[pid]:.3f}.\n',file=doc)
            print('| Metric | Candidate | Salah | Candidate percentile | Salah percentile | Squared-distance share |\n|---|---:|---:|---:|---:|---:|',file=doc)
            for f,label in zip(F,LABEL):
                print(f"| {label} | {a[f]:.2f} | {b[f]:.2f} | {a[f+'_pct']:.1f} | {b[f+'_pct']:.1f} | {contrib.at[pid,f]/contrib.loc[pid].sum():.1%} |",file=doc)
            big=contrib.loc[pid].idxmax()
            questions={'npg90':'Compare the locations and pressure of his finishing chances.',
                       'np_shots90':'Compare how often possessions reach him in shooting positions.',
                       'sot90':'Compare the angle and pressure on shots that reach the target.',
                       'key_passes90':'Compare the passing options before he releases a teammate for a shot.',
                       'progressive90':'Compare the availability of forward passing lanes when he receives wide.',
                       'completion_pct':'Compare pass length, pressure and intended receivers on incomplete passes.',
                       'interceptions90':'Compare defensive starting positions and opportunities to intercept.'}
            print(f'\nLargest standardized gap: {LABEL[F.index(big)]}, {a[big]:.2f} versus {b[big]:.2f}. Video question: what explains this gap in comparable game situations? {questions[big]}',file=doc)
    print('PCA retained',k,'axes;',scores.loc[ordering[:10]].join(ref.name).to_string())


if __name__=='__main__':
    run(HERE/'results')
