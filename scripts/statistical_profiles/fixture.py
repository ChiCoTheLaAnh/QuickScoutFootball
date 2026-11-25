"""Seeded invented RW season totals. No archive rows or fitted archive parameters."""
import numpy as np
import pandas as pd

from advanced_features.metrics import METRICS, measure

SEED = 3301
TARGET = "SIM-000"


def fixture(seed=SEED):
    rng = np.random.default_rng(seed)
    ids = [f"SIM-{i:03d}" for i in range(199)]
    rows = []
    for i in range(len(ids)):
        # Independent latent tendencies plus an opportunity factor shared by event counts.
        threat, creation, carry, passing, retention, defense, pace = rng.normal(size=7)
        if i == 0:
            threat, creation, carry = 1.4, 1.1, .65
        starts = int(rng.integers(12, 37))
        minutes = int(np.clip(starts*rng.uniform(65,90) + rng.integers(80,450),1200,3420))
        exposure = minutes/90
        def count(base, tendency):
            return rng.poisson(exposure*base*np.exp(.37*tendency+.10*pace))
        def probability(base, tendency):
            return 1/(1+np.exp(-(base+.32*tendency)))
        shots = count(2.1, threat)
        on_target = rng.binomial(shots, probability(-.65, threat))
        npg = rng.binomial(on_target, probability(-.85, threat))
        npxg = round(shots*probability(-2.25,.6*threat+rng.normal()),1)
        kp = count(1.5, creation)
        attempts = count(3, carry)
        passes = count(28, passing)
        raw = {"Min":minutes, "Starts":starts, "Gls":npg+rng.poisson(.7), "G-PK":npg,
               "npxG":npxg,"Sh":shots,"SoT":on_target,"xAG":round(kp*probability(-2.1,creation+rng.normal()),1),
               "KP":kp,"SCA":kp+count(1.3,creation+.3*carry),"PrgC":count(3,carry),
               "PrgP":count(3,passing+.5*creation),"PrgR":count(5,threat+.4*carry),
               "Succ":rng.binomial(attempts,probability(-.25,retention+.4*carry)),
               "Att_stats_possession":attempts,"Att Pen":count(4,threat+.5*carry),
               "Cmp":rng.binomial(passes,probability(1.3,retention+.4*passing)),"Att":passes,
               "Mis":count(2,carry-retention),"Dis":count(1.5,carry-.6*retention),
               "Tkl":count(1.4,defense),"Int":count(.65,defense),"Recov":count(3.6,defense+.25*passing)}
        rows.append({m.key:measure(m,raw)[2] for m in METRICS})
    data = pd.DataFrame(rows,index=ids)
    # 78 candidates are also peers. Thirty additional candidates are transform-only.
    return data, ids[:169], ids[1:79]+ids[169:]
