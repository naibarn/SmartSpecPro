"""Publisher configuration must survive exact-source isolation without leaking into builds."""
import os
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

    def process(self, environment=None):
        with patch.dict(os.environ, environment or {}, clear=True):
            before = dict(os.environ)
            result = _cloudflare_artifact_publication_process(
                self.repo, self.repo / "results", "a" * 40, "fixture-build",
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


if __name__ == "__main__":
    unittest.main()
