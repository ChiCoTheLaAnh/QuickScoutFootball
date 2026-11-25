# 2017/18 public recruitment integration

The recruitment route opens the Wyscout study. The V3 simulation remains at /dashboard/recruitment/v3. Its synthetic decision brief remains available at /dashboard/recruitment?demo=1. Separate workspaces consume separate typed inputs. Switching routes starts the destination study with its own target and selection.

The server adapter reads the versioned Phase 4.4 release from research/wyscout2017/release. It hashes the exact bytes before parsing, validates the version, profile structure, attribution and seven source records, and rejects a changed file. The isolated production build's Next.js file trace includes the release. App startup and rendering require neither Python, raw events, private files nor provider credentials. For research reproduction see research/wyscout2017/README.md and the profiling and release READMEs.

All five list orders use frozen ranks. The rank column remains the published rank during searches and secondary sorts. The 150 candidates are followed by Sterling's unranked descriptive profile. Salah is the comparison target. Percentile bars and comparison cells preserve null. The radar averages published percentile levels within a dimension for visualization; the distance table uses published squared terms. Video questions appear only where supplied by the release. PCA remains available in the robustness results. Each of the five principal methods has four pairwise comparisons, producing ten distinct benchmark rows.

## Governance and readiness

The only added player-level runtime file is the approved 158,983-byte research JSON, SHA-256 08859017c024dd07261808506f801d704e63810b6d92bc7ba677cde5ea30a254. Its seven Figshare sources, CC BY 4.0 license, transformations and limitations are accessible within the report. The raw acquisition cache and private FBref and Transfermarkt artifacts are outside this checkout. Production dependency tracing identified only the approved JSON for the Wyscout data. No production sharing validator or V2/V3 score or input was edited.

Local verification: production build, TypeScript and lint passed. 162 application tests passed and two hosted tests skipped. All 27 existing analytics tests and 14 Wyscout tests passed. Live browser checks at 1400 and 390 pixels covered all four reports, horizontal overflow, missing values and switching between studies. The five complete visible shortlist orders in both directions matched independently sorted artifact records. The observed browser session had no console warnings or errors.

The standalone Playwright command attempted seven tests. macOS denied the Chromium Mach port during startup, before assertions. Release approval is pending a successful standalone run against the local production server:

```sh
BASE_URL=http://127.0.0.1:3445 npm run test:e2e -- --workers=1
```
