"""Phase 3.3 synthetic methodology experiment. No historical data input."""
import hashlib
import json
from itertools import combinations
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
import scipy
from scipy.stats import skew
from advanced_features.metrics import METRICS
from statistical_profiles.fixture import fixture, TARGET, SEED
from statistical_profiles.methods import AXES, RATIONALE, standardized, principal_components, compare, ranks, vifs, weights
from statistical_profiles.figures import draw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/".tmp/statistical-profiles-synthetic-v1"


def selection_report(ref, pearson, spearman, folder):
    retained = list(weights(AXES).index)
    all_vif = vifs(ref)
    selected_vif = vifs(ref[retained])
    groups = {k:a for a,ks in AXES.items() for k in ks}
    rows = []
    for m in METRICS:
        key = m.key
        others = [k for k in retained if k!=key]
        companion = spearman.loc[key,others].abs().idxmax()
        rows.append(dict(feature=key,dimension=groups.get(key,m.family),retained=key in retained,
                         strongest_retained_association=companion,pearson=pearson.at[key,companion],
                         spearman=spearman.at[key,companion],vif_all=all_vif[key],
                         vif_selected=selected_vif.get(key),reason=RATIONALE[key]))
    selected = pd.DataFrame(rows).set_index("feature")
    selected.to_csv(folder/"feature-selection.csv")
    return selected


def scenarios(data, reference, candidates, baseline):
    out = []
    def run(label, axes=AXES, shares=None, mode="standard"):
        dist,_,_ = compare(data,reference,candidates,TARGET,axes,shares,mode)
        for method in baseline:
            out.append(dict(scenario=label,method=method,**ranks(baseline[method],dist[method])))
    for mode in ["robust","log","winsor"]:
        run(mode,mode=mode)
    for axis in AXES:
        for multiplier in [.8,1.2]:
            run(f"{axis} × {multiplier}",shares={a:multiplier if a==axis else 1 for a in AXES})
        run(f"Omit {axis}",axes={a:ks for a,ks in AXES.items() if axis!=a})
    run("Retain one loss mechanism",axes={**AXES,"Ball retention":("completion_pct","miscontrols90")})
    run("Remove overlapping take-on volume",axes={**AXES,"Dribbling":("takeon_pct",)})
    for axis,alternative in [("Chance creation","key_passes90"),("Scoring threat","shots90"),("Attacking movement","prgr90")]:
        run(f"Replace {axis} with {alternative}",axes={**AXES,axis:(alternative,)})
    return pd.DataFrame(out).set_index(["method","scenario"])


def bootstrap(data, reference, candidates, baseline):
    # Resample reference players only. Keep each candidate's observed style fixed.
    keys = list(weights(AXES).index)
    w = weights(AXES).to_numpy()
    diffs = (data.loc[candidates,keys]-data.loc[TARGET,keys]).to_numpy()
    fit = data.loc[reference,keys].to_numpy()
    rng = np.random.default_rng(SEED+1)
    positions = []
    for _ in range(200):
        sample = fit[rng.integers(len(fit),size=len(fit))]
        scale = sample.std(axis=0)
        if (scale==0).any():
            raise ValueError("Degenerate bootstrap reference")
        distance = np.sqrt(np.sum(w*(diffs/scale)**2,axis=1))
        positions.append(pd.Series(distance,index=candidates).rank(method="first").to_numpy())
    b = np.array(positions)
    return pd.DataFrame({"rank":baseline.rank(),"p05_rank":np.quantile(b,.05,axis=0),
                         "p95_rank":np.quantile(b,.95,axis=0),"top10_frequency":(b<=10).mean(axis=0)},index=candidates)


def write_report(folder, eda, selection, eig, vectors, method_comparison, sense, boot, k, rank_all, condition):
    share = eig/eig.sum()
    top_skew = eda.skewness.abs().idxmax()
    lines = ["# Playing-style analysis · synthetic experiment", "",
             "The reference contains 169 simulated players. All 108 simulated candidates have complete coverage on the four methods. "
             "The target SIM-000 is fictional. Seventy-eight candidates and the target are in the reference. "
             "The other 30 candidates enter only after training. No historical player values or ranks informed the fixture.", "",
             "## Distributions and redundancy","",
             f"The largest absolute adjusted sample skewness is {eda.at[top_skew,'skewness']:.2f} ({top_skew}). "
             f"There are {int(eda.tukey_outliers.sum())} feature-level 1.5-IQR flags across 24 columns. They remain in the main fit. "
             f"The standardized full matrix has rank {rank_all}/24. Finishing/90 is an exact linear combination of two other columns. "
             f"The retained standardized matrix has condition number {condition:.2f}.",
             "", "![Reference distributions](distributions.png)", "", "![Full correlation matrices](correlations.png)", "",
             "The feature selection below fixes football constructs before inspecting neighbor identities. "
             "The listed association is the largest absolute Spearman correlation with another retained metric. "
             "VIF uses a least-squares regression on all other selected features. Exact collinearity has infinite VIF in the full CSV.",
             "", "| Feature | Decision | Companion | Spearman ρ | Selected VIF | Football rationale |",
             "|---|---|---|---:|---:|---|"]
    for key,r in selection.iterrows():
        vf = f"{r.vif_selected:.2f}" if r.retained else "—"
        lines.append(f"| {key} | {'Keep' if r.retained else 'Context'} | {r.strongest_retained_association} | {r.spearman:.2f} | {vf} | {r.reason} |")
    lines += ["",f"Progressive carries and successful take-ons correlate across categories (Spearman ρ = {selection.at['takeons90','spearman']:.3f} with its strongest retained companion, "
              f"{selection.at['takeons90','strongest_retained_association']}). Category balancing controls feature counts but does not remove shared events. "
              "The take-on removal experiment below tests the consequence of retaining both. "
              f"Dispossessions and miscontrols have selected VIFs of {selection.at['dispossessed90','vif_selected']:.2f} "
              f"and {selection.at['miscontrols90','vif_selected']:.2f}. The one-loss-mechanism variant removes dispossessions. "
              "Both loss types remain inspectable because a failed control and being tackled are distinct scouting observations. "
              "Defending rates likewise share opportunities. "
              "VIF diagnoses linear dependence; it cannot identify whether two observed events have the same football meaning.",
              "", "Age and valuation belong to the recruitment brief. Minutes and starts describe exposure. None enters the distance or PCA.",
              "", "## PCA","",f"The first two exploratory components explain {share.iloc[0]:.1%} and {share.iloc[1]:.1%} "
              f"({share.iloc[:2].sum():.1%} together) of standardized retained-feature variance. Each retained feature has unit variance in this exploratory PCA. "
              "A separate PCA for the distance comparison uses category-balanced coordinates.",
              "", "![Exploratory PCA variance](scree.png)","", "![Two-dimensional projection](profiles-pca.png)",""]
    for pc in ["PC1","PC2"]:
        v = vectors[pc]
        drivers = v.abs().nlargest(4).index
        lines.append(f"- {pc} has its largest signed axis coefficients on "+", ".join(f"{key} ({v[key]:+.2f})" for key in drivers)+
                     ". A positive coordinate follows the positive coefficients and moves against the negative ones.")
    lines += ["", "In this fixture PC1 rises with carrying involvement and possession losses. PC2 rises with defensive actions and falls with successful take-ons. "
              "Those patterns reflect the fixture’s shared carry and defense factors. They provide hypotheses to examine in an authorized empirical cohort.",
              "", "These directions describe covariance in the simulated player population. The two-axis map discards dimensions that can change near-neighbor order. "
              "The eigenvector file gives axis coefficients. The loading file gives correlations between original standardized variables and PC coordinates.",
              "", "## Similarity methods","",
              f"Distances use the eligible 108 only for reporting. Lower distances indicate closer profiles. "
              f"Category RMS averages squared z-score gaps within each dimension, then averages across seven dimensions and takes the square root. "
              "Standard RMS gives every selected feature equal weight, giving three-feature categories three times the weight of a singleton. "
              "Centered weighted cosine uses 1 − cosine. It compares direction and can hide differences in magnitude. A zero-norm profile has no defined cosine. "
              f"PCA distance retains {k} category-balanced PCs sufficient for 80% reference variance and measures distance in that space without whitening. "
              "It discards low-variance differences, even if scouts value them.",
              "", "| Pair | Common | Spearman ρ | Top 5 / 10 / 20 retained | Largest move |", "|---|---:|---:|---|---:|"]
    for _,r in method_comparison.iterrows():
        lines.append(f"| {r['left']} vs {r['right']} | {r.common_n} | {r.spearman:.3f} | {r.overlap_5} / {r.overlap_10} / {r.overlap_20} | {r.max_move:.0f} |")
    lines += ["", "## Sensitivity","",
              f"For {top_skew}, the log variant gives skewness {eda.at[top_skew,'after_log_variant_skewness']:.2f} and winsorization gives "
              f"{eda.at[top_skew,'after_winsor_variant_skewness']:.2f}, compared with {eda.at[top_skew,'skewness']:.2f} on the native scale. "
              "Compressing a tail changes how much exceptional values contribute. The full distribution table shows this effect for every feature.",
              "",
              "All alternatives use the same candidate set. Standardization uses the reference mean and population SD. Robust scaling uses the median and IQR/1.349. "
              "The log experiment applies log1p to nonnegative per-90 counts; rates on the original scale remain available for interpretation. "
              "Winsorization clips to the reference 2.5th and 97.5th percentiles before standardization.",
              "", "The full method-sensitivity CSV repeats each scenario for each of the four methods. The table below shows the proposed category-balanced method.",
              "", "| Variant relative to category RMS | Top ten retained | Rank correlation | Largest move |", "|---|---:|---:|---:|"]
    for label,r in sense.iterrows():
        lines.append(f"| {label} | {int(r.overlap_10)} | {r.spearman:.3f} | {r.max_move:.0f} |")
    lines += ["", f"Across 200 player-level reference resamples, the original top ten’s membership frequencies range from "
              f"{boot.nsmallest(10,'rank').top10_frequency.min():.0%} to {boot.nsmallest(10,'rank').top10_frequency.max():.0%}. "
              "This isolates reference-scaling variability. It does not capture season-to-season variation, sampling error in player events or recruitment relevance.",
              "", "## Proposed use in Phase 3.4","",
              "Use equal-category standardized RMS as the interpretable starting hypothesis. Report the seven additive squared-gap contributions, "
              "raw feature values and denominator sizes. Give cosine and robust-scaling results alongside it when ordering is sensitive. "
              "PCA is a visual exploration. Before assigning any similarity weight to a recruitment score, obtain analytical permission, "
              "repeat the diagnostics on authorized data and measure overlap with the individual performance components. "
              "Compare full, similarity-omitted and individual-dimension-omitted specifications on common coverage. Independent relevance labels are needed to evaluate recruitment accuracy."]
    (folder/"ANALYSIS.md").write_text("\n".join(lines)+"\n")


def build(folder):
    data, reference, candidates = fixture()
    ref = data.loc[reference]
    eda = ref.describe(percentiles=[.25,.5,.75]).T
    eda["missing"] = ref.isna().sum()
    eda["skewness"] = skew(ref,axis=0,bias=False)
    eda["after_log_variant_skewness"] = skew(standardized(ref,reference,"log"),axis=0,bias=False)
    eda["after_winsor_variant_skewness"] = skew(standardized(ref,reference,"winsor"),axis=0,bias=False)
    iqr = eda["75%"]-eda["25%"]
    extreme = (ref < eda["25%"]-1.5*iqr) | (ref > eda["75%"]+1.5*iqr)
    eda["tukey_outliers"] = extreme.sum()
    eda.to_csv(folder/"distributions.csv")
    flags = extreme.stack(); flags[flags].rename("tukey_flag").to_csv(folder/"outliers.csv",index_label=["id","feature"])
    pearson, spearman = ref.corr(),ref.corr(method="spearman")
    pearson.to_csv(folder/"pearson.csv")
    spearman.to_csv(folder/"spearman.csv")
    selection = selection_report(ref,pearson,spearman,folder)
    keys = list(weights(AXES).index)
    z = standardized(data[keys],reference)
    eig, vectors, pcs = principal_components(z,reference)
    pcs.to_csv(folder/"pca-coordinates.csv")
    vectors.to_csv(folder/"pca-axes.csv")
    vectors.mul(np.sqrt(eig*(len(ref)-1)/len(ref)),axis=1).to_csv(folder/"pca-loadings.csv")
    pd.DataFrame({"eigenvalue":eig,"variance_share":eig/eig.sum(),
                  "cumulative_share":(eig/eig.sum()).cumsum()}).to_csv(folder/"pca-variance.csv")
    pd.DataFrame({"mean":ref[keys].mean(),"population_sd":ref[keys].std(ddof=0),
                  "median":ref[keys].median(),"q25":ref[keys].quantile(.25),"q75":ref[keys].quantile(.75),
                  "winsor_low":ref[keys].quantile(.025),"winsor_high":ref[keys].quantile(.975),
                  "feature_mass":weights(AXES)}).to_csv(folder/"reference-fit.csv")
    distance, parts, k = compare(data,reference,candidates,TARGET)
    distance.join(distance.rank().add_suffix("_rank")).to_csv(folder/"method-distances.csv")
    parts.to_csv(folder/"squared-distance-contributions.csv")
    comparisons = pd.DataFrame([dict(left=a,right=b,**ranks(distance[a],distance[b])) for a,b in combinations(distance,2)])
    comparisons.to_csv(folder/"method-comparison.csv",index=False)
    all_sensitivity = scenarios(data,reference,candidates,distance)
    all_sensitivity.to_csv(folder/"method-sensitivity.csv")
    sense = all_sensitivity.loc["category_rms"]
    sense.to_csv(folder/"sensitivity.csv")
    boot = bootstrap(data,reference,candidates,distance.category_rms)
    boot.to_csv(folder/"bootstrap.csv")
    draw(folder,ref,pearson,spearman,eig,pcs,TARGET,candidates)
    write_report(folder,eda,selection,eig,vectors,comparisons,sense,boot,k,
                 np.linalg.matrix_rank(standardized(ref,reference)),np.linalg.cond(z.loc[reference]))
    meta = dict(dataset="synthetic only",seed=SEED,target=TARGET,reference=reference,candidates=candidates,
                standardization="reference mean / population SD",feature_order=keys,dimensions=AXES,
                balanced_pca_components=k,numpy=np.__version__,pandas=pd.__version__,scipy=scipy.__version__)
    (folder/"experiment.json").write_text(json.dumps(meta,indent=2)+"\n")


def main():
    OUTPUT.parent.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=OUTPUT.parent) as tmp:
        folder = Path(tmp)/"study"; folder.mkdir()
        build(folder)
        hashes = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.iterdir())}
        (folder/"manifest.json").write_text(json.dumps(hashes,indent=2)+"\n")
        if OUTPUT.exists():
            if set(p.name for p in OUTPUT.iterdir()) != set(p.name for p in folder.iterdir()) or any(
                    (OUTPUT/p.name).read_bytes()!=p.read_bytes() for p in folder.iterdir()):
                raise ValueError("Existing experiment differs from rebuilt output")
            print("Identical synthetic experiment verified")
        else:
            folder.rename(OUTPUT)
        print(OUTPUT/"ANALYSIS.md")


if __name__ == "__main__":
    main()
