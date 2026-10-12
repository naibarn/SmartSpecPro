from __future__ import annotations

import re
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPOSITORY_ROOT / ".github/workflows/apply-vertical-drama-assurance-migration.yml"
CONFIRMATION = "apply-vertical-drama-0245-staging"


class MigrationWorkflowContractTests(unittest.TestCase):
    def test_staging_migration_is_manual_only_and_requires_confirmation(self) -> None:
        source = WORKFLOW.read_text(encoding="utf-8")
        on_block = re.search(
            r"(?ms)^on:\s*\n(.*?)(?=^[A-Za-z_][A-Za-z0-9_-]*:\s*$|\Z)",
            source,
        )
        self.assertIsNotNone(on_block)
        triggers = re.findall(r"(?m)^  ([A-Za-z_][A-Za-z0-9_-]*):", on_block.group(1))
        self.assertEqual(["workflow_dispatch"], triggers)
        self.assertRegex(
            source,
            r"(?m)^    if: \$\{\{ github\.event_name == 'workflow_dispatch' && "
            r"inputs\.confirm == 'apply-vertical-drama-0245-staging' \}\}$",
        )
        self.assertIn(f"Type {CONFIRMATION} to confirm the staging migration.", source)

    def test_runner_temp_is_not_used_in_job_level_environment(self) -> None:
        source = WORKFLOW.read_text(encoding="utf-8")
        job_header = source.split("jobs:", 1)[1].split("steps:", 1)[0]
        self.assertNotRegex(job_header, r"\$\{\{\s*runner\.")
        self.assertGreaterEqual(
            source.count("MIGRATION_RECEIPT_FILE: ${{ runner.temp }}"), 2
        )


if __name__ == "__main__":
    unittest.main()
