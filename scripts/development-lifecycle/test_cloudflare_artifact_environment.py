"""Publisher configuration must survive exact-source isolation without leaking into builds."""
import os
import subprocess
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from canonical_source import _cloudflare_artifact_publication_process


class CloudflareArtifactEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.env_file = self.repo / "apps/web/.env"
        self.env_file.parent.mkdir(parents=True)

    def process(self, environment=None, canonical=None):
        with patch.dict(os.environ, environment or {}, clear=True):
            before = dict(os.environ)
            result = _cloudflare_artifact_publication_process(
                self.repo, self.repo / "results", "a" * 40, "fixture-build", canonical_user_workspace=canonical,
            )
            self.assertEqual(dict(os.environ), before)
            return result

    def test_original_server_env_is_loaded_before_publisher_imports_without_copying_secrets(self):
        self.env_file.write_text("DATABASE_URL=fixture-secret\nLLM_ENCRYPTION_KEY=fixture-key\n")
        command, environment = self.process()
        self.assertLess(command.index("dotenv/config"), command.index("scripts/publish-cloudflare-staging-artifact.ts"))
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(self.env_file))
        self.assertEqual(environment["DOTENV_CONFIG_QUIET"], "true")
        self.assertNotIn("DATABASE_URL", environment)
        self.assertNotIn("LLM_ENCRYPTION_KEY", environment)
        self.assertNotIn("fixture-secret", str(command) + str(environment))

    def test_injected_environment_has_priority_over_dotenv(self):
        self.env_file.touch()
        command, environment = self.process({"DATABASE_URL": "injected", "DOTENV_CONFIG_OVERRIDE": "true"})
        self.assertIn("dotenv/config", command)
        self.assertEqual(environment["DATABASE_URL"], "injected")
        self.assertNotIn("DOTENV_CONFIG_OVERRIDE", environment)

    def test_explicit_environment_path_overrides_server_default(self):
        self.env_file.touch()
        _, environment = self.process({"SMARTSPEC_ARTIFACT_ENV_FILE": "private/artifact.env"})
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(self.repo / "private/artifact.env"))

    def test_existing_dotenv_path_remains_supported(self):
        _, environment = self.process({"DOTENV_CONFIG_PATH": "private/existing.env"})
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(self.repo / "private/existing.env"))

    def test_no_implicit_dotenv_discovery_when_caller_has_no_file(self):
        command, environment = self.process({"R2_ACCOUNT_ID": "injected-account"})
        self.assertNotIn("dotenv/config", command)
        self.assertNotIn("DOTENV_CONFIG_PATH", environment)
        self.assertEqual(environment["R2_ACCOUNT_ID"], "injected-account")

    def linked_workspace(self):
        def git(*args):
            subprocess.run(["git", *map(str, args)], check=True, capture_output=True)
        git("init", self.repo)
        git("-C", self.repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture")
        task = self.repo / "task-checkout"
        git("-C", self.repo, "worktree", "add", "--detach", task)
        self.env_file.write_text("DATABASE_URL=fixture-secret\nLLM_ENCRYPTION_KEY=fixture-key\n")
        return task

    def test_linked_task_uses_configured_canonical_workspace_without_copying_secrets(self):
        canonical, task = self.repo, self.linked_workspace()
        self.repo = task
        command, environment = self.process(canonical=canonical)
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(canonical / "apps/web/.env"))
        self.assertEqual(environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"], "canonical_workspace")
        self.assertIn("dotenv/config", command)
        self.assertNotIn("DATABASE_URL", environment)
        self.assertNotIn("fixture-secret", str(command) + str(environment))
        self.assertFalse((task / "apps/web/.env").exists())

    def test_unrelated_clone_cannot_become_an_implicit_secret_source(self):
        canonical, task = self.repo, self.linked_workspace()
        foreign = canonical / "foreign-clone"
        subprocess.run(["git", "clone", str(canonical), str(foreign)], check=True, capture_output=True)
        (foreign / "apps/web").mkdir(parents=True)
        (foreign / "apps/web/.env").write_text("DATABASE_URL=foreign-fixture-secret\n")
        self.repo = task
        command, environment = self.process(canonical=foreign)
        self.assertNotIn("dotenv/config", command)
        self.assertNotIn("DOTENV_CONFIG_PATH", environment)
        self.assertEqual(environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"], "process")

    def test_caller_file_and_explicit_override_keep_precedence_over_canonical_fallback(self):
        canonical, task = self.repo, self.linked_workspace()
        self.repo = task
        task_env = task / "apps/web/.env"
        task_env.parent.mkdir(parents=True)
        task_env.touch()
        _, environment = self.process(canonical=canonical)
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(task_env))
        self.assertEqual(environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"], "caller")
        _, environment = self.process({"SMARTSPEC_ARTIFACT_ENV_FILE": "private/missing.env"}, canonical=canonical)
        self.assertEqual(environment["DOTENV_CONFIG_PATH"], str(task / "private/missing.env"))
        self.assertEqual(environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"], "explicit")

    def test_configured_subdirectory_is_not_a_canonical_workspace(self):
        canonical, task = self.repo, self.linked_workspace()
        nested = canonical / "nested"
        (nested / "apps/web").mkdir(parents=True)
        (nested / "apps/web/.env").touch()
        self.repo = task
        command, environment = self.process(canonical=nested)
        self.assertNotIn("dotenv/config", command)
        self.assertNotIn("DOTENV_CONFIG_PATH", environment)

    def test_relative_or_non_repository_fallback_is_never_discovered(self):
        for canonical in (Path("relative/path"), self.repo):
            command, environment = self.process(canonical=canonical)
            self.assertNotIn("dotenv/config", command)
            self.assertNotIn("DOTENV_CONFIG_PATH", environment)


if __name__ == "__main__":
    unittest.main()
