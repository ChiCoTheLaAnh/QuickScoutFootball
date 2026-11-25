# Which wide forwards resembled Salah in 2017/18?

Cristiano Ronaldo, M. Philipp and M. Depay are the nearest complete profiles under the primary specification. Ronaldo matches Salah closely in non-penalty scoring frequency but shoots considerably more often. The neighborhood is much more stable to the minutes convention than to the definition of a wide forward.

## Reproduction and provenance

Reproduce the [Phase 4.2 table](../README.md) first. From this directory run `python3 analyze.py` and `python3 -m unittest -v test_analysis`. Tested with Python 3.9, NumPy 2.0.2, pandas 2.2.2, SciPy 1.13.1 and Matplotlib 3.8.4. The input SHA-256 is checked before analysis. The script writes the tables, reports and figures under results. Frequencies are per 90 regulation minutes; pass completion is a percentage. Full event definitions and exposure exceptions are documented upstream.

Credit Wyscout, Luca Pappalardo, Emanuele Massucco and the authors listed in the [individual source records](../sources.json), Pappalardo et al., *A public data set of spatio-temporal match events in soccer competitions*, Scientific Data (2019). All derived player tables and figures here use those seven [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) inputs. Changes include aggregation, filtering, standardization, percentiles and distances. Carry these credits with public exports.

## Population and measurement

152 provider-classified forwards had reliable exposure of at least 1,200 minutes, at least 100 qualifying attacking-half actions and at least 60% wide origins. Exactly one eligible player, R. Sterling, lacks reliable NPG. His observed metrics are retained in profiles.csv. Percentiles use 100 × (average tied rank − 0.5) / available N across the positional group, with higher percentiles denoting higher observed rates. N is 151 for NPG and 152 otherwise. All four methods use the same 151 complete profiles for fitting, including the target; the rankings contain 150 peers. Minutes, starts and wide share describe exposure and eligibility. They do not contribute to distance.

## Exploratory findings

Minutes span 1,203–3,246, with a median of 1,970 and interquartile range 1,624–2,448. Shorter exposures produce noisier scoring rates. All six event rates are right-skewed (skewness 0.91–1.52); completion is left-skewed (−0.53). The Tukey rule flags four NPG, five shot-volume and six on-target observations. Extremes remain in the primary analysis because exceptional volume is relevant to this question. Distributions and flags are supplied for every numeric measurement, including contextual totals.

Non-penalty shots and shots on target correlate at Pearson 0.898 and Spearman 0.807. NPG and shots on target correlate at 0.731 and 0.664. Separating scoring outcome from activity retains an important football distinction, but the two dimensions still share signal. The shooting block splits its weight equally between its two measures. This reduces duplicate influence without assuming statistical independence.

Single-league groups range from 22 forwards in Germany to 40 in France. Three multi-league players form their own reporting group. Median minutes range from 1,749 in Spain to 2,066 in Italy. Median NPG/90 is 0.299 in France and 0.199 in Italy. These descriptive differences combine player selection, opportunity, opponents and teams. They cannot identify a league-strength adjustment. The primary distances use a pooled reference; no possession, team-role or opponent adjustment is available.

## Choice of distance

Use the square root of the mean squared standardized gap across six equally weighted categories. Scoring uses NPG/90; shooting averages the squared gaps in non-penalty shots and on-target shots; the other four categories each use one observed metric. Standardization uses complete-reference means and population SDs. Each squared feature term is additive before taking the root. Report absolute distances and contribution shares together. A nearest neighbor can still be more than one typical standardized unit away. Category weights are an interpretive choice. No career outcomes, transfer fees or relevance labels enter the calculation.

Ordinary Euclidean weights every standardized feature equally, increasing the effective shooting weight. Centered cosine distance (1 minus cosine) emphasizes direction from the reference mean and can overlook magnitude. PCA Euclidean uses unwhitened scores through the first component crossing 85% cumulative variance (four axes, 89.85%). The first two axes capture 66.81%: PC1 emphasizes shooting volume and scoring, PC2 forward passing and key passes. Full-space evidence should accompany the two-dimensional plot. PCA can discard low-variance but football-relevant contrasts. Stable numeric player-ID order resolves equal distances at shortlist boundaries; reported tied ranks share the minimum rank.

## Robustness and interpretation

Against category distance, ordinary Euclidean, cosine and PCA share 9, 10 and 9 of the top ten respectively; Spearman correlations are 0.978, 0.907 and 0.963. Individual order is less stable than membership. Dropping NPG leaves only one of the top five and seven of the top ten. The separate six-feature run that admits Sterling again retains seven of ten. All other leave-one-feature-out runs retain eight or nine. Median/IQR scaling and 2.5/97.5 percentile clipping each retain nine. Doubling each category in turn retains eight to ten.

At a 50% wide-origin threshold, 218 complete candidates compete and only five of the original top ten remain. On the common candidate IDs, all ten remain in the restricted top ten. New entrants explain most of the shift. The 900-, 1,500- and 1,800-minute floors retain nine, seven and six respectively. Recomputing Salah's per-90 inputs with 2,907 minutes instead of 2,922 and refitting preserves all top ten (Spearman 0.9999). The robustness CSV distinguishes unrestricted overlap from overlap on the intersection. Both rank correlations always use common candidates; Kendall uses tau-b.

The evidence describes recorded actions. It cannot establish run timing, pressing instructions, chance quality or suitability for Liverpool. Candidate reports provide matched measurements and a video question for each gap. All findings are retrospective.
