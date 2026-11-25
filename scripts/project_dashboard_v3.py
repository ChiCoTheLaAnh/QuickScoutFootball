"""Project exclusively reproducible synthetic research outputs into the public demo."""
import json
from tempfile import TemporaryDirectory
from pathlib import Path

import pandas as pd
import numpy as np
from benchmark_scoring_v3 import build, midrank
from statistical_profiles.fixture import fixture, TARGET
from statistical_profiles.methods import AXES
from advanced_features.metrics import METRICS

def project():
    data, peers, ids = fixture()
    with TemporaryDirectory() as tmp:
        stage = Path(tmp)
        build(stage)
        def read(name):
            return pd.read_csv(stage/name, index_col=0, float_precision="round_trip")
        rows = read("explanations.csv")
        pareto = read("pareto.csv")
        metrics = [dict(key=m.key, label=m.definition, unit=m.unit,
                        group=next((a for a,keys in AXES.items() if m.key in keys),m.family))
                   for m in METRICS]
        profiles = []
        for pid in [TARGET,*ids]:
            values = data.loc[pid]
            if pid in ids:
                np.testing.assert_allclose(rows.loc[pid,values.index],values,rtol=1e-14)
            pct = [float(midrank(values[m.key], data.loc[peers,m.key])) for m in METRICS]
            profiles.append(dict(id=pid,values=values.tolist(),
                                 pct=[p if m.direction==1 else 100-p for m,p in zip(METRICS,pct)]))
        return dict(metrics=metrics,axes=AXES,profiles=profiles,rows=rows.to_dict("index"),
                    frontier=pareto.index[pareto.dominated_by_count==0].tolist(),
                    pairs=pd.read_csv(stage/"methods.csv").to_dict("records"),
                    sensitivity=read("sensitivity.csv").to_dict("index"))
if __name__ == "__main__":
    dest = Path(__file__).resolve().parents[1]/"app/dashboard/recruitment/v3/synthetic.json"
    dest.write_text(json.dumps(project(),allow_nan=False,separators=(",",":"))+"\n")
