import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from transfermarkt_inventory import audit


class InventoryTest(unittest.TestCase):
    def test_cutoff_thresholds_and_separate_releases(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            raw = root / "raw"
            raw.mkdir()
            def table(name, header, rows):
                with (raw / f"{name}.csv").open("w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(header.split())
                    writer.writerows(rows)

            ids = range(1, 8)
            table("players", "player_id name sub_position position date_of_birth",
                  [(i, f"fixture-{i}", "Right Winger", "Attack", "1999-07-01") for i in ids])
            table("competitions", "competition_id", [["GB1"]])
            table("games", "game_id competition_id season date home_club_id away_club_id",
                  [(n, "GB1", 2024, "2025-06-30" if n <= 15 else "2025-07-01", 1, 2) for n in range(1, 17)])
            apps = [(n, i, 1 if n < 10 else 2, 80 if i != 3 else 0, 0, 0)
                    for n in range(1, 17) for i in ids]
            table("appearances", "game_id player_id player_club_id minutes_played goals assists", apps + [apps[0]])
            table("player_valuations", "player_id date market_value_in_eur",
                  [(i, "2025-06-30", 45000001 if i == 2 else 45000000) for i in ids if i != 4]
                  + [(1, "2025-07-01", 90000000), (5, "2025-06-30", 1)])
            table("game_lineups", "game_id player_id club_id position",
                  [(1, i, 1, "Right Winger") for i in (1, 3)] + [(1, 2, 2, "Right Winger")])

            for mode in ("strict", "retrospective", "repeat"):
                metadata = dict(url="urn:test:fixture", version="test", mode="strict" if mode=="repeat" else mode,
                                published_at=None if mode == "retrospective" else "2025-06-30T12:00:00Z")
                (raw / "source.json").write_text(json.dumps(metadata))
                audit(raw, root / mode)
            def rows(mode):
                with (root / mode / "players.csv").open() as f:
                    return {r["player_id"]:r for r in csv.DictReader(f)}
            s = rows("strict")
            self.assertEqual([s[str(i)]["status"] for i in range(1, 6)],
                             ["eligible", "over_budget", "below_threshold_observed", "unverified_price", "unverified_price"])
            self.assertEqual(s["1"]["observed_minutes"], "1200")
            self.assertEqual(s["1"]["age_years"], "25")
            self.assertEqual(s["1"]["observed_rw_games"], "1")
            self.assertEqual(rows("retrospective")["2"]["status"], "unresolved_position")
            self.assertEqual(rows("retrospective")["3"]["observed_rw_games"], "0")
            self.assertEqual((root/"strict/players.csv").read_bytes(), (root/"repeat/players.csv").read_bytes())
            metadata.update(mode="strict", published_at="2026-01-01T00:00:00Z")
            (raw / "source.json").write_text(json.dumps(metadata))
            with self.assertRaisesRegex(ValueError, "after the strict cutoff"):
                audit(raw, root/"invalid")
