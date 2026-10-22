"""Import-boundary checks for retained orchestrator namespace utilities."""

import importlib
import subprocess
import sys


def test_orchestrator_namespace_does_not_load_retired_workflow_engine():
    script = """
import importlib
import sys

namespace = importlib.import_module('app.orchestrator')
assert not hasattr(namespace, 'StateManager')
assert not hasattr(namespace, 'CheckpointManager')
assert not hasattr(namespace, 'WorkflowOrchestrator')
assert 'app.orchestrator.state_manager' not in sys.modules
assert 'app.orchestrator.checkpoint_manager' not in sys.modules
assert 'app.orchestrator.orchestrator' not in sys.modules
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_retained_rag_utility_imports_from_its_explicit_module():
    module = importlib.import_module("app.orchestrator.rag.scope_engine")

    assert callable(module.compute_effective_scopes)
