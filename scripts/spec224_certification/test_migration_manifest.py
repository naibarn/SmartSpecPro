import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from migration_manifest import build_manifest


class MigrationManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="spec224-manifest-")
        self.root = Path(self.temp_dir.name)
        self.drizzle = self.root / "apps/web/drizzle"
        (self.drizzle / "meta").mkdir(parents=True)
        (self.drizzle / "meta/_journal.json").write_text(
            json.dumps(
                {
                    "version": "7",
                    "dialect": "postgresql",
                    "entries": [
                        {"idx": 0, "tag": "0000_base", "when": 1},
                        {"idx": 1, "tag": "0001_child", "when": 2},
                    ],
                }
            ),
            encoding="utf-8",
        )
        (self.drizzle / "0000_base.sql").write_text(
            "CREATE TABLE public.tenants (id text PRIMARY KEY);\n",
            encoding="utf-8",
        )
        (self.drizzle / "0001_child.sql").write_text(
            "CREATE TABLE public.jobs (tenant_id text REFERENCES public.tenants(id));\n",
            encoding="utf-8",
        )
        (self.drizzle / "0002_unjournaled.sql").write_text(
            "CREATE TABLE public.pending_data (tenant_id text REFERENCES public.tenants(id));\n",
            encoding="utf-8",
        )
        (self.drizzle / "meta/0146_snapshot.json").write_text(
            json.dumps({"id": "same-id", "prevId": "parent-id"}), encoding="utf-8"
        )
        (self.drizzle / "meta/0147_snapshot.json").write_text(
            json.dumps({"id": "same-id", "prevId": "parent-id"}), encoding="utf-8"
        )

        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.name", "Manifest Test"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "manifest@example.invalid"], cwd=self.root, check=True)
        subprocess.run(
            ["git", "add", "apps/web/drizzle/0000_base.sql", "apps/web/drizzle/meta/_journal.json"],
            cwd=self.root,
            check=True,
        )
        subprocess.run(["git", "commit", "-qm", "fixture baseline"], cwd=self.root, check=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_manifest_records_journal_hash_dependencies_and_unknown_applied_state(self):
        manifest = build_manifest(self.root)
        entries = {item["tag"]: item for item in manifest["migrations"]}

        self.assertEqual(entries["0001_child"]["journal_idx"], 1)
        self.assertEqual(
            [item["migration"] for item in entries["0001_child"]["depends_on"]],
            ["0000_base"],
        )
        self.assertEqual(entries["0001_child"]["git_status"], "untracked")
        self.assertEqual(entries["0001_child"]["applied_status"], "unknown")
        self.assertEqual(entries["0001_child"]["approval_status"], "not_granted")
        self.assertEqual(len(entries["0001_child"]["sha256"]), 64)

    def test_unjournaled_sql_is_never_claimed_as_part_of_canonical_chain(self):
        manifest = build_manifest(self.root)
        pending = next(item for item in manifest["migrations"] if item["tag"] == "0002_unjournaled")

        self.assertIsNone(pending["journal_idx"])
        self.assertEqual(pending["chain_status"], "excluded_not_journaled")
        self.assertEqual(pending["applied_status"], "unknown")
        self.assertEqual([item["migration"] for item in pending["depends_on"]], ["0000_base"])

    def test_snapshot_duplicate_ids_are_reported_without_editing_metadata(self):
        manifest = build_manifest(self.root)
        snapshots = manifest["related_snapshots"]

        self.assertEqual([item["id"] for item in snapshots], ["same-id", "same-id"])
        self.assertEqual(manifest["consistency"]["duplicate_0146_0147_snapshot_ids"], ["same-id"])
        self.assertTrue((self.drizzle / "meta/0147_snapshot.json").exists())

    def test_fingerprint_is_stable_for_the_same_tree(self):
        first = build_manifest(self.root)
        second = build_manifest(self.root)

        self.assertEqual(first["manifest_sha256"], second["manifest_sha256"])

    def test_fingerprint_covers_every_manifest_field_except_itself(self):
        manifest = build_manifest(self.root)
        payload = dict(manifest)
        fingerprint = payload.pop("manifest_sha256")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

        self.assertEqual(hashlib.sha256(canonical.encode("utf-8")).hexdigest(), fingerprint)

    def test_manifest_does_not_claim_a_database_schema_baseline_without_a_target(self):
        manifest = build_manifest(self.root)

        self.assertEqual(
            manifest["schema_baseline"]["database_status"],
            "not_observed_no_approved_target",
        )
        self.assertIsNone(manifest["schema_baseline"]["database_catalog_fingerprint"])


if __name__ == "__main__":
    unittest.main()
