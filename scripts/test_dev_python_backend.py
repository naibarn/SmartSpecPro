"""Bounded checks for shared production dev startup; no application/database imports."""
import ast
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dev_python_backend", ROOT / "scripts/dev-python-backend.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class DevPythonDatabaseModeTests(unittest.TestCase):
    def env(self, **changes):
        return {"ENVIRONMENT": "development", "SMARTSPEC_DEV_DATABASE_MODE": "development", "DATABASE_URL": "postgresql+asyncpg://dev@localhost/smartspec_dev_web", "PYTHON_DOTENV_DISABLED": "1", **changes}

    def run_launcher(self, env):
        with patch.dict(os.environ, env, clear=True), patch.object(os, "execv") as execute:
            launcher.main()
            self.assertTrue(execute.called)

    def test_isolated_database_remains_supported(self):
        self.run_launcher(self.env())

    def test_shared_production_superuser_path_is_rejected(self):
        with self.assertRaises(SystemExit):
            self.run_launcher(self.env(SMARTSPEC_DEV_DATABASE_MODE="shared-production", DATABASE_URL="postgresql+asyncpg://dev@localhost/smartspec"))

    def test_production_debug_requires_separate_readonly_role_url(self):
        with self.assertRaises(SystemExit):
            self.run_launcher(self.env(SMARTSPEC_DEV_DATABASE_MODE="production-readonly", DATABASE_URL="postgresql+asyncpg://dev@localhost/smartspec"))

    def test_production_debug_accepts_dedicated_readonly_role(self):
        self.run_launcher(self.env(SMARTSPEC_DEV_DATABASE_MODE="production-readonly", SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL="postgresql+asyncpg://smartspec_debug_ro@localhost/smartspec"))

    def test_production_debug_rejects_non_readonly_role(self):
        with self.assertRaises(SystemExit):
            self.run_launcher(self.env(SMARTSPEC_DEV_DATABASE_MODE="production-readonly", SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL="postgresql+asyncpg://smartspec@localhost/smartspec"))

    def test_production_launcher_and_dotenv_fallback_stay_rejected(self):
        for change in [{"ENVIRONMENT": "production"}, {"PYTHON_DOTENV_DISABLED": "0"}]:
            with self.assertRaises(SystemExit):
                self.run_launcher(self.env(**change))

    def test_shared_boot_does_not_create_schema_seed_or_start_watchers(self):
        tree = ast.parse((ROOT / "python-backend/app/main.py").read_text())
        lifespan = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == "lifespan")
        guarded = [n for n in lifespan.body if isinstance(n, ast.If) and ast.unparse(n.test) == "runtime_profile.owns_background_work"]
        calls = {ast.unparse(n.func) for block in guarded for n in ast.walk(block) if isinstance(n, ast.Call)}
        for name in ["init_db", "run_seed"]:
            self.assertIn(name, calls)


if __name__ == "__main__":
    unittest.main()
