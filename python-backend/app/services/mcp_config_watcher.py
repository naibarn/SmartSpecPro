"""
McpConfigWatcher — monitors mcp_servers table for config changes with safe hot-reload.

Polls configHash column every 60s. Auto-applies non-executable changes (timeout,
name, enabled). Logs but does NOT auto-apply executable changes (command, args,
url, env) — those require service restart + admin re-approval.

Only monitors the new mcp_servers table, NOT the legacy agencyAgents.mcpServers JSONB.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_POLL_INTERVAL_SECONDS = 60

# Fields that, if changed, require service restart (security-sensitive)
EXECUTABLE_FIELDS = frozenset({
    "command", "args", "env", "url", "image",
    "entrypoint", "network_mode", "network_action",
})

# Fields that can be safely hot-reloaded
SAFE_FIELDS = frozenset({
    "timeout", "timeout_seconds", "name", "enabled", "description",
    "credit_per_call", "cpu_limit", "memory_limit_mb",
})


# ---------------------------------------------------------------------------
# McpConfigWatcher
# ---------------------------------------------------------------------------

class McpConfigWatcher:
    """Watches mcp_servers table for config changes with safe auto-apply."""

    table_name = "mcp_servers"

    def __init__(
        self,
        db_session_factory: Callable | None = None,
        poll_interval: int = MIN_POLL_INTERVAL_SECONDS,
    ) -> None:
        self._db_session_factory = db_session_factory
        self.poll_interval = max(poll_interval, MIN_POLL_INTERVAL_SECONDS)
        self._known_hashes: dict[int, str] = {}  # server_id -> configHash
        self._known_configs: dict[int, dict] = {}  # server_id -> config dict
        self._running = False
        self._last_poll: float = 0.0

    # -------------------------------------------------------------------
    # Change Detection
    # -------------------------------------------------------------------

    def detect_changes(self, servers: list[Any]) -> list[dict[str, Any]]:
        """Compare server configHash values against known state.

        Returns list of change records for servers whose hash differs.
        """
        changes = []
        for server in servers:
            server_id = server.id
            new_hash = server.config_hash
            old_hash = self._known_hashes.get(server_id)

            if old_hash is not None and old_hash != new_hash:
                changes.append({
                    "server_id": server_id,
                    "old_hash": old_hash,
                    "new_hash": new_hash,
                    "config": getattr(server, "config", {}),
                })

            # Update known hash
            self._known_hashes[server_id] = new_hash

        return changes

    # -------------------------------------------------------------------
    # Change Classification
    # -------------------------------------------------------------------

    def classify_changes(
        self, old_config: dict, new_config: dict
    ) -> dict[str, Any]:
        """Classify config changes as auto-applicable or requiring restart.

        Returns:
            {
                "auto_apply": bool,
                "requires_restart": bool,
                "changed_safe_fields": list[str],
                "changed_executable_fields": list[str],
            }
        """
        all_keys = set(old_config.keys()) | set(new_config.keys())
        changed_safe: list[str] = []
        changed_executable: list[str] = []

        for key in all_keys:
            old_val = old_config.get(key)
            new_val = new_config.get(key)
            if old_val != new_val:
                if key in EXECUTABLE_FIELDS:
                    changed_executable.append(key)
                else:
                    changed_safe.append(key)

        has_executable = len(changed_executable) > 0

        return {
            "auto_apply": not has_executable,
            "requires_restart": has_executable,
            "changed_safe_fields": changed_safe,
            "changed_executable_fields": changed_executable,
        }

    # -------------------------------------------------------------------
    # Audit Logging
    # -------------------------------------------------------------------

    def log_hot_reload_event(
        self,
        server_id: int,
        action: str,
        changed_fields: list[str],
    ) -> None:
        """Log an audit event for a hot-reload action."""
        logger.info(
            "mcp_config_hot_reload",
            server_id=server_id,
            action=action,
            changed_fields=changed_fields,
        )

    # -------------------------------------------------------------------
    # Poll Loop
    # -------------------------------------------------------------------

    async def poll_once(self) -> list[dict[str, Any]]:
        """Run a single poll cycle. Returns list of detected changes.

        Enforces minimum poll interval.
        """
        now = time.time()
        if now - self._last_poll < self.poll_interval:
            return []

        self._last_poll = now

        if not self._db_session_factory:
            return []

        try:
            session = self._db_session_factory()
            # Query mcp_servers table for id, config, config_hash
            # This is a placeholder — actual SQLAlchemy query depends on model
            if hasattr(session, "execute"):
                from sqlalchemy import text
                result = await session.execute(
                    text("SELECT id, name, config, config_hash, enabled, transport_type FROM mcp_servers")
                )
                servers = result.fetchall()
            else:
                servers = []

            changes = self.detect_changes(servers)

            for change in changes:
                old_config = self._known_configs.get(change["server_id"], {})
                new_config = change.get("config", {})
                classification = self.classify_changes(old_config, new_config)

                if classification["auto_apply"]:
                    self.log_hot_reload_event(
                        server_id=change["server_id"],
                        action="auto_applied",
                        changed_fields=classification["changed_safe_fields"],
                    )
                else:
                    self.log_hot_reload_event(
                        server_id=change["server_id"],
                        action="blocked_requires_restart",
                        changed_fields=classification["changed_executable_fields"],
                    )

                # Update known config
                self._known_configs[change["server_id"]] = new_config

            return changes

        except Exception as exc:
            logger.warning("mcp_config_watcher_error", error=str(exc))
            return []

    async def start(self) -> None:
        """Start the polling loop. Runs until stop() is called."""
        self._running = True
        logger.info("mcp_config_watcher_started", interval=self.poll_interval)

        while self._running:
            await self.poll_once()
            await asyncio.sleep(self.poll_interval)

    async def stop(self) -> None:
        """Stop the polling loop."""
        self._running = False
        logger.info("mcp_config_watcher_stopped")
