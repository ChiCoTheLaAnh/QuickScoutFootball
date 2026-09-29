import importlib.util
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("analytics_operations.py")
SPEC = importlib.util.spec_from_file_location("analytics_operations", SCRIPT)
assert SPEC and SPEC.loader
operations = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operations)


class AnalyticsOperationsTest(unittest.TestCase):
    def test_backfill_rejects_future_logical_date(self):
        with self.assertRaisesRegex(ValueError, "future"):
            operations.parse_logical_date("2026-09-30", date(2026, 9, 29))

    def test_backfill_accepts_past_date_and_each_attempt_has_a_distinct_key(self):
        self.assertEqual(operations.parse_logical_date("2026-09-25", date(2026, 9, 29)), date(2026, 9, 25))
        self.assertNotEqual(operations.make_run_key("100", 1), operations.make_run_key("101", 1))
        self.assertNotEqual(operations.make_run_key("100", 1), operations.make_run_key("100", 2))

    def test_same_run_attempt_has_one_stable_key_for_duplicate_detection(self):
        self.assertEqual(operations.make_run_key("100", 1), operations.make_run_key("100", 1))

    def test_empty_source_fails(self):
        checks = operations.assess_snapshot(
            source={"players": 0, "stats": 0},
            mart={"facts": 0, "duplicate_keys": 0},
            baseline=None,
            accept_new_baseline=False,
        )
        self.assertIn("SOURCE_EMPTY", checks["failures"])

    def test_exact_five_percent_drop_requires_manual_acceptance(self):
        checks = operations.assess_snapshot(
            source={"players": 95, "stats": 190},
            mart={"facts": 190, "duplicate_keys": 0},
            baseline={"players": 100, "stats": 200},
            accept_new_baseline=False,
        )
        self.assertIn("SOURCE_COUNT_DROP", checks["failures"])
        accepted = operations.assess_snapshot(
            source={"players": 95, "stats": 190},
            mart={"facts": 190, "duplicate_keys": 0},
            baseline={"players": 100, "stats": 200},
            accept_new_baseline=True,
        )
        self.assertEqual(accepted["failures"], [])

    def test_fact_mismatch_and_duplicate_fail_even_with_acceptance(self):
        checks = operations.assess_snapshot(
            source={"players": 100, "stats": 200},
            mart={"facts": 199, "duplicate_keys": 1},
            baseline=None,
            accept_new_baseline=True,
        )
        self.assertEqual(checks["failures"], ["FACT_COUNT_MISMATCH", "DUPLICATE_FACT_KEY"])

    def test_changed_source_watermark_or_count_fails_consistency(self):
        before = {"players": 100, "stats": 200, "watermark": "2026-09-29T00:00:00+00:00"}
        after = {**before, "stats": 201}
        self.assertTrue(operations.source_changed(before, after))
        self.assertFalse(operations.source_changed(before, dict(before)))

    def test_watchdog_finds_missing_run_and_old_unprocessed_update(self):
        now = datetime(2026, 9, 29, 20, 47, tzinfo=timezone.utc)
        alerts = operations.health_alerts(
            now=now,
            latest_run=None,
            latest_success={"logical_date": "2026-09-28", "source_watermark": "2026-09-27T00:00:00+00:00"},
            current_source={"players": 100, "stats": 200, "watermark": "2026-09-28T18:00:00+00:00"},
        )
        self.assertEqual(set(alerts), {"MISSING_DAILY_RUN", "SOURCE_UPDATE_DELAYED"})

    def test_watchdog_finds_stuck_and_failed_run(self):
        now = datetime(2026, 9, 29, 20, 47, tzinfo=timezone.utc)
        running = {"status": "running", "started_at": "2026-09-29T17:00:00+00:00", "logical_date": "2026-09-29"}
        failed = {"status": "failed", "started_at": "2026-09-29T19:00:00+00:00", "logical_date": "2026-09-29"}
        success = {"logical_date": "2026-09-29", "source_watermark": "2026-09-29T16:00:00+00:00"}
        source = {"players": 100, "stats": 200, "watermark": "2026-09-29T16:00:00+00:00"}
        self.assertIn("RUN_STUCK", operations.health_alerts(now, running, success, source))
        self.assertIn("RUN_FAILED", operations.health_alerts(now, failed, success, source))

    def test_issue_sync_opens_once_and_closes_on_recovery(self):
        calls = []
        issues = []

        def fake_request(method, path, payload=None):
            calls.append((method, path, payload))
            if method == "GET":
                return list(issues)
            if method == "POST":
                issues.append({"title": payload["title"], "body": payload["body"], "number": 7})
            if method == "PATCH" and payload.get("state") == "closed":
                issues.clear()
            return {}

        with patch.object(operations, "_github_request", side_effect=fake_request):
            operations.sync_issues(["RUN_FAILED"], True)
            operations.sync_issues(["RUN_FAILED"], True)
            operations.sync_issues([], True)

        self.assertEqual([method for method, _, _ in calls].count("POST"), 1)
        self.assertEqual([payload for method, _, payload in calls if method == "PATCH"], [{"state": "closed"}])

    def test_unavailable_state_does_not_close_other_active_alerts(self):
        issue = {"title": "[QuickScout analytics] RUN_FAILED", "body": "old", "number": 3}
        calls = []

        def fake_request(method, path, payload=None):
            calls.append((method, path, payload))
            return [issue] if method == "GET" else {}

        with patch.object(operations, "_github_request", side_effect=fake_request):
            operations.sync_issues(["STATE_UNAVAILABLE"], False)
        self.assertFalse(any(method == "PATCH" and payload == {"state": "closed"} for method, _, payload in calls))

    def test_issue_contains_safe_run_evidence_and_updates_when_it_changes(self):
        issue = {"title": "[QuickScout analytics] RUN_FAILED", "body": "old", "number": 3}
        calls = []

        def fake_request(method, path, payload=None):
            calls.append((method, path, payload))
            return [issue] if method == "GET" else {}

        with patch.object(operations, "_github_request", side_effect=fake_request):
            operations.sync_issues(["RUN_FAILED"], True, {"RUN_FAILED": "Run: https://github.com/example/repo/actions/runs/42 · Code: DBT_BUILD_FAILED"})
        patch_body = next(payload["body"] for method, _, payload in calls if method == "PATCH")
        self.assertIn("actions/runs/42", patch_body)
        self.assertIn("DBT_BUILD_FAILED", patch_body)

    def test_candidate_marts_are_promoted_only_after_both_schemas_exist(self):
        class Cursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement):
                self.statements.append(statement.strip())

            def fetchone(self):
                return (True, True)

        cursor = Cursor()
        operations.promote_candidate(cursor)
        statements = "\n".join(cursor.statements)
        self.assertIn("analytics_candidate_marts", statements)
        self.assertIn("alter schema analytics_candidate_marts rename to analytics_marts", statements)
        self.assertIn("alter schema analytics_candidate_staging rename to analytics_staging", statements)
        self.assertLess(statements.index("to_regnamespace"), statements.index("alter schema analytics_candidate_marts"))


if __name__ == "__main__":
    unittest.main()
