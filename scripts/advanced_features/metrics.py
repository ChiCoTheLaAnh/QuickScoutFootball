"""Deterministic descriptive features. All opportunities come from the same provider."""
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from math import isfinite
import re


@dataclass(frozen=True)
class Metric:
    key: str
    family: str
    definition: str
    numerator: str
    denominator: str = "Min"
    unit: str = "per 90"
    direction: int = 1
    subtract: str = ""


METRICS = (
    Metric("goals90", "Shooting and finishing", "Goals including penalties", "Gls"),
    Metric("npg90", "Shooting and finishing", "Goals excluding penalties", "G-PK"),
    Metric("npxg90", "Shooting and finishing", "Non-penalty expected goals", "npxG"),
    Metric("finishing90", "Shooting and finishing", "Non-penalty goals minus non-penalty xG", "G-PK", subtract="npxG"),
    Metric("shots90", "Shooting and finishing", "Non-penalty shots", "Sh"),
    Metric("sot90", "Shooting and finishing", "Non-penalty shots on target", "SoT"),
    Metric("npxg_per_shot", "Shooting and finishing", "Rounded non-penalty xG per non-penalty shot", "npxG", "Sh", "xG/shot"),
    Metric("xag90", "Chance creation", "Expected goals of shots assisted", "xAG"),
    Metric("key_passes90", "Chance creation", "Passes directly leading to shots", "KP"),
    Metric("sca90", "Chance creation", "Shot-creating actions, up to two preceding each shot", "SCA"),
    Metric("prgc90", "Ball progression", "Provider-classified progressive carries", "PrgC"),
    Metric("prgp90", "Ball progression", "Completed progressive passes", "PrgP"),
    Metric("prgr90", "Ball progression", "Completed progressive passes received", "PrgR"),
    Metric("takeons90", "Dribbling", "Successful take-ons", "Succ"),
    Metric("takeon_pct", "Dribbling", "Successful take-ons as share of attempts", "Succ", "Att_stats_possession", "%"),
    Metric("box90", "Attacking movement", "Touches inside the attacking penalty area", "Att Pen"),
    Metric("completion_pct", "Ball retention", "Completed passes as share of attempts", "Cmp", "Att", "%"),
    Metric("miscontrols90", "Ball retention", "Failed attempts to control the ball", "Mis", direction=-1),
    Metric("dispossessed90", "Ball retention", "Possessions lost while tackled", "Dis", direction=-1),
    Metric("tackles90", "Defensive contribution", "Players tackled", "Tkl"),
    Metric("interceptions90", "Defensive contribution", "Opponent passes intercepted", "Int"),
    Metric("recoveries90", "Defensive contribution", "Loose balls recovered", "Recov"),
    Metric("minutes", "Availability", "Domestic league minutes played", "Min", "", "minutes"),
    Metric("starts", "Availability", "Domestic league starts", "Starts", "", "starts"),
)
RAW = sorted({field for m in METRICS for field in (m.numerator, m.denominator, m.subtract) if field})


def combined(row):
    return bool(re.fullmatch(r"(?:\d+\s+(?:squads?|clubs?|teams?)|total|tot)", row["Squad"].strip(), re.I))


def pooled(stints):
    """Only independent club stints with unique keys may contribute."""
    rows = [s for s in stints if not combined(s)]
    if not rows:
        return dict.fromkeys(RAW)
    for cols in [("Rk",), ("Comp", "Squad")]:
        keys = [tuple(r[c] for c in cols) for r in rows]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate source stint")
    totals = {}
    for col in RAW:
        values = [r[col] for r in rows]
        observed = [float(v) for v in values if v not in ("", None)]
        if any(not isfinite(v) or v < 0 for v in observed):
            raise ValueError(f"Invalid {col}")
        totals[col] = sum(observed) if len(observed) == len(rows) else None
    return totals


def measure(metric, totals):
    num = totals[metric.numerator]
    if metric.subtract:
        sub = totals[metric.subtract]
        num = None if num is None or sub is None else num - sub
    den = totals[metric.denominator] if metric.denominator else None
    if num is None or (metric.denominator and den is None):
        return num, den, None, "missing_source_value"
    if not metric.denominator:
        return num, den, num, ""
    if den == 0:
        return num, den, None, "zero_denominator"
    if metric.unit == "%" and num > den:
        raise ValueError(f"Successes exceed attempts in {metric.key}")
    scale = {"%":100, "per 90":90, "xG/shot":1}[metric.unit]
    return num, den, scale * num / den, ""


def percentile(sorted_sample, value, direction):
    if value is None or not sorted_sample:
        return None
    value = round(value,12)
    mid = (bisect_left(sorted_sample, value) + bisect_right(sorted_sample, value)) / 2
    n = len(sorted_sample)
    return 100 * (mid if direction == 1 else n-mid) / n
