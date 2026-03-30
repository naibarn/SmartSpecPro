from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc import registry  # noqa: E402
from isc.models import PatchProposal  # noqa: E402
from isc.proposals import apply_patch_payload, save_patch_proposal  # noqa: E402


class RegistryRootMixin:
    def setUp(self) -> None:
        super().setUp()
        self._old_canonical = registry.CANONICAL_SKILLS_DIR
        self._old_legacy = registry.LEGACY_SKILLS_DIR
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)
        registry.CANONICAL_SKILLS_DIR = self.tmp_path / "canonical"
        registry.LEGACY_SKILLS_DIR = self.tmp_path / "legacy"
        registry.CANONICAL_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        registry.LEGACY_SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        registry.CANONICAL_SKILLS_DIR = self._old_canonical
        registry.LEGACY_SKILLS_DIR = self._old_legacy
        self._tmp.cleanup()
        super().tearDown()

    def _write_skill(
        self,
        root: Path,
        skill_name: str,
        *,
        display_name: str,
        version: str = "1.0.0",
    ) -> Path:
        skill_dir = root / skill_name
        (skill_dir / "python").mkdir(parents=True, exist_ok=True)
        (skill_dir / "tests").mkdir(parents=True, exist_ok=True)
        (skill_dir / "skill.md").write_text(
            "\n".join(
                [
                    "---",
                    f'name: "{display_name}"',
                    f'version: "{version}"',
                    f'description: "Skill for {display_name}"',
                    'tags: [alpha, beta]',
                    "---",
                    "",
                    f"# {display_name}",
                ]
            ),
            encoding="utf-8",
        )
        (skill_dir / "python" / "skill.py").write_text(
            "def respond(input, context=None):\n    return '{\"success\": true}'\n",
            encoding="utf-8",
        )
        (skill_dir / "tests" / "tests.json").write_text(
            json.dumps({"tests": [{"id": "smoke", "input": {}, "expected_contains": ["success"]}]}),
            encoding="utf-8",
        )
        return skill_dir


class RegistryTests(RegistryRootMixin, unittest.TestCase):
    def test_resolve_skill_dir_prefers_canonical_root(self) -> None:
        self._write_skill(registry.CANONICAL_SKILLS_DIR, "demo-skill", display_name="Canonical Demo")
        self._write_skill(registry.LEGACY_SKILLS_DIR, "demo-skill", display_name="Legacy Demo")

        resolved = registry.resolve_skill_dir("demo-skill")
        manifest = registry.load_manifest("demo-skill")
        listed = registry.list_skills()

        self.assertEqual(resolved, registry.CANONICAL_SKILLS_DIR / "demo-skill")
        self.assertEqual(manifest.name, "Canonical Demo")
        self.assertIn("demo-skill", listed)

    def test_resolve_skill_files_falls_back_to_legacy_fixture(self) -> None:
        self._write_skill(registry.LEGACY_SKILLS_DIR, "legacy-only", display_name="Legacy Only")

        files = registry.resolve_skill_files("legacy-only")

        self.assertTrue(files.is_legacy)
        self.assertEqual(files.skill_dir, registry.LEGACY_SKILLS_DIR / "legacy-only")
        self.assertEqual(files.bundle_dir, registry.LEGACY_SKILLS_DIR / "legacy-only")
        self.assertEqual(files.code_path, registry.LEGACY_SKILLS_DIR / "legacy-only" / "python" / "skill.py")
        self.assertEqual(files.tests_path, registry.LEGACY_SKILLS_DIR / "legacy-only" / "tests" / "tests.json")

    def test_resolve_skill_files_prefers_mjs_entrypoint(self) -> None:
        skill_dir = registry.CANONICAL_SKILLS_DIR / "genjs-demo"
        (skill_dir / "js").mkdir(parents=True, exist_ok=True)
        (skill_dir / "tests").mkdir(parents=True, exist_ok=True)
        (skill_dir / "skill.md").write_text(
            "---\nname: GenJS Demo\ndescription: Demo\ncategory: automation\nexecution_mode: sandbox-command\n---\n",
            encoding="utf-8",
        )
        (skill_dir / "js" / "skill.mjs").write_text(
            "export async function respond(input, context = null) { return JSON.stringify({ success: true, output: 'ok' }); }\n",
            encoding="utf-8",
        )
        (skill_dir / "tests" / "tests.json").write_text(
            json.dumps({"tests": [{"id": "smoke", "input": {}, "expected_contains": ["ok"]}]}),
            encoding="utf-8",
        )

        files = registry.resolve_skill_files("genjs-demo")
        manifest = registry.load_manifest("genjs-demo")

        self.assertEqual(files.code_path, skill_dir / "js" / "skill.mjs")
        self.assertEqual(manifest.entrypoint, "js/skill.mjs")

    def test_resolve_skill_files_supports_nested_genjs_bundle(self) -> None:
        skill_dir = registry.CANONICAL_SKILLS_DIR / "bundle-demo"
        bundle_dir = skill_dir / "bundle"
        (bundle_dir / "src").mkdir(parents=True, exist_ok=True)
        (bundle_dir / "tests").mkdir(parents=True, exist_ok=True)
        (bundle_dir / "skill.md").write_text(
            "---\nname: Bundle Demo\ndescription: Demo\ncategory: slide_generation\nexecution_mode: sandbox-command\n---\n",
            encoding="utf-8",
        )
        (bundle_dir / "skill.manifest.json").write_text(
            json.dumps({"name": "bundle-demo", "entry": "src/index.mjs"}),
            encoding="utf-8",
        )
        (bundle_dir / "src" / "index.mjs").write_text(
            "export async function respond(input, context = null) { return JSON.stringify({ success: true, output: 'bundle ok' }); }\n",
            encoding="utf-8",
        )
        (bundle_dir / "tests" / "tests.json").write_text(
            json.dumps({"tests": [{"id": "smoke", "input": {}, "expected_contains": ["bundle ok"]}]}),
            encoding="utf-8",
        )

        files = registry.resolve_skill_files("bundle-demo")
        manifest = registry.load_manifest("bundle-demo")

        self.assertEqual(files.skill_dir, skill_dir)
        self.assertEqual(files.bundle_dir, bundle_dir)
        self.assertEqual(files.code_path, bundle_dir / "src" / "index.mjs")
        self.assertEqual(manifest.entrypoint, "src/index.mjs")


class ProposalTests(unittest.TestCase):
    def test_apply_patch_payload_writes_relative_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "demo-skill"
            payload = json.dumps(
                {
                    "python/skill.py": "print('ok')\n",
                    "tests/tests.json": "{\"tests\": []}\n",
                }
            )

            changed = apply_patch_payload(skill_dir, payload)

            self.assertEqual(
                [p.relative_to(skill_dir).as_posix() for p in changed],
                ["python/skill.py", "tests/tests.json"],
            )
            self.assertEqual((skill_dir / "python" / "skill.py").read_text(encoding="utf-8"), "print('ok')\n")

    def test_apply_patch_payload_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "demo-skill"
            payload = json.dumps({"../escape.txt": "nope"})

            with self.assertRaises(RuntimeError):
                apply_patch_payload(skill_dir, payload)

    def test_save_patch_proposal_writes_json_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            proposals_dir = Path(tmpdir)
            proposal = PatchProposal(
                skill_name="demo-skill",
                created_at_iso="2026-03-06T12:00:00Z",
                rationale="test rationale",
                patch_payload=json.dumps({"python/skill.py": "print('saved')\n"}),
            )

            payload_path, meta_path = save_patch_proposal(proposals_dir, proposal, {"mode": "auto"})

            self.assertEqual(payload_path.suffix, ".json")
            self.assertTrue(meta_path.name.endswith(".meta.json"))
            self.assertEqual(
                json.loads(payload_path.read_text(encoding="utf-8")),
                {"python/skill.py": "print('saved')\n"},
            )
            self.assertEqual(json.loads(meta_path.read_text(encoding="utf-8"))["mode"], "auto")


if __name__ == "__main__":
    unittest.main()
