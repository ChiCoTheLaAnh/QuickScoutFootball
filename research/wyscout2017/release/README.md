# 2017/18 Salah similarity benchmark · release 1

The static JSON is the input for a separate, attributed retrospective dashboard view. It can be read without Python, private data, a database or API credentials. Use the bundled ranks and values, including explicit nulls. This artifact has its own contract. The existing synthetic V3 loader must remain separate. Integration, presentation and browser testing belong to Phase 4.5.

## Reproduce and verify

Rebuild the [licensed inputs and player seasons](../README.md), then the [approved profiling outputs](../profiling/README.md). From this directory run:

```sh
python3 build.py
python3 -m unittest discover -s .
python3 -m unittest discover -s ../profiling
python3 -m unittest discover -s .. -p test_pipeline.py
```

Use the Phase 4.3 scientific Python environment and ordinary Python mode (assertions enabled). All seven publisher-file checksums are verified on each build. The exporter rereads every domestic fixture and independently counts the 152 published players' attributable actions, wide origins, starts, appearances and playing intervals. Only the chunked JSON decoder is reused from the prior aggregation. Historical clubs are the teams fielding each player, including both sides of transfers. Names and roles are checked by numeric player ID. Eligibility is independently reapplied to all 2,571 validated Phase 4.2 rows. The 151 complete profiles supply the reference means and population SDs. Salah is included in preprocessing and excluded from ranking.

Percentiles are verified by counting lower and tied observations directly. Distances are recomputed with SciPy pairwise distances, the shooting block shares one category weight, and covariance eigendecomposition checks PCA. Export fails on disagreement with any approved distance, rank, feature contribution, percentile, or reported robustness comparison (absolute tolerance 1e-8 for rounded exports). All 27 previously reported robustness rows were checked, including candidate counts, common populations, correlations and both overlap conventions where reported. The independent checker uses the same licensed observations and measurement definitions. It cannot adjudicate unobserved actions or provide ground-truth judgments of player suitability.

## Dashboard contract

- Profile IDs and club IDs are Wyscout identifiers. Match the target by targetId. All stints are historical.
- values and percentiles use the keys in metrics. Percentiles measure the relative level of an observation; high defensive activity, for example, does not establish superior defending. Use the [provider-specific metric definitions](../README.md).
- scores contains distances except for npg, which contains non-penalty goals per 90 sorted descending. attack uses two equally standardized features. cosine is a distance and lower is closer. ranks starts at one.
- squaredContributions contains additive terms whose sum is the primary distance squared. Divide each term by that sum for display as a share. Preserve numbers internally when formatting.
- Salah and Sterling have null rankings for different reasons. Salah is the target. Sterling remains visible with six observed metrics and an explicit null NPG. Retain attribution, transformations and license alongside any export.

## Benchmark interpretation

The two attacking baselines each share six of the primary top ten. Muriel moves from 36th on scoring rate and 30th on two-feature attacking similarity to 10th across all dimensions. Depay leads unweighted Euclidean and ranks third with category weighting. Ronaldo leads both attacking baselines and the primary ranking, despite substantially higher shot volume than Salah. These changes show what the different measurements emphasize. No external relevance labels were used.

The JSON includes the source authors, item links, DOI and license. Data collected by Wyscout; research release by Luca Pappalardo, Emanuele Massucco and the credited source authors. Derived from seven versioned [CC BY 4.0 sources](../sources.json). Cite Pappalardo et al. (2019), *A public data set of spatio-temporal match events in soccer competitions*. Retain the [license link](https://creativecommons.org/licenses/by/4.0/) and identify QuickScout's aggregation, standardization and ranking changes. No FBref or Transfermarkt files are inputs to this exporter. The 2,907-minute figure is included solely as the previously documented external sensitivity assumption, not an observed Wyscout player measurement.
