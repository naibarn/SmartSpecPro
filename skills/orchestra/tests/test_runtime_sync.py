from contextlib import ExitStack, redirect_stderr, redirect_stdout
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from skills import portable_install, runtime_sync


class RuntimeSyncTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="runtime-sync-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.repo = self.root / "repo" / "skills"
        self.installed = self.root / "installed" / "skills"
        self.repo.mkdir(parents=True)
        self.installed.mkdir(parents=True)
        self.manifest = self.repo / "mirrored-skills.txt"
        self.manifest.write_text("one\ntwo\n")
        self.write(self.repo, "BACKUP-PLAYBOOK.md", "backup guidance\n")
        self.write(self.installed, "BACKUP-PLAYBOOK.md", "backup guidance\n")
        stack = ExitStack()
        self.addCleanup(stack.close)
        for name, value in {
            "SKILLS_ROOT": self.repo,
            "INSTALLED_ROOT": self.installed,
            "MANIFEST_PATH": self.manifest,
        }.items():
            stack.enter_context(patch.object(runtime_sync, name, value))
        stack.enter_context(patch.object(portable_install, "MANIFEST_PATH", self.manifest))

    def write(self, root, relative, content):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def quiet(self, command):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return command()

    def test_manifest_processes_each_skill_once_in_both_installers(self):
        self.manifest.write_text("one\ntwo\none\n\ntwo\n")
        self.assertEqual(runtime_sync.read_manifest(), ["one", "two"])
        self.assertEqual(portable_install.read_manifest(), ["one", "two"])

    def test_import_replaces_runtime_files_and_preserves_repository_tests(self):
        self.manifest.write_text("one\n")
        self.write(self.repo, "one/SKILL.md", "old instructions\n")
        self.write(self.repo, "one/stale.md", "old runtime reference\n")
        test = self.write(self.repo, "one/tests/test_owned.py", "keep repository tests\n")
        local = self.write(self.repo, "one/.git/local-state", "keep Git state\n")
        self.write(self.installed, "one/SKILL.md", "updated instructions\n")

        self.assertEqual(self.quiet(runtime_sync.sync_from_installed), 0)
        self.assertEqual((self.repo / "one/SKILL.md").read_text(), "updated instructions\n")
        self.assertFalse((self.repo / "one/stale.md").exists())
        self.assertEqual(test.read_text(), "keep repository tests\n")
        self.assertEqual(local.read_text(), "keep Git state\n")
        self.assertEqual(self.quiet(runtime_sync.verify), 0)

    def test_package_round_trip_preserves_outer_sources_and_excluded_tests(self):
        self.manifest.write_text("deep-example\n")
        self.write(self.repo, "deep-example/skills/deep-example/SKILL.md", "package instructions\n")
        outer = self.write(self.repo, "deep-example/README.md", "repository package guide\n")
        test = self.write(self.repo, "deep-example/scripts/tests/test_script.py", "keep script tests\n")
        self.write(self.repo, "deep-example/scripts/tool.py", "old tool\n")
        self.write(self.repo, "deep-example/skills/deep-example/references/old.md", "old reference\n")

        self.assertEqual(self.quiet(runtime_sync.publish_to_installed), 0)
        self.assertTrue((self.installed / "deep-example/SKILL.md").is_file())
        self.assertFalse((self.installed / "deep-example/README.md").exists())
        self.assertFalse((self.installed / "deep-example/scripts/tests/test_script.py").exists())
        self.write(self.installed, "deep-example/scripts/tool.py", "new tool\n")
        (self.installed / "deep-example/references/old.md").unlink()

        self.assertEqual(self.quiet(runtime_sync.sync_from_installed), 0)
        self.assertEqual((self.repo / "deep-example/scripts/tool.py").read_text(), "new tool\n")
        self.assertFalse((self.repo / "deep-example/skills/deep-example/references/old.md").exists())
        self.assertEqual(test.read_text(), "keep script tests\n")
        self.assertEqual(outer.read_text(), "repository package guide\n")
        self.assertEqual(self.quiet(runtime_sync.verify), 0)

    def test_publish_preserves_unmanaged_system_skills_and_local_cache(self):
        self.manifest.write_text("one\n")
        self.write(self.repo, "one/SKILL.md", "canonical instructions\n")
        self.write(self.installed, "one/stale.md", "stale runtime file\n")
        cache = self.write(self.installed, "one/__pycache__/local.pyc", "local cache\n")
        system = self.write(self.installed, ".system/managed/SKILL.md", "host managed\n")
        self.assertEqual(self.quiet(runtime_sync.publish_to_installed), 0)
        self.assertFalse((self.installed / "one/stale.md").exists())
        self.assertEqual(cache.read_text(), "local cache\n")
        self.assertEqual(system.read_text(), "host managed\n")
        self.assertEqual(self.quiet(runtime_sync.verify), 0)

    def test_verification_reports_all_skills_and_shared_guidance_in_one_run(self):
        for name in ("one", "two"):
            self.write(self.repo, f"{name}/SKILL.md", "canonical\n")
            self.write(self.installed, f"{name}/SKILL.md", "stale\n")
        self.write(self.installed, "BACKUP-PLAYBOOK.md", "stale guidance\n")
        errors = io.StringIO()
        with redirect_stderr(errors):
            self.assertEqual(runtime_sync.verify(), 1)
        for name in ("one", "two", "BACKUP-PLAYBOOK.md"):
            self.assertIn(f"drift detected for {name}", errors.getvalue())

    def test_missing_source_preflight_prevents_partial_publish_or_import(self):
        self.write(self.repo, "one/SKILL.md", "canonical\n")
        self.write(self.installed, "one/SKILL.md", "installed\n")
        self.assertEqual(self.quiet(runtime_sync.publish_to_installed), 1)
        self.assertEqual((self.installed / "one/SKILL.md").read_text(), "installed\n")
        self.assertEqual(self.quiet(runtime_sync.sync_from_installed), 1)
        self.assertEqual((self.repo / "one/SKILL.md").read_text(), "canonical\n")

    @unittest.skipIf(os.name == "nt", "symlink creation requires Windows privileges")
    def test_replacement_refuses_to_follow_a_target_symlink(self):
        outside = self.root / "outside"
        outside.mkdir()
        protected = self.write(outside, "owned.md", "keep outside data\n")
        target = self.installed / "one"
        target.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlinked skill directory"):
            runtime_sync.replace_runtime_directory(self.repo, target)
        self.assertEqual(protected.read_text(), "keep outside data\n")

    @unittest.skipIf(os.name == "nt", "symlink creation requires Windows privileges")
    def test_replacement_refuses_nested_runtime_links_before_writing(self):
        outside = self.root / "outside"
        protected = self.write(outside, "tool.py", "keep outside code\n")
        source = self.root / "staged"
        self.write(source, "scripts/tool.py", "incoming code\n")
        target = self.installed / "one"
        target.mkdir()
        for kind in ("directory", "file"):
            with self.subTest(kind=kind):
                if kind == "directory":
                    link = target / "scripts"
                    link.symlink_to(outside, target_is_directory=True)
                else:
                    (target / "scripts").mkdir()
                    link = target / "scripts/tool.py"
                    link.symlink_to(protected)
                with self.assertRaisesRegex(ValueError, "symlinked runtime path"):
                    runtime_sync.replace_runtime_directory(source, target)
                self.assertEqual(protected.read_text(), "keep outside code\n")
                link.unlink()

    @unittest.skipIf(os.name == "nt", "symlink creation requires Windows privileges")
    def test_excluded_environment_symlinks_survive_sync(self):
        self.manifest.write_text("one\n")
        self.write(self.repo, "one/SKILL.md", "canonical\n")
        outside = self.root / "shared-environment"
        outside.mkdir()
        local = self.installed / "one/.venv"
        local.parent.mkdir()
        local.symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.quiet(runtime_sync.publish_to_installed), 0)
        self.assertTrue(local.is_symlink())
        self.assertEqual(self.quiet(runtime_sync.verify), 0)


if __name__ == "__main__":
    unittest.main()
