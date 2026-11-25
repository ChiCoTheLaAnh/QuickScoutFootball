"""Reproduce the descriptive 2017/18 study using pinned Figshare files."""
import argparse
import csv
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1] / '.tmp/wyscout'
SEASONS = {'England':181150, 'France':181189, 'Germany':181137, 'Italy':181248, 'Spain':181144}
LEAGUES = {'England': 20, 'France': 20, 'Germany': 18, 'Italy': 20, 'Spain': 20}
COUNTS = ['npg', 'np_shots', 'sot', 'key_passes', 'progressive', 'interceptions']
SALAH = 120353


def acquire(raw):
    raw.mkdir(parents=True, exist_ok=True)
    for item in json.loads((HERE / 'sources.json').read_text()):
        path = raw / item['file']
        if not path.exists():
            temp = path.with_suffix('.part')
            subprocess.run(['curl', '-fLsS', '--retry', '3', item['download'], '-o', temp], check=True)
            if hashlib.sha256(temp.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError(f'Download checksum: {path.name}')
            temp.replace(path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError(f'Cache checksum: {path.name}')


def events(stream):
    """Decode a JSON array in chunks, retaining only the unfinished object."""
    decoder = json.JSONDecoder()
    buf = ''
    import io
    with io.TextIOWrapper(stream, encoding='utf8') as reader:
        while True:
            chunk = reader.read(262144)
            buf += chunk
            start = 0
            while start < len(buf):
                if buf[start] in ' \r\n\t[],':
                    start += 1
                    continue
                try:
                    obj, start = decoder.raw_decode(buf, start)
                except json.JSONDecodeError:
                    if not chunk:
                        raise
                    break
                yield obj
            buf = buf[start:]
            if not chunk:
                break


def is_shot(e, tags):
    return e['eventId']==10 or e['subEventId'] in (33,35) or (e['subEventId']==30 and 101 in tags)


def count_event(c, e, tags):
    sub = e['subEventId']
    shot = is_shot(e,tags)
    if shot and 102 not in tags:
        c['np_shots'] += sub != 35
        goal = 101 in tags
        c['goals'] += goal
        c['npg'] += goal and sub != 35
        c['sot'] += goal or bool(tags.intersection(range(1201, 1210)))
    c['key_passes'] += 302 in tags
    c['interceptions'] += 1401 in tags
    pos = e['positions']
    if e['eventId'] == 8:
        c['passes'] += 1
        c['completed'] += 1801 in tags
        if 1801 in tags:
            if len(pos) < 2:
                c['missing_endpoint'] += 1
            else:
                c['progressive'] += pos[-1]['x'] - pos[0]['x'] >= 10
    if e['eventId'] in (8, 10) or sub in (11, 70, 72):
        if not pos:
            c['missing_origin'] += 1
        elif pos[0]['x'] >= 50:
            c['att_half'] += 1
            c['wide'] += pos[0]['y'] <= 30 or pos[0]['y'] >= 70


def intervals(formation, cards):
    lineup = formation['lineup']
    start = {x['playerId']: 0 for x in lineup}
    end = {}
    issues = set()
    subs = formation['substitutions']
    if subs == 'null' or subs is None:
        subs = []
        issues.update(start)
    for sub in subs:
        a, b = sub['playerOut'], sub['playerIn']
        minute = max(0, min(90, sub['minute']))
        if a not in start or a in end or b in start:
            issues.update((a,b))
        end[a] = minute
        start[b] = minute
    for p, t in cards.items():
        if p in start and start[p] <= t <= end.get(p, 90):
            end[p] = t
    for x in lineup + formation['bench']:
        p = x['playerId']
        raw_card = x.get('redCards')
        if p in start and raw_card not in ('0', 0, 'null', None) and p not in cards:
            if str(raw_card).isdigit():
                minute = min(90,int(raw_card))
                if start[p] <= minute <= end.get(p,90):
                    end[p] = minute
            else:
                issues.add(p)
    starters = {x['playerId'] for x in lineup}
    return {p: (max(0, end.get(p,90)-t), int(p in starters)) for p,t in start.items()}, issues


def dump_csv(path, rows):
    with path.open('w', newline='') as out:
        w = csv.DictWriter(out, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def build(raw, out):
    out.mkdir(parents=True, exist_ok=True)
    players = {p['wyId']:p for p in json.loads((raw/'players.json').read_text())}
    team_ids = {t['wyId'] for t in json.loads((raw/'teams.json').read_text())}
    competitions = {c['wyId']:c for c in json.loads((raw/'competitions.json').read_text())}
    totals = defaultdict(Counter)
    affiliations = defaultdict(set)
    audit = {}
    issues = []
    with ZipFile(raw/'events.zip') as ez, ZipFile(raw/'matches.zip') as mz:
        for league, n in LEAGUES.items():
            matches = json.loads(mz.read(f'matches_{league}.json'))
            by_id = {m['wyId']:m for m in matches}
            pairs = set()
            for m in matches:
                assert m['status']=='Played' and m['seasonId']==SEASONS[league]
                assert competitions[m['competitionId']]['area']['name']==league
                assert all(int(t) in team_ids for t in m['teamsData'])
                assert all(len(t['formation']['lineup'])==11 for t in m['teamsData'].values())
                teams = sorted(m['teamsData'].values(),key=lambda t:t['side'])
                pairs.add(tuple(t['teamId'] for t in teams))
            assert len(matches)==len(by_id)==len(pairs)==n*(n-1)
            assert len(set(t for pair in pairs for t in pair))==n
            seen = {}
            stats = defaultdict(lambda:defaultdict(Counter))
            goals = Counter()
            cards = defaultdict(dict)
            coverage = Counter()
            unattributed = Counter()
            duplicates = unknown = 0
            for e in events(ez.open(f'events_{league}.json')):
                mid, team, pid = e['matchId'], e['teamId'], e['playerId']
                eid = e['id']
                if eid in seen:
                    # Repeated identifiers require payload equality, never first-row wins.
                    if seen[eid] != hash(str(e)):
                        raise ValueError(f'Conflicting duplicate {eid}')
                    duplicates += 1
                    continue
                seen[eid] = hash(str(e))
                assert mid in by_id and str(team) in by_id[mid]['teamsData']
                coverage[mid] += 1
                tags = {t['id'] for t in e['tags']}
                if 102 in tags:
                    other = next(int(t) for t in by_id[mid]['teamsData'] if int(t)!=team)
                    goals[mid,other] += 1
                elif 101 in tags and is_shot(e,tags):
                    goals[mid,team] += 1
                if not pid:
                    count_event(unattributed,e,tags)
                    unknown += 1
                    continue
                if tags & {1701,1703}:
                    first = e['matchPeriod']=='1H'
                    minute = min(45 if first else 90,(0 if first else 45)+int(e['eventSec']//60))
                    cards[mid,team][pid] = min(minute,cards[mid,team].get(pid,90))
                count_event(stats[mid,team][pid], e, tags)
            assert set(coverage)==set(by_id)
            audit[league] = dict(fixtures=len(matches),clubs=n,events=sum(coverage.values()),duplicates=duplicates,
                                 events_without_player=unknown,unattributed_counts=dict(unattributed),minimum_events=min(coverage.values()))
            for mid,m in by_id.items():
                for t in m['teamsData'].values():
                    team = t['teamId']
                    durations,bad = intervals(t['formation'],cards[mid,team])
                    measured = stats[mid,team]
                    score_bad = goals[mid,team]!=t['score']
                    if score_bad or bad or set(measured)-set(durations):
                        issues.append(dict(league=league,match=mid,team=team,event_goals=goals[mid,team],score=t['score'],
                                           interval_flags=sorted(bad),outside_lineup=sorted(set(measured)-set(durations))))
                    for p in durations.keys() | measured.keys():
                        if not p:
                            continue
                        c = totals[p]
                        c.update(measured.get(p,{}))
                        minutes,starts = durations.get(p,(0,0))
                        c.update(minutes=minutes,starts=starts,appearances=int(p in durations),
                                 interval_flags=int(p in bad or p not in durations),score_flags=int(score_bad))
                        affiliations[p].add((league,team))
    rows=[]
    for pid,c in sorted(totals.items()):
        player = players.get(pid,{})
        role = player.get('role',{}).get('name','Unknown')
        m = c['minutes']
        share = c['wide']/c['att_half'] if c['att_half'] else None
        valid = not c['interval_flags']
        eligible = valid and role=='Forward' and m>=1200 and c['att_half']>=100 and share>=0.60 and not c['missing_origin']
        row=dict(player_id=pid,name=player.get('shortName',''),role=role,
                 stints='|'.join(f'{l}/{t}' for l,t in sorted(affiliations[pid])),minutes=m if valid else None,
                 appearances=c['appearances'],starts=c['starts'],goals=c['goals'],interval_flags=c['interval_flags'],
                 team_score_flags=c['score_flags'],att_half=c['att_half'],wide=c['wide'],wide_share=share,eligible=int(eligible))
        for key in COUNTS:
            reliable = not (key=='progressive' and c['missing_endpoint'] or key=='npg' and c['score_flags'])
            row[key]=c[key] if reliable else None
            row[key+'90']=round(90*c[key]/m,6) if valid and m and reliable else None
        row.update(passes=c['passes'],completed=c['completed'],completion_pct=round(100*c['completed']/c['passes'],6) if c['passes'] else None)
        rows.append(row)
    salah = next(r for r in rows if r['player_id']==SALAH)
    assert salah['name']=='Mohamed Salah' and salah['stints']=='England/1612'
    assert (salah['appearances'],salah['starts'],salah['goals'],salah['npg'])==(36,34,32,31)
    assert salah['eligible'] and salah['minutes']==2922
    dump_csv(out/'player_seasons.csv',rows)
    report=dict(leagues=audit,players=len(rows),eligible=sum(r['eligible'] for r in rows),salah=salah,
                missing={k:sum(r[k] is None for r in rows) for k in rows[0]},issues=issues)
    (out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args()
    acquire(args.root/'raw')
    build(args.root/'raw',args.root/'derived')
