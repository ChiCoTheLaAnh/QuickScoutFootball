# Wyscout 2017/18 validation

All seven pinned inputs passed publisher MD5 and local SHA-256 verification. Source cost was $0.

| League | Clubs | Played fixtures with events | Events | Anonymous events | Duplicate event IDs |
|---|---:|---:|---:|---:|---:|
| England | 20 | 380 | 643,150 | 48,031 | 0 |
| France | 20 | 380 | 632,807 | 47,295 | 0 |
| Germany | 18 | 306 | 519,407 | 37,244 | 0 |
| Italy | 20 | 380 | 647,372 | 46,787 | 0 |
| Spain | 20 | 380 | 628,659 | 46,681 | 0 |

2,571 identified players, 124 with multiple observed club/league stints. Player zero is an anonymous placeholder and is excluded. Fixture-level coverage cannot prove that every action was recorded. The JSON itemizes specifically how many shots, passes and other actions lacked an attributable player.

## Metric coverage

| Metric | Missing / 2,571 | Missing % | Available among 152 eligible | Salah |
|---|---:|---:|---:|---:|
| minutes | 105 | 4.08% | 152 | 2922 |
| starts | 0 | 0.00% | 152 | 34 |
| npg90 | 127 | 4.94% | 151 | 0.954825 |
| np_shots90 | 114 | 4.43% | 152 | 4.312115 |
| sot90 | 114 | 4.43% | 152 | 2.125257 |
| key_passes90 | 114 | 4.43% | 152 | 0.585216 |
| progressive90 | 114 | 4.43% | 152 | 3.511294 |
| completion_pct | 7 | 0.27% | 152 | 78.142077 |
| interceptions90 | 114 | 4.43% | 152 | 1.047228 |
| wide_share | 185 | 7.20% | 152 | 0.6225523295070898 |

One team-score discrepancy remains: England match 2499781, team 1625, recorded score 1 versus zero attributable scoring events. A goalkeeper-side event alone cannot identify the scorer. Fourteen player seasons have NPG withheld from this fixture. 105 seasons have quarantined minutes and another nine have zero regulation minutes. The JSON lists the affected fixtures and IDs.

## Target and reference

Mohamed Salah Ghaly, born 15 June 1992, Wyscout 120353, Liverpool 1612. Across 36 appearances and 34 starts he scored 32, including 31 non-penalty goals. All four checks agree with the [independent season table](https://fbref.com/en/squads/822bd0ba/2017-2018/Liverpool-Stats). Its 2,907 minutes differ by 15 from the 2,922 reconstructed here. The exact allocation of the difference has not been reconciled match by match. All reported rates use 2,922.

Salah recorded 140 non-penalty shots, 69 on-target shots including penalties, 19 tagged key passes, 114 completed forward-progress passes, 34 interception tags and 715 completed passes from 915 attempts. These event totals are provider-defined. His 922 wide origins among 1,481 attacking-half actions place him inside the reference rule.

Holding role, exposure and volume filters fixed, a 50% wide-share cutoff admits 220 forwards, versus 152 at 60%. This sensitivity limits positional certainty. The primary group includes Salah and 151 other players; membership does not imply tactical equivalence.

Data credit: Wyscout; Luca Pappalardo, Emanuele Massucco and the credited Figshare item authors. This report aggregates and transforms the [seven source items](sources.json) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
