"""Guard API cold-start boundaries without loading archived execution code."""
import ast
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).parents[1]


class ApplicationImportBoundaryTests(unittest.TestCase):
    def test_shared_utility_namespace_does_not_boot_the_retired_engine(self):
        result = subprocess.run([sys.executable, "-c", (
            "import sys; import app.orchestrator; "
            "assert not any(name in sys.modules for name in "
            "('app.orchestrator.orchestrator', 'app.orchestrator.factory_orchestrator', "
            "'app.orchestrator.state_manager', 'app.orchestrator.checkpoint_manager')); "
            "print('UTILITY_NAMESPACE_ONLY')"
        )], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout.strip(), "UTILITY_NAMESPACE_ONLY")

    def test_api_registration_and_budget_namespace_have_no_legacy_execution_imports(self):
        tree = ast.parse((ROOT / "app/main.py").read_text())
        routers = next(node for node in tree.body if isinstance(node, ast.ImportFrom) and node.module == "app.api")
        self.assertFalse({"orchestrator"} & {item.name for item in routers.names})
        agents = ast.parse((ROOT / "app/orchestrator/agents/__init__.py").read_text())
        imports = [node.module for node in ast.walk(agents) if isinstance(node, ast.ImportFrom)]
        self.assertEqual(imports, ["app.orchestrator.agents.budget_controller"])


if __name__ == "__main__":
    unittest.main()
