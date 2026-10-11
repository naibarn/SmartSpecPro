"""Guard the staging migration's existing database serialization boundary."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/apply-vertical-drama-assurance-migration.yml"
MIGRATION_RUNNER = ROOT / "apps/web/scripts/db-migrate-with-receipt.ts"


class MigrationAttemptSerializationTests(unittest.TestCase):
    def test_staging_migration_uses_a_transaction_scoped_lock_and_bounded_wait(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("BEGIN;", workflow)
        self.assertIn("SET LOCAL lock_timeout = '5s';", workflow)
        self.assertIn(
            "pg_advisory_xact_lock(hashtextextended('smartaihub:vertical-drama:assurance:migration:0245', 0))",
            workflow,
        )

    def test_duplicate_attempt_that_observes_an_active_receipt_does_not_run_drizzle(self) -> None:
        runner = MIGRATION_RUNNER.read_text(encoding="utf-8")
        self.assertIn('priorDecision === "IN_PROGRESS"', runner)
        self.assertIn("process.exitCode = 75", runner)
        self.assertIn("await closeDb()", runner)


if __name__ == "__main__":
    unittest.main()
