# Salah at Liverpool, 2017/18

A retrospective description of on-ball activity in five domestic leagues. This separate study has no recruitment score, prices, target-distance ranking or connection to the public dashboard.

## Reproduce

From the repository root, using Python 3.9+ and curl:

```sh
python3 -m unittest discover -s research/wyscout2017
python3 research/wyscout2017/pipeline.py
```

The first run fetches seven pinned publisher files to the gitignored `.tmp/wyscout/raw`. Subsequent runs reuse only SHA-256-matching files. The pipeline streams domestic event files, excludes international competitions and writes `player_seasons.csv` and `validation.json` in `.tmp/wyscout/derived`. The CSV contains one row per positive Wyscout player ID with appearances or attributable events. The JSON reports coverage, field-level missing counts, unassigned events and statistics, flagged team-matches and the target row. Divide missing counts by the reported player count for overall missingness. The study uses all publicly released 2017/18 domestic fixtures retrospectively, rather than claiming the files existed at season end.

## License and public reuse

Credit Luca Pappalardo and Emanuele Massucco and the authors listed on each source item, Wyscout (event collection), and Pappalardo et al., *A public data set of spatio-temporal match events in soccer competitions*, Scientific Data (2019), DOI 10.1038/s41597-019-0247-7. See [versioned source manifest](sources.json) for separate author lists, original item URLs, license links, file IDs, byte lengths, publisher MD5 and locally verified SHA-256. All seven individual items carry [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Sharing and adaptation, including commercial reuse, are permitted with attribution, license notice and a description of changes. The derived table aggregates domestic events, reconstructs minutes and defines its own location measures. A portfolio report can publish these attributed derivatives. Source credits must accompany downloadable tables as well as charts. No badge, logo, endorsement, unrelated valuation feed or other provider's rights are assumed. Production integration requires a separate review of this artifact under the existing sharing validator.

## Feature dictionary

The raw unit is an attributable event. All columns ending in 90 use 90 times the pooled season count divided by the player's reconstructed regulation minutes. Clubs and leagues are pooled by player ID before rates; stints preserve competition and historical team IDs. Count zero means no qualifying attributed event. Anonymous events are never allocated to a named player. Player counts are therefore observed counts and may understate actual activity. No expected-goal, carry or tracking statistics are estimated.

| Field | Event or denominator |
|---|---|
| goals, npg | Goal tag 101 on shot event, direct free-kick shot, penalty or goal-tagged corner. Exclude own goals (102) and goalkeeper mirror events. NPG additionally excludes penalties (35). Own goals are credited only to the opposite team for fixture reconciliation. |
| np_shots | Shot event 10, direct free-kick shot 33 and goal-tagged corner, excluding penalties and own goals. |
| sot | Same shot family including penalties, tagged goal or in-goal destination 1201–1209. Woodwork alone does not qualify. Provider location-based measure. |
| key_passes | Tag 302, counted once per event. Assists do not automatically count. |
| progressive | Completed event-type 8 pass (1801) moving at least 10 points forward on Wyscout's attacking-direction 0–100 x-axis. A study-specific straight-line progress measure. Excludes restarts and does not measure distance to goal. |
| passes, completed, completion_pct | Event-type 8 attempts, accurate-tagged subset, and 100 × completed / attempts. No-attempt percentage is missing. |
| interceptions | Any event carrying interception tag 1401. Includes actions categorized under multiple event types. |
| starts, appearances, minutes | Starting XI, starting or substituted on, and whole regulation minutes. Cap substitution minutes at 90. Dismissals use the event's period plus elapsed minute capped at half-end; formation red-card minute provides a fallback. A stoppage-time appearance may earn zero minutes. |
| att_half, wide, wide_share | Origins at x ≥ 50 of passes, shot events, ground attacking duels, accelerations and touches. Wide uses y ≤ 30 or y ≥ 70. Share = wide / att_half; missing if no qualifying origin. |

Match sheets must report played status, the pinned league season, 11 starters per team and every ordered fixture pairing. Conflicting duplicate event IDs stop the build. Null substitution lists are ambiguous; affected starter exposures are quarantined. Event-only participants, inconsistent substitutions and unresolved dismissal times flag the affected denominators. Flagged exposure produces blank minutes and per-90s. Score mismatches quarantine NPG across the affected team appearance; raw goals remain observed event totals. Zero-minute rates remain blank. Missing endpoints invalidate the progressive count. Anonymity and incomplete event classification can affect any observed count even if the CSV cell is populated.

## Positional reference

Require a publisher-classified Forward, at least 1,200 reliable regulation minutes, at least 100 qualifying attacking-half origins, complete origin evidence and at least 60% of those origins in the outside lanes. The majority threshold identifies forwards who repeatedly act wide on either flank. It excludes wide midfielders classified as midfielders and may include mobile central forwards. It measures neither nominal RW starts nor off-ball occupation. Use feature-specific complete cases and show denominators. Broad role labels and the share thresholds need football review before a subsequent similarity study. Ground attacking duels can include shielding and contact; this release does not publish a successful-dribble measure.
