"""Shared pytest fixtures for deep-plan tests."""

import sys
from pathlib import Path

import pytest
import json

# Add scripts directory to Python path so lib imports work
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))


@pytest.fixture(autouse=True)
def hermetic_home(tmp_path, monkeypatch):
    """Redirect HOME to a per-test temp dir and strip ambient session vars.

    task_storage.write_tasks() writes to Path.home()/".claude"/"tasks"; without
    this, tests (and every subprocess that inherits os.environ) would pollute the
    developer's real ~/.claude/tasks/. Stripping DEEP_SESSION_ID and
    CLAUDE_CODE_TASK_LIST_ID also prevents ambient session state — e.g. from a
    live Claude Code / deep-* plugin session — from leaking into "no env" cases
    and making those assertions non-deterministic.
    """
    home = tmp_path / "home"
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
def sample_config(fixtures_dir):
    """Load sample config for testing."""
    config_path = fixtures_dir / "sample_config.json"
    return json.loads(config_path.read_text())


@pytest.fixture
def sample_prompts_dir(fixtures_dir):
    """Return path to sample prompts directory."""
    return fixtures_dir / "sample_prompts"


@pytest.fixture
def sample_plan_content(fixtures_dir):
    """Load sample plan content for testing."""
    plan_path = fixtures_dir / "sample_plan.md"
    return plan_path.read_text()


@pytest.fixture
def mock_env(monkeypatch):
    """Factory fixture to set environment variables."""
    def _set_env(**kwargs):
        for key, value in kwargs.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
    return _set_env
