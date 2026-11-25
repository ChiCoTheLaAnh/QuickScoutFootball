"""Phase 3.4 offline recruitment benchmark on invented players only."""
import hashlib
import json
from itertools import combinations
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
from scipy.stats import kendalltau

from statistical_profiles.legacy import score as legacy_score
from statistical_profiles.fixture import fixture, TARGET
from statistical_profiles.methods import AXES, compare, ranks

OUT = Path(__file__).resolve().parents[1] / ".tmp/scoring-v3-synthetic-v1"
BASE = np.array([.4, .4, .2])
COMPONENTS = ["performance", "similarity", "feasibility"]


def midrank(values, reference):
    peers = np.sort(reference)
    if not len(peers) or not np.isfinite(peers).all():
        raise ValueError("Percentile requires a complete reference")
    result = 50 * (np.searchsorted(peers, values, side="left") +
                 np.searchsorted(peers, values, side="right")) / len(peers)
    return np.where(np.isfinite(values), result, np.nan)


def legacy_inputs(data):
    """Invent recruitment context, with noisy assists and valuations in budget."""
    rng = np.random.default_rng(3401)
    rows = {}
    for pid, player in data.iterrows():
        minutes = int(player.minutes)
        apps = min(38, max(int(np.ceil(minutes / 90)), int(player.starts)) + int(rng.integers(0, 7)))
        assists = int(rng.poisson(player.xag90 * minutes / 90))
        value = np.clip((6 + 20 * player.npxg90 + 15 * player.xag90) *
                        rng.lognormal(0, .45), 1, 45)
        rows[pid] = dict(player_id=int(pid[4:]), observed_minutes=minutes,
                         observed_goals=round(player.goals90 * minutes / 90),
                         observed_assists=assists, appearances_observed=apps,
                         observed_rw_games=int(rng.integers(3, apps + 1)),
                         age_years=int(rng.integers(18, 26)), value_eur=round(value * 1e6))
    return rows


def agreement(a, b):
    common = pd.concat([a, b], axis=1).dropna()
    return dict(**ranks(a, b), kendall_tau_b=kendalltau(common.iloc[:, 0], common.iloc[:, 1]).statistic)


def frontier(objectives):
    """All columns maximize. Exact ties coexist on the frontier."""
    if not np.isfinite(objectives.to_numpy()).all():
        raise ValueError("Pareto objectives require complete values")
    values = objectives.to_numpy()
    return pd.Series([((values >= row).all(axis=1) & (values > row).any(axis=1)).sum()
                      for row in values], index=objectives.index, name="dominated_by_count")


def build(folder):
    data, reference, ids = fixture()
    native = legacy_inputs(data)
    rows, _ = legacy_score([native[i] for i in ids], native[TARGET])
    players = pd.DataFrame(rows, index=ids)
    evidence = data.loc[ids].copy()
    for key in ["npxg90", "xag90"]:
        evidence[key + "_pct"] = midrank(evidence[key], data.loc[reference, key])
    evidence["performance"] = evidence[["npxg90_pct", "xag90_pct"]].mean(axis=1)
    distances, gaps, _ = compare(data, reference, ids, TARGET)
    evidence["distance"] = distances.category_rms
    evidence["similarity"] = 100 / (1 + evidence.distance)
    context = ["goals90", "assists90", "observed_assists", "age_years", "value_eur", "affordability", "youth", "roleFit"]
    evidence[context] = players[context]
    evidence["feasibility"] = evidence[["affordability", "youth"]].mean(axis=1)
    components = evidence[COMPONENTS]
    contributions = components * BASE
    evidence = evidence.join(contributions.add_suffix("_points")).join(gaps.add_prefix("squared_gap_"))
    scores = players[["baseline_a", "baseline_b", "v2"]].copy()
    scores["baseline_b"] *= -1  # uniform higher-is-better ordering
    scores["advanced_similarity"] = evidence.similarity
    scores["v3"] = contributions.sum(axis=1, skipna=False)
    order = scores.rank(ascending=False, method="min")
    evidence.join(scores).join(order.add_suffix("_rank")).to_csv(folder / "explanations.csv")
    stats = [dict(first=a, second=b, **agreement(scores[a], scores[b])) for a, b in combinations(scores, 2)]
    pd.DataFrame(stats).to_csv(folder / "methods.csv", index=False)

    variants = {}
    mixes = {"performance only": [1,0,0], "similarity only": [0,1,0], "equal thirds": [1,1,1],
             "omit similarity": [2,0,1], "budget emphasis": [1,1,2]}
    for j, key in enumerate(COMPONENTS):
        for factor in [.8, 1.2]:
            w = BASE.copy()
            w[j] *= factor
            mixes[f"{key} x {factor}"] = w
    for name, w in mixes.items():
        variants[name] = (components * (np.asarray(w) / sum(w))).sum(axis=1, skipna=False)
    for omitted in [*[(a,) for a in AXES], ("Scoring threat", "Chance creation")]:
        axes = {a: keys for a, keys in AXES.items() if a not in omitted}
        d, _, _ = compare(data, reference, ids, TARGET, axes)
        variants["similarity without " + " + ".join(omitted)] = scores.v3 + .4 * (100/(1+d.category_rms) - evidence.similarity)
    for key in ["npxg90_pct", "xag90_pct"]:
        variants["performance using " + key] = scores.v3 + .4 * (evidence[key] - evidence.performance)
    robust, _, _ = compare(data, reference, ids, TARGET, mode="robust")
    variants["robust scaling"] = scores.v3 + .4 * (100/(1+robust.category_rms) - evidence.similarity)
    scenarios = pd.DataFrame(variants)
    sensitivity = pd.DataFrame({name: agreement(scores.v3, scenarios[name]) for name in scenarios}).T
    sensitivity.to_csv(folder / "sensitivity.csv")
    scenarios.rank(ascending=False).to_csv(folder / "scenario-ranks.csv")
    components.corr(method="spearman").to_csv(folder / "component-correlations.csv")
    trade = evidence[["performance", "similarity", "value_eur"]].copy()
    trade["dominated_by_count"] = frontier(trade.assign(value_eur=-trade.value_eur))
    trade["v3_rank"] = order.v3
    trade.sort_values(["dominated_by_count","v3_rank"]).to_csv(folder / "pareto.csv")
    top = scores.v3.idxmax()
    front = trade[trade.dominated_by_count.eq(0)]
    cheap = front.value_eur.idxmin()
    best = front.performance.idxmax()
    r = evidence.loc[top]
    report = f"""# Scoring V3 benchmark · synthetic players only

All five methods cover {len(scores.dropna())} of {len(ids)} candidates. Preprocessing uses 169 synthetic RW peers. SIM-000 is the fictional target. No observed footballer was ranked.

## Rankings and redundancy

The 40/40/20 mix gives {top} first place with {scores.v3[top]:.2f} points. Performance contributes {r.performance_points:.2f}, resemblance {r.similarity_points:.2f} and feasibility {r.feasibility_points:.2f}. Its npxG/90 is {r.npxg90:.3f} and xAG/90 is {r.xag90:.3f}. Its largest squared style gap is {gaps.loc[top].idxmax()} ({gaps.loc[top].max():.3f}). All individual measures, scores and category gaps are in explanations.csv.

Performance and similarity have Spearman rho {components.performance.corr(components.similarity, method='spearman'):.3f}. Both consume npxG and xAG. Higher output earns performance points even above the target, where resemblance can fall. Removing both dimensions from similarity retains {sensitivity.loc['similarity without Scoring threat + Chance creation','overlap_10']:.0f} original top-ten candidates. The joint ablation measures sensitivity to shared inputs. These simulated associations depend on the fixture.

## Stability

Across six one-at-a-time weight changes of ±20%, the top ten retains {sensitivity.filter(like=' x ',axis=0).overlap_10.min():.0f}–{sensitivity.filter(like=' x ',axis=0).overlap_10.max():.0f} members. See sensitivity.csv for each configuration, dimension removal, performance feature removal and robust scaling. Rank agreement measures consistency. No independent relevance grades are available.

## Performance and price

{len(front)} candidates are Pareto-efficient when maximizing attacking performance and similarity while minimizing estimated price. The cheapest frontier member {cheap} costs €{trade.value_eur[cheap]/1e6:.2f}m and has performance {trade.performance[cheap]:.2f}/100. The highest-performance frontier member {best} costs €{trade.value_eur[best]/1e6:.2f}m and has performance {trade.performance[best]:.2f}/100. Age is in the composite feasibility score and outside this frontier definition. Prices, player identities and results are invented.
"""
    (folder / "BENCHMARK.md").write_text(report)


def main():
    OUT.parent.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=OUT.parent) as temp:
        stage = Path(temp) / "result"
        stage.mkdir()
        build(stage)
        hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(stage.iterdir())}
        (stage / "manifest.json").write_text(json.dumps(hashes, indent=2) + "\n")
        if OUT.exists():
            if {p.name:p.read_bytes() for p in OUT.iterdir()} != {p.name:p.read_bytes() for p in stage.iterdir()}:
                raise ValueError("Existing snapshot differs from this run")
        else:
            stage.rename(OUT)
    print(OUT / "BENCHMARK.md")


if __name__ == "__main__":
    main()
