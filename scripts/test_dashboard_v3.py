import json
import unittest
from pathlib import Path
from project_dashboard_v3 import project

class DashboardProjectionTest(unittest.TestCase):
    def test_public_artifact_matches_validated_synthetic_pipeline(self):
        source = Path(__file__).resolve().parents[1]/'app/dashboard/recruitment/v3/synthetic.json'
        def check(actual, expected):
            if isinstance(expected, dict):
                self.assertEqual(actual.keys(), expected.keys())
                for key in expected:
                    check(actual[key], expected[key])
            elif isinstance(expected, list):
                self.assertEqual(len(actual), len(expected))
                for left, right in zip(actual, expected):
                    check(left, right)
            elif isinstance(expected, float):
                self.assertAlmostEqual(actual, expected, delta=1e-12)
            else:
                self.assertEqual(actual, expected)
        check(json.loads(json.dumps(project())), json.loads(source.read_text()))
