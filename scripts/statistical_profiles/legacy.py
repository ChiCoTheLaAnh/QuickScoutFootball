"""Frozen baseline formulas for the synthetic cohort."""
import math
import statistics

WEIGHTS = dict(similarity=.45, roleFit=.20, output=.15, affordability=.10, youth=.10)


def rates(row):
    return tuple(90 * int(row[k]) / int(row["observed_minutes"])
                 for k in ("observed_goals", "observed_assists"))


def weighted(row, weights):
    return sum(row[k] * w for k, w in weights.items())


def score(pool, target):
    reference = rates(target)
    pairs = [rates(r) for r in pool]
    sigma = [statistics.pstdev(column) for column in zip(*pairs)]
    low, high = min(map(sum, pairs)), max(map(sum, pairs))
    youngest = min(int(r["age_years"]) for r in pool)
    rows = []
    for r, pair in zip(pool, pairs):
        distance = math.hypot(*[(x-y)/s if s else 0 for x, y, s in zip(pair, reference, sigma)])
        attack = sum(pair)
        row = dict(r, goals90=pair[0], assists90=pair[1], baseline_a=attack, baseline_b=distance,
                   similarity=100/(1+distance), roleFit=100*int(r["observed_rw_games"])/int(r["appearances_observed"]),
                   output=100*(attack-low)/(high-low) if high > low else 50,
                   affordability=100*(1-int(r["value_eur"])/45_000_000),
                   youth=100*(25-int(r["age_years"]))/(25-youngest) if youngest < 25 else 50)
        row["v2"] = weighted(row, WEIGHTS)
        rows.append(row)
    return rows, dict(target_rates=reference, population_sd=sigma, output_range=[low, high], youngest=youngest)
