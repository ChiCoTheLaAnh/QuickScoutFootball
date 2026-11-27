"""Independent recount for published profiles. Only the streaming JSON reader is shared."""
from collections import Counter, defaultdict
import json
import sys
from pathlib import Path
from zipfile import ZipFile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline import events

LEAGUES={'England':380,'France':380,'Germany':306,'Italy':380,'Spain':380}


def recount(raw,profiles):
    chosen=set(profiles.index)
    counts=defaultdict(Counter)
    clubs=defaultdict(set)
    with ZipFile(raw/'events.zip') as ez, ZipFile(raw/'matches.zip') as mz:
        for league,expected in LEAGUES.items():
            cards={}
            fixtures=set()
            for e in events(ez.open('events_'+league+'.json')):
                mid=e['matchId']
                fixtures.add(mid)
                p=e['playerId']
                if p not in chosen:
                    continue
                c=counts[p]
                tags={x['id'] for x in e['tags']}
                kind,sub=e['eventId'],e['subEventId']
                pos=e['positions']
                if tags.intersection([1701,1703]):
                    half=e['matchPeriod']=='1H'
                    minute=min(45,int(e['eventSec']/60))+(0 if half else 45)
                    cards[mid,p]=min(cards.get((mid,p),90),minute)
                if (kind==10 or sub in [33,35] or (sub==30 and 101 in tags)) and 102 not in tags:
                    c['goals']+=101 in tags
                    c['npg']+=101 in tags and sub!=35
                    c['np_shots']+=sub!=35
                    c['sot']+=101 in tags or any(1201<=tag<=1209 for tag in tags)
                c['key_passes']+=302 in tags
                c['interceptions']+=1401 in tags
                if kind==8:
                    c['passes']+=1
                    c['completed']+=1801 in tags
                    c['progressive']+=1801 in tags and len(pos)>=2 and pos[0]['x']+10<=pos[-1]['x']
                if (kind in (8,10) or sub in (11,70,72)) and pos and pos[0]['x']>=50:
                    c['att_half']+=1
                    c['wide']+=not 30<pos[0]['y']<70
            matches=json.loads(mz.read('matches_'+league+'.json'))
            assert len(fixtures)==len(matches)==expected and fixtures=={m['wyId'] for m in matches}
            pairs=set()
            for m in matches:
                assert m['status']=='Played' and m['dateutc'][:4] in ['2017','2018']
                pairs.add(tuple(t['teamId'] for t in sorted(m['teamsData'].values(),key=lambda x:x['side'])))
                for team,t in m['teamsData'].items():
                    f=t['formation']
                    subs=f['substitutions'] if isinstance(f['substitutions'],list) else []
                    on={s['playerIn']:min(90,s['minute']) for s in subs}
                    off={s['playerOut']:min(90,s['minute']) for s in subs}
                    starters={x['playerId'] for x in f['lineup']}
                    for x in f['lineup']+f['bench']:
                        p=x['playerId']
                        if p not in chosen or (p not in starters and p not in on):
                            continue
                        clubs[p].add(f'{league}/{team}')
                        c=counts[p]
                        c['appearances']+=1
                        c['starts']+=p in starters
                        start=on.get(p,0)
                        end=off.get(p,90)
                        red=x.get('redCards')
                        dismissal=cards.get((m['wyId'],p),min(90,int(red)) if str(red).isdigit() and int(red)>0 else 91)
                        c['minutes']+=(dismissal if start<=dismissal<=end else end)-start
            assert len(pairs)==expected
    for p,r in profiles.iterrows():
        assert clubs[p]==set(r.stints.split('|'))
        for k in ('goals','npg','np_shots','sot','key_passes','progressive','passes','completed','interceptions','wide','att_half','starts','appearances','minutes'):
            if k=='npg' and r.team_score_flags:
                assert r.isna()[k]
            else:
                assert counts[p][k]==r[k],(p,k,counts[p][k],r[k])
