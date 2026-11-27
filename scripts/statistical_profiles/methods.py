"""Reference-only preprocessing, PCA and descriptive similarity measures."""
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

AXES = {
    "Scoring threat": ("npxg90",),
    "Chance creation": ("xag90",),
    "Ball progression": ("prgc90","prgp90"),
    "Dribbling": ("takeons90","takeon_pct"),
    "Attacking movement": ("box90",),
    "Ball retention": ("completion_pct","miscontrols90","dispossessed90"),
    "Defensive contribution": ("tackles90","interceptions90","recoveries90"),
}
RATIONALE = {
    "goals90":"Penalties and conversion add outcome noise to a stylistic comparison.",
    "npg90":"A realized outcome sensitive to finishing variance. Retain as descriptive context.",
    "npxg90":"Chance volume weighted by chance quality describes recurring scoring threat.",
    "finishing90":"Exactly npg90 minus npxg90 before rounding. Including all three repeats the same information.",
    "shots90":"Shot volume is already a factor of non-penalty xG. Use as a replacement-feature stress test.",
    "sot90":"A subset of shots, partly determined by execution.",
    "npxg_per_shot":"npxG/90 equals shots/90 times shot quality. Per-shot estimates depend on shot count.",
    "xag90":"Weights assisted shots by chance quality. Exposure depends on teammates getting shots off.",
    "key_passes90":"Counts the chance-creation opportunities also contributing to xAG. Test it in place of xAG.",
    "sca90":"Includes passes and non-pass actions already represented by creation and carrying.",
    "prgc90":"Progression by carrying captures a different way to advance play from passing.",
    "prgp90":"Progression by passing complements carrying.",
    "prgr90":"Receiving overlaps box involvement and depends on service. Test as an alternative movement indicator.",
    "takeons90":"Describes successful one-on-one volume.",
    "takeon_pct":"Distinguishes efficiency from successful volume. Inspect attempts before interpreting.",
    "box90":"A directly observed proxy for advanced involvement. Runs without a touch remain unseen.",
    "completion_pct":"Describes passing security, conditional on pass difficulty and intent.",
    "miscontrols90":"Captures failed controls, a separate loss mechanism from tackles.",
    "dispossessed90":"Captures losses to tackles. High involvement can raise this count.",
    "tackles90":"Captures direct defensive challenges, conditional on opponent possession.",
    "interceptions90":"Captures interruption of passing lanes.",
    "recoveries90":"Captures loose-ball recoveries. Share the defending weight with tackles and interceptions.",
    "minutes":"Context for reliability and eligibility. Exposure is outside playing style.",
    "starts":"Context for selection and availability. Exclude from stylistic geometry.",
}


def weights(axes, shares=None):
    columns = [k for keys in axes.values() for k in keys]
    if len(columns) != len(set(columns)) or any(not ks for ks in axes.values()):
        raise ValueError("Each feature must belong to one nonempty category")
    mass = pd.Series(1. if shares is None else shares,index=list(axes),dtype=float)
    if not np.isfinite(mass).all() or (mass<=0).any():
        raise ValueError("Category masses must be positive")
    mass /= mass.sum()
    return pd.Series({k:mass[axis]/len(keys) for axis,keys in axes.items() for k in keys})


def standardized(data, reference, mode="standard"):
    if not data.index.is_unique or not pd.Index(reference).is_unique:
        raise ValueError("Duplicate player identifier")
    if mode not in {"standard","robust","log","winsor"}:
        raise ValueError("Unknown preprocessing mode")
    x = data.copy()
    r = x.loc[reference]
    if not np.isfinite(r.to_numpy()).all():
        raise ValueError("Incomplete fitting population")
    if mode=="log":
        for k in x.columns:
            if k.endswith("90") and k!="finishing90":
                if (x[k].dropna()<0).any():
                    raise ValueError("Negative count rate")
                x[k] = np.log1p(x[k])
    if mode=="winsor":
        x = x.clip(r.quantile(.025),r.quantile(.975),axis=1)
    r = x.loc[reference]
    center, scale = r.mean(), r.std(ddof=0)
    if mode=="robust":
        center = r.median()
        scale = ((r.quantile(.75)-r.quantile(.25))/1.349).replace(0,np.nan).fillna(scale)
    if (scale<=0).any():
        raise ValueError("Constant reference feature")
    return (x-center)/scale


def principal_components(z, reference):
    fit = z.loc[reference]
    center = fit.mean().to_numpy()
    _, s, vt = np.linalg.svd(fit.to_numpy()-center,full_matrices=False)
    # Resolve the arbitrary sign for reproducible plots and interpretation.
    for vector in vt:
        if vector[np.argmax(abs(vector))]<0:
            vector *= -1
    eigen = s*s/(len(fit)-1)
    scores = np.einsum("ij,kj->ik",z.to_numpy()-center,vt)
    names = [f"PC{i+1}" for i in range(len(s))]
    return (pd.Series(eigen,index=names),pd.DataFrame(vt.T,index=z.columns,columns=names),
            pd.DataFrame(scores,index=z.index,columns=names))


def compare(data, reference, candidates, target, axes=AXES, shares=None, mode="standard"):
    if target in candidates or not pd.Index(candidates).is_unique:
        raise ValueError("Invalid candidate population")
    w = weights(axes,shares)
    z = standardized(data.loc[:,w.index],reference,mode)
    if not np.isfinite(z.loc[target]).all():
        raise ValueError("Incomplete target")
    weighted = z*np.sqrt(w)
    delta2 = (weighted-weighted.loc[target])**2
    parts = pd.DataFrame({a:delta2[list(ks)].sum(axis=1,skipna=False) for a,ks in axes.items()})
    diff = z-z.loc[target]
    cosine_norm = np.linalg.norm(weighted.to_numpy(),axis=1)*np.linalg.norm(weighted.loc[target])
    eigen, _, pcs = principal_components(weighted,reference)
    k = int(np.searchsorted((eigen/eigen.sum()).cumsum(), .80)+1)
    projected = pcs.iloc[:,:k]-pcs.iloc[:,:k].loc[target]
    result = pd.DataFrame(index=z.index)
    result["category_rms"] = np.sqrt(parts.sum(axis=1,skipna=False))
    result["standard_rms"] = np.sqrt((diff*diff).mean(axis=1,skipna=False))
    cosine = (np.einsum("ij,j->i",weighted.to_numpy(),weighted.loc[target].to_numpy())) / np.where(cosine_norm>1e-14,cosine_norm,np.nan)
    result["cosine_distance"] = 1-np.clip(cosine,-1,1)
    result["pca_distance"] = np.linalg.norm(projected.to_numpy(),axis=1)
    return result.loc[candidates], parts.loc[candidates], k


def ranks(a,b, *, ascending=True):
    common = pd.concat([a.rename("a"),b.rename("b")],axis=1).dropna().sort_index()
    # Tie-average ranks for movement and association. Stable IDs break ties only at K.
    r = common.rank()
    aa, bb = [list(common[k].sort_values(kind="stable", ascending=ascending).index) for k in common]
    out = dict(common_n=len(common),spearman=float(spearmanr(common.a,common.b).statistic)
               if len(common)>1 and min(common.nunique())>1 else np.nan,
               max_move=(r.a-r.b).abs().max(),median_move=(r.a-r.b).abs().median())
    for k in [5,10,20]:
        out[f"overlap_{k}"] = len(set(aa[:k]) & set(bb[:k])) if len(aa)>=k else np.nan
    return out


def vifs(data):
    z = (data-data.mean())/data.std(ddof=0)
    out = {}
    for key in z:
        y = z[key].to_numpy()
        x = z.drop(columns=key).to_numpy()
        coefficients = np.linalg.lstsq(x,y,rcond=None)[0]
        residual = y-np.einsum("ij,j->i",x,coefficients)
        ratio = np.sum(residual**2)/np.sum(y**2)
        out[key] = np.inf if ratio<1e-12 else 1/ratio
    return pd.Series(out)
