"""Shared fixtures for /deep-project tests."""

import os
import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def hermetic_home(tmp_path, monkeypatch):
    """Redirect HOME to a per-test temp dir and strip ambient session vars.

    task_storage writes to Path.home()/".claude"/"tasks"; without this, tests
    (and every subprocess that inherits os.environ, e.g. run_setup_session)
    would pollute the developer's real ~/.claude/tasks/. Stripping
    DEEP_SESSION_ID and CLAUDE_CODE_TASK_LIST_ID also prevents ambient session
    state — e.g. from a live Claude Code / deep-* plugin session — from leaking
    into "no env" cases and making those assertions non-deterministic.
    """
    home = tmp_path / "hermetic_home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("DEEP_SESSION_ID", raising=False)
    monkeypatch.delenv("CLAUDE_CODE_TASK_LIST_ID", raising=False)
    yield


@pytest.fixture
def fixtures_dir():
    """Return path to test fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def mock_session_id():
    """Return a mock session ID for testing."""
    return "test-session-12345"


@pytest.fixture
def mock_session_env(mock_session_id, monkeypatch):
    """Set DEEP_SESSION_ID environment variable for testing."""
    monkeypatch.setenv("DEEP_SESSION_ID", mock_session_id)
    return mock_session_id


@pytest.fixture
def mock_tasks_dir(tmp_path, mock_session_id, monkeypatch):
    """Create mock tasks directory and patch Path.home() to use it."""
    mock_home = tmp_path / "mock_home"
    mock_home.mkdir()
    tasks_dir = mock_home / ".claude" / "tasks" / mock_session_id
    tasks_dir.mkdir(parents=True)

    # Patch Path.home() to return mock_home
    monkeypatch.setattr(Path, "home", lambda: mock_home)

    return tasks_dir


@pytest.fixture
def sample_requirements(fixtures_dir):
    """Load sample requirements file content."""
    return (fixtures_dir / "sample_requirements.md").read_text()


@pytest.fixture
def tmp_planning_dir(tmp_path):
    """Create temporary planning directory with sample input."""
    planning_dir = tmp_path / "planning"
    planning_dir.mkdir()

    # Create sample input file
    input_file = planning_dir / "rough_plan.md"
    input_file.write_text("# Sample Project\n\nBuild something cool.")

    return planning_dir


@pytest.fixture
def mock_plugin_root(tmp_path):
    """Create mock plugin root directory with expected structure."""
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()

    # Create expected plugin directory structure
    (plugin_root / ".claude-plugin").mkdir()
    (plugin_root / "scripts" / "lib").mkdir(parents=True)
    (plugin_root / "scripts" / "checks").mkdir(parents=True)
    (plugin_root / "skills" / "deep-project" / "references").mkdir(parents=True)
    (plugin_root / "tests" / "fixtures").mkdir(parents=True)

    return plugin_root
