from __future__ import annotations

import sys
import unittest
from pathlib import Path

from airflow.models import DagBag


AIRFLOW_DIR = Path(__file__).resolve().parents[1]
DAGS_DIR = AIRFLOW_DIR / "dags"
sys.path.insert(0, str(DAGS_DIR))


class QuickScoutDagContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dag_bag = DagBag(dag_folder=str(DAGS_DIR))
        cls.dag = cls.dag_bag.dags.get("quickscout_analytics")

    def test_dag_imports_without_errors(self) -> None:
        self.assertEqual(self.dag_bag.import_errors, {})
        self.assertIsNotNone(self.dag)

    def test_dag_has_expected_runtime_contract(self) -> None:
        assert self.dag is not None

        self.assertEqual(self.dag.task_ids, [
            "validate_source_data",
            "retry_probe",
            "dbt_build",
            "dbt_test",
            "verify_idempotency",
            "summarize_run",
        ])
        self.assertFalse(self.dag.catchup)
        self.assertEqual(self.dag.max_active_runs, 1)
        self.assertEqual(self.dag.schedule, "@daily")

        for task in self.dag.tasks:
            self.assertEqual(task.retries, 2)
            self.assertEqual(task.retry_delay.total_seconds(), 15)

    def test_dag_has_linear_dependency_chain(self) -> None:
        assert self.dag is not None

        task_ids = self.dag.task_ids
        for upstream_id, downstream_id in zip(task_ids, task_ids[1:]):
            upstream = self.dag.get_task(upstream_id)
            self.assertEqual(upstream.downstream_task_ids, {downstream_id})

        self.assertEqual(
            self.dag.get_task(task_ids[-1]).downstream_task_ids,
            set(),
        )

    def test_retry_probe_only_fails_first_attempt_when_requested(self) -> None:
        from quickscout_pipeline import should_simulate_failure

        self.assertTrue(should_simulate_failure(simulate_retry=True, try_number=1))
        self.assertFalse(should_simulate_failure(simulate_retry=True, try_number=2))
        self.assertFalse(should_simulate_failure(simulate_retry=False, try_number=1))


if __name__ == "__main__":
    unittest.main()
