import unittest
from pathlib import Path
import tempfile

from tools.spec_handoff.spec_ids import (
    build_registry_projection,
    next_safe_ids,
    resolve_spec_id,
    validate_registry,
)


def alias(old_id="000", new_id="296", old_path="specs/feature/000-old/spec.md"):
    return {
        "old_spec_id": old_id,
        "new_spec_id": new_id,
        "logical_title": "Old Spec",
        "old_path": old_path,
        "canonical_path": "specs/feature/296-old/spec.md",
        "source_digest": "a" * 64,
        "canonical_digest": "b" * 64,
        "disposition_reason": "ID collision; preserved historical identity.",
        "authority_evidence": ["evidence.md#L1"],
        "baseline_sha": "c" * 40,
        "integrated_sha": "d" * 40,
        "effective_state": "ACTIVE",
        "semantic_reference_repair_status": "COMPLETE",
    }


class SpecIdRegistryTests(unittest.TestCase):
    def test_allocator_skips_all_current_reserved_historical_and_alias_ids(self):
        inventory = {"records": [
            *[{"spec_id": str(n), "root_kind": "CANONICAL"} for n in ["000", "289", "290", "291", "292", "293", "294", "295"]],
            {"spec_id": "2026", "root_kind": "ALTERNATE", "record_kind": "HISTORICAL_CANDIDATE", "slug": "2026-09-15-recovery-notes"},
            {"spec_id": "2026", "root_kind": "CANONICAL", "record_kind": "PLANNING_ARTIFACT", "slug": "2026-09-16-planning-note"},
        ]}
        registry = {
            "reserved_spec_ids": ["296"],
            "historical_spec_ids": ["297"],
            "aliases": [alias(old_id="045", new_id="298")],
        }
        self.assertEqual(next_safe_ids(inventory, registry, 3), ["299", "300", "301"])

    def test_alias_resolution_uses_identity_and_preserves_current_canonical_owner(self):
        registry = {"aliases": [alias()]}
        self.assertEqual(resolve_spec_id("000", registry, canonical_spec_ids={"000"}), "000")
        self.assertEqual(resolve_spec_id("000", registry, old_path="specs/feature/000-old/spec.md"), "296")

    def test_registry_rejects_alias_loops_and_multiple_targets(self):
        loop = {"schema_version": 1, "registry_version": 1, "reserved_spec_ids": [], "historical_spec_ids": [], "aliases": [alias("000", "296"), alias("296", "000", "specs/feature/296-old/spec.md")], "historical_dispositions": []}
        self.assertIn("alias graph contains a loop", validate_registry(loop))
        fork = {"schema_version": 1, "registry_version": 1, "reserved_spec_ids": [], "historical_spec_ids": [], "aliases": [alias("000", "296"), alias("000", "297", "specs/feature/000-other/spec.md")], "historical_dispositions": []}
        self.assertTrue(any("resolves to multiple targets" in error for error in validate_registry(fork)))

    def test_projection_never_turns_alias_into_canonical_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            config = repo / "specs/_config/spec-id-registry.json"
            config.parent.mkdir(parents=True)
            import json
            config.write_text(json.dumps({
                "schema_version": 1, "registry_version": 1,
                "reserved_spec_ids": [], "historical_spec_ids": [],
                "aliases": [alias()], "historical_dispositions": [],
            }), encoding="utf-8")
            inventory = {"records": [{
                "root_kind": "CANONICAL", "record_kind": "CANONICAL_SPEC",
                "spec_id": "296", "spec_path": "specs/feature/296-old/spec.md",
                "digest": "b" * 64,
            }]}
            projection = build_registry_projection(repo, inventory)
            self.assertFalse(projection["alias_creates_authority"])
            self.assertEqual(projection["aliases"][0]["old_spec_id"], "000")
            with self.assertRaises(ValueError):
                build_registry_projection(repo, {"records": []})


if __name__ == "__main__":
    unittest.main()
