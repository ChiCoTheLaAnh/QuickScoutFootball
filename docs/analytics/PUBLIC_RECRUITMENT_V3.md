# Advanced recruitment dashboard

Open `/dashboard/recruitment/v3` after `npm ci` and `npm run dev`. The public recruitment views use fictional candidates. V3 compares 108 synthetic candidates against a fictional target across 24 measurements using a 169-player synthetic reference population. Adjust the performance, similarity and feasibility weights to see how preferences change the shortlist. The default 40/40/20 split is experimental.

The checked-in synthetic fixture supports a clean production build. To reproduce it, install `scripts/statistical_profiles/requirements.txt` and run `python3 scripts/project_dashboard_v3.py`. Historical datasets and named-player reports are outside this release. The simulated comparisons establish behavior and reproducibility. Independent labels would be needed to evaluate recruitment accuracy.
