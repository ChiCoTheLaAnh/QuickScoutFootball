from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dags"))

from pipeline_checks import classify_idempotency


class PipelineChecksTest(unittest.TestCase):
    def test_unchanged_source_and_mart_are_verified(self):
        previous = {"row_count": 20, "checksum": "same", "source_updated_at": "2026-08-01T00:00:00+00:00"}
        current = {"row_count": 20, "checksum": "same"}
        self.assertEqual(classify_idempotency(previous, current, 20, "2026-08-01T00:00:00+00:00"), "verified")

    def test_legitimate_source_update_can_change_fact_checksum(self):
        previous = {"row_count": 20, "checksum": "old", "source_updated_at": "2026-08-01T00:00:00+00:00"}
        current = {"row_count": 20, "checksum": "new"}
        self.assertEqual(classify_idempotency(previous, current, 20, "2026-08-02T00:00:00+00:00"), "source_updated")

    def test_unexplained_mart_change_fails(self):
        previous = {"row_count": 20, "checksum": "old", "source_updated_at": "2026-08-01T00:00:00+00:00"}
        current = {"row_count": 20, "checksum": "new"}
        with self.assertRaisesRegex(RuntimeError, "without a source update"):
            classify_idempotency(previous, current, 20, "2026-08-01T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
