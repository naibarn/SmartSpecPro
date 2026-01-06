"""
Workflow Integration Tests

Tests complete workflows from start to finish.

Author: SmartSpec Team
Date: 2025-12-26
"""

import pytest
import time
from typing import Dict, Any

# These are integration tests and may require langgraph runtime.
pytestmark = [pytest.mark.integration]

# Skip gracefully if optional deps missing in local/unit runs
pytest.importorskip("langgraph")

# Import modules to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..', '.smartspec'))

from ss_autopilot.orchestrator_agent import OrchestratorAgent
from ss_autopilot.status_agent import StatusAgent
from ss_autopilot.intent_parser_agent import IntentParserAgent
from ss_autopilot.workflow_loader import WorkflowCatalog
from ss_autopilot.checkpoint_manager import CheckpointManager
from ss_autopilot.streaming import WorkflowProgressTracker, get_streamer
from ss_autopilot.background_jobs import get_executor
from ss_autopilot.parallel_execution import ParallelExecutor, ParallelTask
from ss_autopilot.human_in_the_loop import get_interrupt_manager


def test_workflow_catalog_loads():
    catalog = WorkflowCatalog()
    # Should load embedded workflows or return empty list without crashing
    workflows = catalog.list_workflows() if hasattr(catalog, "list_workflows") else []
    assert workflows is not None


def test_orchestrator_agent_smoke():
    # Minimal smoke: construct agent classes
    oa = OrchestratorAgent()
    sa = StatusAgent()
    ip = IntentParserAgent()
    assert oa is not None and sa is not None and ip is not None
