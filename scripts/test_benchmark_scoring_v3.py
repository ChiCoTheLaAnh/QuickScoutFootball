import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd

from benchmark_scoring_v3 import build, frontier, midrank


class ScoringTests(unittest.TestCase):
    def test_percentile_boundaries_and_ties(self):
        np.testing.assert_allclose(midrank([-1, 1, 2, 9, np.nan], [1, 1, 3]),
                                   [0, 100/3, 200/3, 100, np.nan])
        with self.assertRaises(ValueError):
            midrank([1], [np.nan])

    def test_pareto_equal_price_and_duplicate_profiles(self):
        points = pd.DataFrame([[1, 2, -3], [1, 2, -3], [1, 1, -3], [2, 1, -4]])
        self.assertEqual(frontier(points).tolist(), [0, 0, 2, 0])

    def test_complete_benchmark(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            build(root)
            rows = pd.read_csv(root / "explanations.csv", index_col=0)
            methods = pd.read_csv(root / "methods.csv")
            self.assertEqual(len(rows), 108)
            self.assertTrue(rows.index.is_unique)
            self.assertNotIn("SIM-000", rows.index)
            self.assertEqual(len(methods), 10)
            self.assertTrue((methods.common_n == 108).all())
            self.assertTrue((rows.v3.between(0, 100)).all())
            np.testing.assert_allclose(rows.filter(like="_points").sum(axis=1), rows.v3)
            np.testing.assert_allclose(rows.filter(like="squared_gap_").sum(axis=1), rows.distance**2)
            np.testing.assert_allclose(rows.advanced_similarity, 100/(1+rows.distance))
            np.testing.assert_allclose(rows.baseline_a, rows.goals90 + rows.assists90)
            np.testing.assert_allclose(rows.performance, (rows.npxg90_pct + rows.xag90_pct)/2)
            for pair in methods.itertuples():
                for k in (5, 10, 20):
                    first = rows.sort_index()[pair.first].nlargest(k).index
                    second = rows.sort_index()[pair.second].nlargest(k).index
                    self.assertEqual(getattr(pair, f"overlap_{k}"), len(first.intersection(second)))
            variants = pd.read_csv(root / "scenario-ranks.csv", index_col=0)
            np.testing.assert_allclose(variants["similarity only"], rows.advanced_similarity_rank)
            pareto = pd.read_csv(root / "pareto.csv", index_col=0)
            self.assertGreater((pareto.dominated_by_count == 0).sum(), 1)
