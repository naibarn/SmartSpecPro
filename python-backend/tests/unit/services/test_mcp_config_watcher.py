"""Tests for McpConfigWatcher — config change detection with safe hot-reload."""

import asyncio
import hashlib
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.mcp_config_watcher import (
    EXECUTABLE_FIELDS,
    MIN_POLL_INTERVAL_SECONDS,
    McpConfigWatcher,
)


@pytest.fixture
def watcher():
    """Create McpConfigWatcher with mocked DB session."""
    db_session = AsyncMock()
    return McpConfigWatcher(db_session_factory=lambda: db_session)


def _make_server_row(
    id: int = 1,
    name: str = "test-server",
    config: dict | None = None,
    config_hash: str = "abc123",
    enabled: bool = True,
):
    """Create a mock DB row for mcp_servers."""
    row = MagicMock()
    row.id = id
    row.name = name
    row.config = config or {"url": "https://mcp.example.com"}
    row.config_hash = config_hash
    row.enabled = enabled
    row.transport_type = "http"
    return row


# ---------------------------------------------------------------------------
# Non-executable config change auto-applied
# ---------------------------------------------------------------------------

class TestNonExecutableChanges:

    @pytest.mark.asyncio
    async def test_non_executable_change_auto_applied(self, watcher):
        """Non-executable config change auto-applied (timeout, name, enabled)."""
        old = {"url": "https://mcp.example.com", "timeout": 30, "name": "old-name"}
        new = {"url": "https://mcp.example.com", "timeout": 60, "name": "new-name"}

        result = watcher.classify_changes(old, new)
        assert result["auto_apply"] is True
        assert result["requires_restart"] is False

    @pytest.mark.asyncio
    async def test_executable_change_not_auto_applied(self, watcher):
        """Executable config change (command, args, url) NOT auto-applied — logged only."""
        old = {"url": "https://mcp.example.com", "command": "npx", "args": ["server"]}
        new = {"url": "https://mcp.evil.com", "command": "npx", "args": ["server"]}

        result = watcher.classify_changes(old, new)
        assert result["auto_apply"] is False
        assert result["requires_restart"] is True
        assert "url" in result["changed_executable_fields"]


# ---------------------------------------------------------------------------
# Polling interval
# ---------------------------------------------------------------------------

class TestPollingInterval:

    @pytest.mark.asyncio
    async def test_watcher_polls_at_max_60_seconds(self, watcher):
        """Watcher polls at max 1 check per 60 seconds."""
        assert watcher.poll_interval == MIN_POLL_INTERVAL_SECONDS
        assert MIN_POLL_INTERVAL_SECONDS == 60


# ---------------------------------------------------------------------------
# configHash detection
# ---------------------------------------------------------------------------

class TestConfigHashDetection:

    @pytest.mark.asyncio
    async def test_config_hash_change_detected(self, watcher):
        """configHash change detected correctly."""
        # Simulate previous state
        watcher._known_hashes = {1: "old-hash-123"}

        server = _make_server_row(id=1, config_hash="new-hash-456")
        changes = watcher.detect_changes([server])

        assert len(changes) == 1
        assert changes[0]["server_id"] == 1
        assert changes[0]["old_hash"] == "old-hash-123"
        assert changes[0]["new_hash"] == "new-hash-456"

    @pytest.mark.asyncio
    async def test_no_change_when_hash_matches(self, watcher):
        """No change detected when configHash is the same."""
        watcher._known_hashes = {1: "same-hash"}
        server = _make_server_row(id=1, config_hash="same-hash")
        changes = watcher.detect_changes([server])
        assert len(changes) == 0


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

class TestAuditLogging:

    @pytest.mark.asyncio
    async def test_audit_event_logged_for_hot_reload(self, watcher):
        """Audit event logged for all hot-reload actions."""
        with patch("app.services.mcp_config_watcher.logger") as mock_logger:
            watcher.log_hot_reload_event(
                server_id=1,
                action="auto_applied",
                changed_fields=["timeout", "name"],
            )
            mock_logger.info.assert_called_once_with(
                "mcp_config_hot_reload",
                server_id=1,
                action="auto_applied",
                changed_fields=["timeout", "name"],
            )


# ---------------------------------------------------------------------------
# Source: mcp_servers table, NOT agencyAgents JSONB
# ---------------------------------------------------------------------------

class TestDataSource:

    @pytest.mark.asyncio
    async def test_watcher_reads_from_mcp_servers_table(self, watcher):
        """Watcher reads from mcp_servers table, not agencyAgents JSONB."""
        assert watcher.table_name == "mcp_servers"


# ---------------------------------------------------------------------------
# mcp_adapter.py NOT touched
# ---------------------------------------------------------------------------

class TestAdapterIsolation:

    def test_mcp_adapter_not_touched(self):
        """mcp_adapter.py NOT touched by langchain-mcp-adapters integration.

        This test verifies the code boundary: McpConfigWatcher only monitors
        external MCP servers (mcp_servers table), not internal workspace
        tool bridges (mcp_adapter.py).
        """
        import app.services.mcp_config_watcher as module
        source = open(module.__file__).read()
        assert "mcp_adapter" not in source
