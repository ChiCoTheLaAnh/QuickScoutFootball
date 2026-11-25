"""Standalone PNG research figures for the simulated reference experiment."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def save(fig, path):
    fig.savefig(path,dpi=160,bbox_inches="tight",facecolor="white")
    plt.close(fig)


def draw(folder, ref, pearson, spearman, eigen, scores, target, candidates):
    plt.rcParams.update({"font.size":9,"axes.spines.top":False,"axes.spines.right":False})
    keys = list(ref)
    fig, axs = plt.subplots(4,6,figsize=(15,8.8),layout="constrained")
    units = {"minutes":"min", "starts":"starts","npxg_per_shot":"xG / shot"}
    for key, ax in zip(keys,axs.flat):
        ax.hist(ref[key],bins="auto",color="#367f79")
        ax.set_title(key,loc="left",fontsize=10)
        ax.set_xlabel(units.get(key,"%" if key.endswith("pct") else "per 90"))
        ax.tick_params(labelsize=7)
    fig.suptitle("Distributions across 169 simulated right-wing peers · player counts",fontsize=16)
    save(fig,folder/"distributions.png")

    fig, axs = plt.subplots(1,2,figsize=(17,8.5),layout="constrained")
    for ax, matrix, name in zip(axs,[pearson,spearman],["Pearson · linear","Spearman · rank"]):
        im = ax.imshow(matrix,cmap="RdBu_r",vmin=-1,vmax=1,interpolation="nearest")
        ax.set_xticks(range(len(keys)),keys,rotation=90,fontsize=8)
        ax.set_yticks(range(len(keys)),keys,fontsize=8)
        ax.set_title(name,fontsize=13)
    fig.colorbar(im,ax=axs,shrink=.65,label="Correlation coefficient")
    fig.suptitle("Feature correlations · 169 synthetic reference players",fontsize=16)
    save(fig,folder/"correlations.png")

    share = eigen/eigen.sum()
    x = np.arange(1,len(eigen)+1)
    fig,ax = plt.subplots(figsize=(8,4.2),layout="constrained")
    ax.bar(x,share*100,color="#598d8a",label="Individual component")
    ax.plot(x,share.cumsum()*100,"o-",color="#9b4d29",label="Cumulative")
    ax.axhline(80,ls=":",color="#888")
    ax.set(xlabel="Principal component",ylabel="Reference variance (%)",xticks=x,ylim=(0,105),
           title="Scree plot · standardized style features, synthetic reference")
    ax.legend()
    save(fig,folder/"scree.png")

    fig,ax = plt.subplots(figsize=(8,5.5),layout="constrained")
    ref_only = ref.index.difference([*candidates,target])
    for ids, color, label, marker in [(ref_only,"#b6b8b4","Reference only","o"),
                                        (ref.index.intersection(candidates),"#34776d","Reference and candidate","o"),
                                        (scores.index.difference(ref.index),"#9d5f38","Candidate outside reference","^")]:
        ax.scatter(scores.loc[ids,"PC1"],scores.loc[ids,"PC2"],s=22,color=color,label=label,marker=marker,alpha=.8)
    t = scores.loc[target]
    ax.scatter(t.PC1,t.PC2,marker="*",s=180,color="#502264",label="Synthetic target")
    ax.axhline(0,color="#ddd",zorder=0)
    ax.axvline(0,color="#ddd",zorder=0)
    ax.set(xlabel=f"PC1 ({share.iloc[0]:.1%})",ylabel=f"PC2 ({share.iloc[1]:.1%})",
           title="Playing-style projection · synthetic players")
    ax.legend(fontsize=8)
    ax.set_aspect("equal",adjustable="datalim")
    save(fig,folder/"profiles-pca.png")
