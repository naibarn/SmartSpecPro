Now I have all the context needed to write the complete section. Let me produce it.

# Section 8: Security & Governance Nodes

## Overview

This section implements six security and governance node executors for the workflow engine: Secrets Vault, Permission & RBAC, Audit Log, Structured Logging, Metrics & Alerting, and Run History & Replay. These correspond to node numbers 26-31 in the master plan.

**What gets built:**

1. **`SecretValue` wrapper and scrubbing logic** -- A tagged wrapper class (`SecretValue`) that marks values as secrets. The `NodeAdapter` (Section 01) scrubs any `__secret__`-tagged values from `node_outputs` before writing to state/checkpoint. This prevents secret material from leaking into LangGraph state, logs, or audit trails.
2. **`SecretsVault` abstraction layer** -- A pluggable vault with two backends: `InternalVaultBackend` (AES-256-GCM via `LLM_ENCRYPTION_KEY`, using the existing `smartspecweb_crypto.py`) and an interface for external backends (HashiCorp Vault, AWS Secrets Manager). Created at `/home/dev/projects/SmartSpecPro/python-backend/app/core/secrets_vault.py`.
3. **`SecretsExecutor`** -- Retrieves a named secret from the vault, wraps it in `SecretValue`, and emits a `secret_accessed` audit event. The secret value is *never* logged.
4. **`RBACExecutor`** -- Checks the executing user's role against a required role. Uses the existing tenant role system (`user < admin < domain_admin`) from `/home/dev/projects/SmartSpecPro/python-backend/app/models/user.py`.
5. **`AuditLogExecutor`** -- Writes a structured audit event to the `workflow_audit_events` table (Section 13). Automatically redacts fields marked as sensitive.
6. **`StructuredLogExecutor`** -- Writes a structured log entry to JSONL audit log files, following the existing pattern from `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`.
7. **`MetricsExecutor`** -- Emits a metric value and optionally triggers an alert when a threshold is exceeded. Uses the existing `NotificationService` for alert delivery.
8. **`RunHistoryExecutor`** -- Read-only node that queries the `workflow_executions` table (Section 13) for execution history.

**Design decisions:**

- **`SecretValue` is a sentinel wrapper, not encryption.** The vault handles decryption. `SecretValue` exists solely to signal to the `NodeAdapter` that this value must be scrubbed before state persistence. It implements `__repr__` and `__str__` to return `"***REDACTED***"` so secrets cannot leak through string formatting or logging.
- **Scrubbing happens in the adapter, not in each executor.** This centralizes the security guarantee. Even if a future executor accidentally passes a `SecretValue` through, the adapter will catch it.
- **Role hierarchy uses ordered comparison.** The existing `roleEnum` defines `user < admin < domain_admin`. The RBAC executor maps the workflow-level role names (`viewer`, `editor`, `admin`, `owner`) to this hierarchy for comparison.
- **Audit redaction uses a configurable set of sensitive field names.** Fields named `password`, `secret`, `token`, `apiKey`, `api_key`, `authorization`, `credential`, and any field containing the substring `encrypted` are automatically redacted in audit log data payloads.

---

## Dependencies on Other Sections

| Section | Dependency | What is needed |
|---------|-----------|----------------|
| **Section 01** | `NodeAdapter` scrubbing | `make_langgraph_node` must call `_scrub_secrets()` on `node_outputs` before returning state update |
| **Section 07** | DLQ fallback | Failed audit writes can route to the Dead Letter Queue |
| **Section 11** | Registry entries | All 6 node types registered with `InputSpec`/`OutputSpec` in the node registry |
| **Section 13** | Database tables | `workflow_audit_events`, `workflow_secrets`, `workflow_executions` tables must exist |
| **Section 14** | API endpoints | Secrets CRUD API for managing vault entries |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/secrets_vault.py` | **CREATE** | SecretsVault abstraction with pluggable backends |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/secret_value.py` | **CREATE** | SecretValue wrapper class and scrubbing utility |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/__init__.py` | **CREATE** | Package init with executor imports |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/secrets_executor.py` | **CREATE** | SecretsExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/rbac_executor.py` | **CREATE** | RBACExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/audit_log_executor.py` | **CREATE** | AuditLogExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/structured_log_executor.py` | **CREATE** | StructuredLogExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/metrics_executor.py` | **CREATE** | MetricsExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/run_history_executor.py` | **CREATE** | RunHistoryExecutor node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` | **MODIFY** | Add `_scrub_secrets()` call in `make_langgraph_node` |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/__init__.py` | **CREATE** | Package init for test subdirectory |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_security.py` | **CREATE** | All security node tests |

---

## Tests (Write First)

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_security.py`

```python
"""
Tests for Section 8: Security & Governance Nodes.

Covers: Secrets Vault, RBAC, Audit Log, Structured Logging, Metrics & Alerting,
Run History & Replay. Also tests the SecretValue wrapper and scrubbing logic.
"""

import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.secret_value import SecretValue, scrub_secrets


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def execution_context() -> ExecutionContext:
    """Standard execution context for testing."""
    return ExecutionContext(
        user_id=42,
        tenant_id="tenant-abc",
        workflow_id="wf-123",
        execution_id="exec-456",
        credits_available=100,
        extra_data={},
    )


def _make_data(
    node_type: str,
    config: dict[str, Any] | None = None,
    inputs: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
) -> NodeExecutionData:
    """Helper to build NodeExecutionData."""
    return NodeExecutionData(
        node_id="test-node-1",
        node_type=node_type,
        config=config or {},
        inputs=inputs or {},
        state=state or {},
    )


# ---------------------------------------------------------------------------
# SecretValue wrapper and scrubbing
# ---------------------------------------------------------------------------

class TestSecretValue:
    """Tests for the SecretValue sentinel wrapper."""

    def test_secret_value_wraps_string(self):
        """SecretValue stores the original value internally."""
        sv = SecretValue("my-api-key-123")
        assert sv.get_secret_value() == "my-api-key-123"

    def test_secret_value_repr_redacted(self):
        """repr() never exposes the secret."""
        sv = SecretValue("super-secret")
        assert "super-secret" not in repr(sv)
        assert "REDACTED" in repr(sv)

    def test_secret_value_str_redacted(self):
        """str() never exposes the secret."""
        sv = SecretValue("super-secret")
        assert "super-secret" not in str(sv)
        assert "REDACTED" in str(sv)

    def test_secret_value_is_tagged(self):
        """SecretValue has __secret__ marker."""
        sv = SecretValue("val")
        assert hasattr(sv, "__secret__")
        assert sv.__secret__ is True


class TestScrubSecrets:
    """Tests for the scrub_secrets utility."""

    def test_scrub_removes_secret_values(self):
        """SecretValue instances are replaced with redaction marker."""
        data = {
            "api_key": SecretValue("sk-123"),
            "name": "test",
            "count": 42,
        }
        scrubbed = scrub_secrets(data)
        assert scrubbed["api_key"] == "***REDACTED***"
        assert scrubbed["name"] == "test"
        assert scrubbed["count"] == 42

    def test_scrub_nested_dicts(self):
        """Scrubbing works recursively in nested dicts."""
        data = {
            "outer": {
                "inner": SecretValue("deep-secret"),
                "safe": "ok",
            }
        }
        scrubbed = scrub_secrets(data)
        assert scrubbed["outer"]["inner"] == "***REDACTED***"
        assert scrubbed["outer"]["safe"] == "ok"

    def test_scrub_lists(self):
        """Scrubbing works inside lists."""
        data = {
            "items": [SecretValue("a"), "b", SecretValue("c")],
        }
        scrubbed = scrub_secrets(data)
        assert scrubbed["items"] == ["***REDACTED***", "b", "***REDACTED***"]

    def test_scrub_preserves_non_secret_data(self):
        """Data without SecretValue instances passes through unchanged."""
        data = {"x": 1, "y": "hello", "z": [1, 2, 3]}
        scrubbed = scrub_secrets(data)
        assert scrubbed == data

    def test_secrets_scrubbed_from_state(self):
        """Integration: __secret__ values are removed from node_outputs dict."""
        node_outputs = {
            "node-1": {
                "value": SecretValue("sk-live-abc123"),
                "metadata": {"fetched": True},
            },
            "node-2": {
                "result": "normal data",
            },
        }
        scrubbed = scrub_secrets(node_outputs)
        assert scrubbed["node-1"]["value"] == "***REDACTED***"
        assert scrubbed["node-1"]["metadata"]["fetched"] is True
        assert scrubbed["node-2"]["result"] == "normal data"


# ---------------------------------------------------------------------------
# Secrets Vault Executor
# ---------------------------------------------------------------------------

class TestSecretsExecutor:
    """Tests for the Secrets Vault node executor."""

    @pytest.mark.asyncio
    async def test_secrets_vault_retrieves(self, execution_context):
        """Secret is decrypted and returned wrapped in SecretValue."""
        from app.orchestrator.node_executors.security_executors.secrets_executor import (
            SecretsExecutor,
        )

        mock_vault = AsyncMock()
        mock_vault.get_secret.return_value = "decrypted-api-key"

        executor = SecretsExecutor(vault=mock_vault)
        data = _make_data(
            "secrets_vault",
            inputs={"secretName": "my-api-key", "vaultBackend": "internal"},
        )

        result = await executor.execute(data, execution_context)
        assert isinstance(result["value"], SecretValue)
        assert result["value"].get_secret_value() == "decrypted-api-key"
        mock_vault.get_secret.assert_awaited_once_with(
            name="my-api-key",
            tenant_id="tenant-abc",
            backend="internal",
        )

    @pytest.mark.asyncio
    async def test_secrets_vault_never_logged(self, execution_context):
        """Secret value must not appear in any audit_trail entry."""
        from app.orchestrator.node_executors.security_executors.secrets_executor import (
            SecretsExecutor,
        )

        mock_vault = AsyncMock()
        mock_vault.get_secret.return_value = "top-secret-value-xyz"

        executor = SecretsExecutor(vault=mock_vault)
        data = _make_data(
            "secrets_vault",
            inputs={"secretName": "db-password"},
        )

        result = await executor.execute(data, execution_context)

        # The value itself is a SecretValue, which redacts on str/repr
        value_str = str(result["value"])
        value_repr = repr(result["value"])
        assert "top-secret-value-xyz" not in value_str
        assert "top-secret-value-xyz" not in value_repr

        # After scrubbing, the secret should be gone from serializable output
        scrubbed = scrub_secrets(result)
        serialized = json.dumps(scrubbed, default=str)
        assert "top-secret-value-xyz" not in serialized

    @pytest.mark.asyncio
    async def test_secrets_vault_not_found(self, execution_context):
        """Missing secret raises ValueError."""
        from app.orchestrator.node_executors.security_executors.secrets_executor import (
            SecretsExecutor,
        )

        mock_vault = AsyncMock()
        mock_vault.get_secret.side_effect = KeyError("Secret 'missing' not found")

        executor = SecretsExecutor(vault=mock_vault)
        data = _make_data("secrets_vault", inputs={"secretName": "missing"})

        with pytest.raises(KeyError):
            await executor.execute(data, execution_context)


# ---------------------------------------------------------------------------
# RBAC Executor
# ---------------------------------------------------------------------------

class TestRBACExecutor:
    """Tests for the Permission & RBAC node executor."""

    @pytest.mark.asyncio
    async def test_rbac_allows_admin(self, execution_context):
        """Admin role passes permission check for editor-level requirement."""
        from app.orchestrator.node_executors.security_executors.rbac_executor import (
            RBACExecutor,
        )

        mock_role_resolver = AsyncMock(return_value="admin")
        executor = RBACExecutor(role_resolver=mock_role_resolver)
        data = _make_data(
            "rbac_check",
            inputs={"requiredRole": "editor", "resourceType": "workflow"},
        )

        result = await executor.execute(data, execution_context)
        assert result["allowed"] is True
        assert result["userRole"] == "admin"

    @pytest.mark.asyncio
    async def test_rbac_blocks_viewer(self, execution_context):
        """Viewer role is blocked from editor-level requirement."""
        from app.orchestrator.node_executors.security_executors.rbac_executor import (
            RBACExecutor,
        )

        mock_role_resolver = AsyncMock(return_value="viewer")
        executor = RBACExecutor(role_resolver=mock_role_resolver)
        data = _make_data(
            "rbac_check",
            inputs={"requiredRole": "editor", "resourceType": "workflow"},
        )

        result = await executor.execute(data, execution_context)
        assert result["allowed"] is False
        assert result["userRole"] == "viewer"

    @pytest.mark.asyncio
    async def test_rbac_same_role_allowed(self, execution_context):
        """Exact match of required role is allowed."""
        from app.orchestrator.node_executors.security_executors.rbac_executor import (
            RBACExecutor,
        )

        mock_role_resolver = AsyncMock(return_value="editor")
        executor = RBACExecutor(role_resolver=mock_role_resolver)
        data = _make_data(
            "rbac_check",
            inputs={"requiredRole": "editor"},
        )

        result = await executor.execute(data, execution_context)
        assert result["allowed"] is True

    @pytest.mark.asyncio
    async def test_rbac_owner_allows_everything(self, execution_context):
        """Owner role passes any permission check."""
        from app.orchestrator.node_executors.security_executors.rbac_executor import (
            RBACExecutor,
        )

        mock_role_resolver = AsyncMock(return_value="owner")
        executor = RBACExecutor(role_resolver=mock_role_resolver)
        data = _make_data(
            "rbac_check",
            inputs={"requiredRole": "admin"},
        )

        result = await executor.execute(data, execution_context)
        assert result["allowed"] is True


# ---------------------------------------------------------------------------
# Audit Log Executor
# ---------------------------------------------------------------------------

class TestAuditLogExecutor:
    """Tests for the Audit Log node executor."""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_audit_log_writes(self, execution_context):
        """Audit event is written to the database via the writer."""
        from app.orchestrator.node_executors.security_executors.audit_log_executor import (
            AuditLogExecutor,
        )

        mock_writer = AsyncMock()
        mock_writer.write_event.return_value = "audit-evt-789"
        executor = AuditLogExecutor(audit_writer=mock_writer)
        data = _make_data(
            "audit_log",
            inputs={
                "eventType": "data.export",
                "fieldsToLog": {"userId": 42, "exportType": "csv"},
                "includeInput": False,
                "includeOutput": False,
            },
        )

        result = await executor.execute(data, execution_context)
        assert result["auditId"] == "audit-evt-789"
        assert "timestamp" in result
        mock_writer.write_event.assert_awaited_once()
        call_kwargs = mock_writer.write_event.call_args
        assert call_kwargs[1]["event_type"] == "data.export"

    @pytest.mark.asyncio
    async def test_audit_log_redacts_sensitive(self, execution_context):
        """Sensitive fields in the data payload are automatically redacted."""
        from app.orchestrator.node_executors.security_executors.audit_log_executor import (
            AuditLogExecutor,
        )

        mock_writer = AsyncMock()
        mock_writer.write_event.return_value = "audit-evt-001"
        executor = AuditLogExecutor(audit_writer=mock_writer)
        data = _make_data(
            "audit_log",
            inputs={
                "eventType": "config.update",
                "fieldsToLog": {
                    "setting": "smtp",
                    "password": "super-secret-pass",
                    "apiKey": "sk-live-abc123",
                    "normalField": "visible",
                },
            },
        )

        await executor.execute(data, execution_context)
        call_kwargs = mock_writer.write_event.call_args
        logged_data = call_kwargs[1]["data"]
        assert logged_data["password"] == "***REDACTED***"
        assert logged_data["apiKey"] == "***REDACTED***"
        assert logged_data["normalField"] == "visible"
        assert logged_data["setting"] == "smtp"


# ---------------------------------------------------------------------------
# Structured Logging Executor
# ---------------------------------------------------------------------------

class TestStructuredLogExecutor:
    """Tests for the Structured Logging node executor."""

    @pytest.mark.asyncio
    async def test_structured_logging_writes(self, execution_context):
        """Log entry is written to JSONL file."""
        from app.orchestrator.node_executors.security_executors.structured_log_executor import (
            StructuredLogExecutor,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            executor = StructuredLogExecutor(log_dir=tmpdir)
            data = _make_data(
                "structured_log",
                inputs={
                    "level": "info",
                    "messageTemplate": "Processed {count} items",
                    "fields": {"count": 42, "component": "pipeline"},
                },
            )

            result = await executor.execute(data, execution_context)
            assert result["logged"] is True

            # Verify the JSONL file was written
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            log_file = os.path.join(tmpdir, f"workflow-{today}.jsonl")
            assert os.path.exists(log_file)

            with open(log_file) as f:
                lines = f.readlines()
            assert len(lines) == 1

            entry = json.loads(lines[0])
            assert entry["level"] == "info"
            assert entry["message"] == "Processed {count} items"
            assert entry["fields"]["count"] == 42
            assert entry["workflowId"] == "wf-123"
            assert entry["executionId"] == "exec-456"


# ---------------------------------------------------------------------------
# Metrics & Alerting Executor
# ---------------------------------------------------------------------------

class TestMetricsExecutor:
    """Tests for the Metrics & Alerting node executor."""

    @pytest.mark.asyncio
    async def test_metrics_emits(self, execution_context):
        """Metric is stored via the metrics writer."""
        from app.orchestrator.node_executors.security_executors.metrics_executor import (
            MetricsExecutor,
        )

        mock_writer = AsyncMock()
        executor = MetricsExecutor(metrics_writer=mock_writer)
        data = _make_data(
            "metrics",
            inputs={
                "metricName": "workflow.processing_time_ms",
                "value": 1500,
            },
        )

        result = await executor.execute(data, execution_context)
        assert result["recorded"] is True
        assert result["alertTriggered"] is False
        mock_writer.record_metric.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_metrics_alert_triggered(self, execution_context):
        """Alert fires when metric value exceeds the threshold."""
        from app.orchestrator.node_executors.security_executors.metrics_executor import (
            MetricsExecutor,
        )

        mock_writer = AsyncMock()
        mock_notifier = AsyncMock()
        executor = MetricsExecutor(metrics_writer=mock_writer, notifier=mock_notifier)
        data = _make_data(
            "metrics",
            inputs={
                "metricName": "workflow.error_rate",
                "value": 95,
                "alertThreshold": 80,
                "alertChannel": "email",
            },
        )

        result = await executor.execute(data, execution_context)
        assert result["recorded"] is True
        assert result["alertTriggered"] is True
        mock_notifier.send_alert.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_metrics_no_alert_below_threshold(self, execution_context):
        """No alert when value is below threshold."""
        from app.orchestrator.node_executors.security_executors.metrics_executor import (
            MetricsExecutor,
        )

        mock_writer = AsyncMock()
        mock_notifier = AsyncMock()
        executor = MetricsExecutor(metrics_writer=mock_writer, notifier=mock_notifier)
        data = _make_data(
            "metrics",
            inputs={
                "metricName": "workflow.latency_ms",
                "value": 50,
                "alertThreshold": 100,
            },
        )

        result = await executor.execute(data, execution_context)
        assert result["alertTriggered"] is False
        mock_notifier.send_alert.assert_not_awaited()


# ---------------------------------------------------------------------------
# Run History & Replay Executor
# ---------------------------------------------------------------------------

class TestRunHistoryExecutor:
    """Tests for the Run History & Replay node executor."""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_run_history_queries(self, execution_context):
        """Execution history is returned from the history reader."""
        from app.orchestrator.node_executors.security_executors.run_history_executor import (
            RunHistoryExecutor,
        )

        mock_reader = AsyncMock()
        mock_reader.query_executions.return_value = {
            "executions": [
                {"id": 1, "status": "completed", "startedAt": "2026-02-09T00:00:00Z"},
                {"id": 2, "status": "failed", "startedAt": "2026-02-08T00:00:00Z"},
            ],
            "totalCount": 2,
        }

        executor = RunHistoryExecutor(history_reader=mock_reader)
        data = _make_data(
            "run_history",
            inputs={
                "workflowId": "wf-123",
                "limit": 10,
                "statusFilter": "all",
            },
        )

        result = await executor.execute(data, execution_context)
        assert len(result["executions"]) == 2
        assert result["totalCount"] == 2
        mock_reader.query_executions.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_run_history_with_status_filter(self, execution_context):
        """Status filter is passed through to the reader."""
        from app.orchestrator.node_executors.security_executors.run_history_executor import (
            RunHistoryExecutor,
        )

        mock_reader = AsyncMock()
        mock_reader.query_executions.return_value = {
            "executions": [
                {"id": 3, "status": "failed"},
            ],
            "totalCount": 1,
        }

        executor = RunHistoryExecutor(history_reader=mock_reader)
        data = _make_data(
            "run_history",
            inputs={"statusFilter": "failed", "limit": 5},
        )

        result = await executor.execute(data, execution_context)
        assert result["totalCount"] == 1
        call_kwargs = mock_reader.query_executions.call_args[1]
        assert call_kwargs["status_filter"] == "failed"
```

---

## Implementation Steps

### Step 1: Create SecretValue Wrapper and Scrubbing Utility

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/secret_value.py`

This module provides the `SecretValue` sentinel class and the `scrub_secrets()` function used by the `NodeAdapter` to strip secrets from state before checkpoint persistence.

```python
"""
Secret value wrapper and scrubbing utilities.

SecretValue is a tagged wrapper that prevents secret material from
leaking into LangGraph state, logs, checkpoints, or audit trails.

The NodeAdapter calls scrub_secrets() on node_outputs before writing
to state. Downstream nodes that need the actual secret value must
re-fetch from the Secrets Vault node directly.
"""

from typing import Any

# Sentinel marker checked by scrub_secrets and NodeAdapter
_REDACTION_PLACEHOLDER = "***REDACTED***"


class SecretValue:
    """Tagged wrapper for secret values.

    Attributes:
        __secret__: Sentinel flag. When True, the NodeAdapter knows
            to scrub this value from state before checkpoint.

    Usage:
        sv = SecretValue("sk-live-abc123")
        sv.get_secret_value()  # -> "sk-live-abc123"
        str(sv)                # -> "***REDACTED***"
        repr(sv)               # -> "SecretValue(***REDACTED***)"
    """

    __secret__: bool = True

    def __init__(self, value: str) -> None:
        # Store in a mangled attribute to make accidental access harder
        self._SecretValue__value = value

    def get_secret_value(self) -> str:
        """Return the actual secret value. Use sparingly."""
        return self._SecretValue__value

    def __repr__(self) -> str:
        return f"SecretValue({_REDACTION_PLACEHOLDER})"

    def __str__(self) -> str:
        return _REDACTION_PLACEHOLDER

    def __eq__(self, other: object) -> bool:
        if isinstance(other, SecretValue):
            return self._SecretValue__value == other._SecretValue__value
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self._SecretValue__value)

    def __bool__(self) -> bool:
        return bool(self._SecretValue__value)


def scrub_secrets(data: Any) -> Any:
    """Recursively replace SecretValue instances with redaction placeholder.

    Args:
        data: Any data structure (dict, list, or scalar).

    Returns:
        A new data structure with all SecretValue instances replaced
        by "***REDACTED***". Original data is not mutated.
    """
    if isinstance(data, SecretValue):
        return _REDACTION_PLACEHOLDER

    if isinstance(data, dict):
        return {k: scrub_secrets(v) for k, v in data.items()}

    if isinstance(data, list):
        return [scrub_secrets(item) for item in data]

    if isinstance(data, tuple):
        return tuple(scrub_secrets(item) for item in data)

    return data
```

### Step 2: Modify NodeAdapter to Scrub Secrets

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`

Add the secret scrubbing call inside `make_langgraph_node`. This is a targeted modification to the existing adapter from Section 01 -- only the state update block changes.

**Location:** Inside the `_node_fn` function, after the executor returns output and before building the state update dict.

```python
# --- ADD this import at the top of node_adapter.py ---
from app.orchestrator.secret_value import scrub_secrets

# --- MODIFY the try block inside _node_fn ---
# After: output = await executor.execute(data, context)
# After: output = _check_output_size(output, node_id)
# BEFORE building the state update dict, add:

            # Scrub secret values from outputs before persisting to state.
            # Downstream nodes that need actual secrets must re-fetch
            # from the vault node directly.
            scrubbed_output = scrub_secrets(output)

            # Build state update
            node_outputs = dict(state.get("node_outputs", {}))
            node_outputs[node_id] = scrubbed_output  # <-- use scrubbed, not raw

            # ... rest of the function remains unchanged
```

The key change: replace `node_outputs[node_id] = output` with `node_outputs[node_id] = scrubbed_output`. The raw `output` (with actual `SecretValue` instances) is only available during the current node's execution scope. It is never written to the LangGraph checkpoint.

### Step 3: Create SecretsVault Abstraction Layer

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/secrets_vault.py`

```python
"""
Secrets Vault abstraction layer with pluggable backends.

Default backend: AES-256-GCM encryption via LLM_ENCRYPTION_KEY
(compatible with SmartSpecWeb's crypto.ts and smartspecweb_crypto.py).

Pluggable backends: HashiCorp Vault, AWS Secrets Manager (interface only,
implementation deferred to Phase 2).
"""

import abc
import structlog
from typing import Any

logger = structlog.get_logger()


class VaultBackend(abc.ABC):
    """Abstract base class for vault backends."""

    @abc.abstractmethod
    async def get_secret(self, name: str, tenant_id: str) -> str:
        """Retrieve and decrypt a secret by name.

        Args:
            name: Secret name (e.g., "stripe_api_key").
            tenant_id: Tenant that owns the secret.

        Returns:
            Decrypted plaintext secret value.

        Raises:
            KeyError: If the secret does not exist.
            ValueError: If decryption fails.
        """
        ...

    @abc.abstractmethod
    async def set_secret(self, name: str, value: str, tenant_id: str, **kwargs: Any) -> None:
        """Store an encrypted secret.

        Args:
            name: Secret name.
            value: Plaintext value to encrypt and store.
            tenant_id: Tenant that owns the secret.
        """
        ...

    @abc.abstractmethod
    async def delete_secret(self, name: str, tenant_id: str) -> bool:
        """Delete a secret.

        Args:
            name: Secret name.
            tenant_id: Tenant that owns the secret.

        Returns:
            True if deleted, False if not found.
        """
        ...

    @abc.abstractmethod
    async def list_secrets(self, tenant_id: str) -> list[dict[str, Any]]:
        """List secret metadata (names, descriptions -- never values).

        Args:
            tenant_id: Tenant whose secrets to list.

        Returns:
            List of dicts with keys: name, description, created_at, updated_at.
        """
        ...


class InternalVaultBackend(VaultBackend):
    """Default vault backend using AES-256-GCM via LLM_ENCRYPTION_KEY.

    Reads/writes the `workflow_secrets` table (Section 13).
    Encryption is compatible with SmartSpecWeb's crypto.ts.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
    """

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory

    async def get_secret(self, name: str, tenant_id: str) -> str:
        """Retrieve and decrypt a secret from the workflow_secrets table."""
        from sqlalchemy import text
        from app.core.smartspecweb_crypto import decrypt_smartspecweb

        async with self._db_session_factory() as session:
            result = await session.execute(
                text(
                    'SELECT "encryptedValue" FROM workflow_secrets '
                    'WHERE "tenantId" = :tenant_id AND "name" = :name'
                ),
                {"tenant_id": tenant_id, "name": name},
            )
            row = result.fetchone()

        if not row:
            raise KeyError(f"Secret '{name}' not found for tenant '{tenant_id}'")

        encrypted_value = row[0]
        try:
            return decrypt_smartspecweb(encrypted_value)
        except Exception as exc:
            logger.error(
                "Failed to decrypt secret",
                secret_name=name,
                tenant_id=tenant_id,
                error=str(exc),
            )
            raise ValueError(f"Failed to decrypt secret '{name}': {exc}") from exc

    async def set_secret(self, name: str, value: str, tenant_id: str, **kwargs: Any) -> None:
        """Encrypt and store a secret in the workflow_secrets table.

        Encryption uses the same AES-256-GCM key derivation as SmartSpecWeb.
        """
        from sqlalchemy import text
        from app.core.smartspecweb_crypto import _get_key
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        import os as _os

        key = _get_key()
        aesgcm = AESGCM(key)
        iv = _os.urandom(12)
        plaintext_bytes = value.encode("utf-8")
        ciphertext_with_tag = aesgcm.encrypt(iv, plaintext_bytes, None)
        # Split into ciphertext and auth tag (last 16 bytes)
        ciphertext = ciphertext_with_tag[:-16]
        auth_tag = ciphertext_with_tag[-16:]
        encrypted_value = f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"

        description = kwargs.get("description", "")
        created_by = kwargs.get("created_by")

        async with self._db_session_factory() as session:
            # Upsert: insert or update on conflict
            await session.execute(
                text(
                    """
                    INSERT INTO workflow_secrets ("tenantId", "name", "encryptedValue",
                        "vaultBackend", "description", "createdBy", "updatedBy",
                        "createdAt", "updatedAt")
                    VALUES (:tenant_id, :name, :encrypted_value, 'internal',
                        :description, :created_by, :created_by, NOW(), NOW())
                    ON CONFLICT ("tenantId", "name")
                    DO UPDATE SET
                        "encryptedValue" = :encrypted_value,
                        "updatedBy" = :created_by,
                        "updatedAt" = NOW(),
                        "description" = COALESCE(:description, workflow_secrets."description")
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "name": name,
                    "encrypted_value": encrypted_value,
                    "description": description,
                    "created_by": created_by,
                },
            )
            await session.commit()

    async def delete_secret(self, name: str, tenant_id: str) -> bool:
        """Delete a secret from the workflow_secrets table."""
        from sqlalchemy import text

        async with self._db_session_factory() as session:
            result = await session.execute(
                text(
                    'DELETE FROM workflow_secrets WHERE "tenantId" = :tenant_id AND "name" = :name'
                ),
                {"tenant_id": tenant_id, "name": name},
            )
            await session.commit()
            return result.rowcount > 0

    async def list_secrets(self, tenant_id: str) -> list[dict[str, Any]]:
        """List secret metadata (never values) for a tenant."""
        from sqlalchemy import text

        async with self._db_session_factory() as session:
            result = await session.execute(
                text(
                    """
                    SELECT "name", "description", "vaultBackend", "createdAt", "updatedAt"
                    FROM workflow_secrets
                    WHERE "tenantId" = :tenant_id
                    ORDER BY "name"
                    """
                ),
                {"tenant_id": tenant_id},
            )
            rows = result.fetchall()

        return [
            {
                "name": row[0],
                "description": row[1],
                "vaultBackend": row[2],
                "createdAt": row[3].isoformat() if row[3] else None,
                "updatedAt": row[4].isoformat() if row[4] else None,
            }
            for row in rows
        ]


class HashiCorpVaultBackend(VaultBackend):
    """Placeholder for HashiCorp Vault integration (Phase 2).

    Raises NotImplementedError for all operations.
    """

    async def get_secret(self, name: str, tenant_id: str) -> str:
        raise NotImplementedError("HashiCorp Vault backend is not yet implemented")

    async def set_secret(self, name: str, value: str, tenant_id: str, **kwargs: Any) -> None:
        raise NotImplementedError("HashiCorp Vault backend is not yet implemented")

    async def delete_secret(self, name: str, tenant_id: str) -> bool:
        raise NotImplementedError("HashiCorp Vault backend is not yet implemented")

    async def list_secrets(self, tenant_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("HashiCorp Vault backend is not yet implemented")


class AWSSecretsManagerBackend(VaultBackend):
    """Placeholder for AWS Secrets Manager integration (Phase 2).

    Raises NotImplementedError for all operations.
    """

    async def get_secret(self, name: str, tenant_id: str) -> str:
        raise NotImplementedError("AWS Secrets Manager backend is not yet implemented")

    async def set_secret(self, name: str, value: str, tenant_id: str, **kwargs: Any) -> None:
        raise NotImplementedError("AWS Secrets Manager backend is not yet implemented")

    async def delete_secret(self, name: str, tenant_id: str) -> bool:
        raise NotImplementedError("AWS Secrets Manager backend is not yet implemented")

    async def list_secrets(self, tenant_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("AWS Secrets Manager backend is not yet implemented")


class SecretsVault:
    """Unified secrets vault with pluggable backend resolution.

    Selects the appropriate backend based on the `vaultBackend` value
    stored alongside each secret. Defaults to `InternalVaultBackend`.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
            Used by InternalVaultBackend.
    """

    _BACKENDS: dict[str, type[VaultBackend]] = {
        "internal": InternalVaultBackend,
        "hashicorp": HashiCorpVaultBackend,
        "aws": AWSSecretsManagerBackend,
    }

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory
        self._backend_instances: dict[str, VaultBackend] = {}

    def _get_backend(self, backend_name: str) -> VaultBackend:
        """Get or create a backend instance by name."""
        if backend_name not in self._backend_instances:
            backend_class = self._BACKENDS.get(backend_name)
            if backend_class is None:
                raise ValueError(
                    f"Unknown vault backend: '{backend_name}'. "
                    f"Available: {list(self._BACKENDS.keys())}"
                )
            if backend_name == "internal":
                self._backend_instances[backend_name] = backend_class(self._db_session_factory)
            else:
                self._backend_instances[backend_name] = backend_class()
        return self._backend_instances[backend_name]

    async def get_secret(
        self, name: str, tenant_id: str, backend: str = "internal"
    ) -> str:
        """Retrieve a secret from the specified backend.

        Args:
            name: Secret name.
            tenant_id: Owning tenant.
            backend: Vault backend to use ("internal", "hashicorp", "aws").

        Returns:
            Decrypted plaintext secret value.
        """
        vault_backend = self._get_backend(backend)
        return await vault_backend.get_secret(name, tenant_id)

    async def set_secret(
        self, name: str, value: str, tenant_id: str, backend: str = "internal", **kwargs: Any
    ) -> None:
        """Store a secret using the specified backend."""
        vault_backend = self._get_backend(backend)
        await vault_backend.set_secret(name, value, tenant_id, **kwargs)

    async def delete_secret(self, name: str, tenant_id: str, backend: str = "internal") -> bool:
        """Delete a secret from the specified backend."""
        vault_backend = self._get_backend(backend)
        return await vault_backend.delete_secret(name, tenant_id)

    async def list_secrets(self, tenant_id: str, backend: str = "internal") -> list[dict[str, Any]]:
        """List secret metadata from the specified backend."""
        vault_backend = self._get_backend(backend)
        return await vault_backend.list_secrets(tenant_id)
```

### Step 4: Create Security Executor Package Init

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/__init__.py`

```python
"""Security & Governance node executors (Section 8).

Nodes: Secrets Vault, RBAC Check, Audit Log, Structured Log,
Metrics & Alert, Run History.
"""

from app.orchestrator.node_executors.security_executors.secrets_executor import SecretsExecutor
from app.orchestrator.node_executors.security_executors.rbac_executor import RBACExecutor
from app.orchestrator.node_executors.security_executors.audit_log_executor import AuditLogExecutor
from app.orchestrator.node_executors.security_executors.structured_log_executor import (
    StructuredLogExecutor,
)
from app.orchestrator.node_executors.security_executors.metrics_executor import MetricsExecutor
from app.orchestrator.node_executors.security_executors.run_history_executor import (
    RunHistoryExecutor,
)

__all__ = [
    "SecretsExecutor",
    "RBACExecutor",
    "AuditLogExecutor",
    "StructuredLogExecutor",
    "MetricsExecutor",
    "RunHistoryExecutor",
]
```

### Step 5: Implement SecretsExecutor (Node #26)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/secrets_executor.py`

```python
"""Secrets Vault node executor.

Retrieves encrypted secrets from the vault and wraps them in SecretValue.
The NodeAdapter automatically scrubs SecretValue instances from state
before checkpoint persistence.

SECURITY: The actual secret value is never logged, never written to audit
trail, and never persisted in LangGraph state. Downstream nodes that need
the secret must re-fetch from the vault node directly within the same
execution scope (before the adapter scrubs the output).
"""

import structlog
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.secret_value import SecretValue

logger = structlog.get_logger()


class SecretsExecutor:
    """Executor for the Secrets Vault node.

    Args:
        vault: A SecretsVault instance (or mock for testing).
            Must implement: async get_secret(name, tenant_id, backend) -> str
    """

    def __init__(self, vault: Any) -> None:
        self._vault = vault

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Retrieve a secret from the vault.

        Config/Inputs:
            secretName (str, required): Name of the secret to retrieve.
            vaultBackend (str, optional): Backend to use. Default: "internal".

        Returns:
            {"value": SecretValue(...)} -- The secret wrapped in SecretValue.

        Raises:
            KeyError: If the secret is not found.
            ValueError: If decryption fails or backend is unknown.
        """
        secret_name = data.inputs.get("secretName") or data.config.get("secret_name")
        if not secret_name:
            raise ValueError("secretName is required")

        vault_backend = (
            data.inputs.get("vaultBackend")
            or data.config.get("vault_backend")
            or "internal"
        )

        tenant_id = context.tenant_id
        if not tenant_id:
            raise ValueError("tenant_id is required for secret retrieval")

        # Retrieve the decrypted secret value
        plaintext = await self._vault.get_secret(
            name=secret_name,
            tenant_id=tenant_id,
            backend=vault_backend,
        )

        # Log secret access (name only, NEVER the value)
        logger.info(
            "Secret accessed",
            secret_name=secret_name,
            vault_backend=vault_backend,
            tenant_id=tenant_id,
            user_id=context.user_id,
            workflow_id=context.workflow_id,
            node_id=data.node_id,
        )

        # Wrap in SecretValue -- the adapter will scrub this before
        # persisting to state/checkpoint
        return {
            "value": SecretValue(plaintext),
        }
```

### Step 6: Implement RBACExecutor (Node #27)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/rbac_executor.py`

```python
"""Permission & RBAC node executor.

Checks whether the executing user has sufficient role/permission
to perform the requested action. Uses the existing tenant role
hierarchy: viewer < editor < admin < owner.

Maps to the SmartSpecWeb role system:
  - viewer  -> user role (read-only)
  - editor  -> user role with write permission
  - admin   -> admin role
  - owner   -> domain_admin role
"""

import structlog
from typing import Any, Callable, Awaitable

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# Role hierarchy: higher index = more permissions
ROLE_HIERARCHY = {
    "viewer": 0,
    "user": 0,       # alias for viewer
    "editor": 1,
    "admin": 2,
    "domain_admin": 2,  # alias for admin
    "owner": 3,
}


def _role_level(role: str) -> int:
    """Get the numeric level of a role in the hierarchy.

    Returns -1 for unknown roles (always denied).
    """
    return ROLE_HIERARCHY.get(role.lower(), -1)


class RBACExecutor:
    """Executor for the Permission & RBAC Check node.

    Args:
        role_resolver: Async callable that takes (user_id, tenant_id) and
            returns the user's role as a string. In production this queries
            the users table. For testing, a mock is injected.
    """

    def __init__(self, role_resolver: Callable[..., Awaitable[str]] | None = None) -> None:
        self._role_resolver = role_resolver

    async def _resolve_role(self, user_id: int, tenant_id: str | None) -> str:
        """Resolve the user's role.

        Uses the injected resolver if available, otherwise falls back
        to querying the database directly.
        """
        if self._role_resolver:
            return await self._role_resolver(user_id, tenant_id)

        # Default: query the users table
        # This import is deferred to avoid circular deps at module level
        from app.core.database import async_session_factory
        from sqlalchemy import text

        async with async_session_factory() as session:
            result = await session.execute(
                text('SELECT "role" FROM users WHERE id = :user_id'),
                {"user_id": user_id},
            )
            row = result.fetchone()

        if not row:
            return "viewer"  # Default to lowest privilege

        db_role = row[0]
        # Map DB roles to workflow role hierarchy
        role_map = {
            "user": "viewer",
            "admin": "admin",
            "domain_admin": "owner",
        }
        return role_map.get(db_role, "viewer")

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Check if the user has the required role.

        Config/Inputs:
            requiredRole (str, required): Minimum role needed
                ("viewer", "editor", "admin", "owner").
            resourceType (str, optional): Type of resource being accessed.
            resourceId (str, optional): Specific resource ID.

        Returns:
            {
                "allowed": bool,
                "userRole": str,
            }
        """
        required_role = data.inputs.get("requiredRole") or data.config.get("required_role")
        if not required_role:
            raise ValueError("requiredRole is required")

        resource_type = data.inputs.get("resourceType") or data.config.get("resource_type", "")
        resource_id = data.inputs.get("resourceId") or data.config.get("resource_id", "")

        # Resolve the user's actual role
        user_role = await self._resolve_role(context.user_id, context.tenant_id)

        # Compare role levels
        user_level = _role_level(user_role)
        required_level = _role_level(required_role)
        allowed = user_level >= required_level

        logger.info(
            "RBAC check",
            allowed=allowed,
            user_role=user_role,
            required_role=required_role,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=context.user_id,
            node_id=data.node_id,
        )

        return {
            "allowed": allowed,
            "userRole": user_role,
        }
```

### Step 7: Implement AuditLogExecutor (Node #28)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/audit_log_executor.py`

```python
"""Audit Log node executor.

Writes structured audit events to the workflow_audit_events table
(Section 13). Automatically redacts fields that match known sensitive
field name patterns.
"""

import re
import structlog
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# Field names that are automatically redacted in audit data
SENSITIVE_FIELD_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^password$", re.IGNORECASE),
    re.compile(r"^secret$", re.IGNORECASE),
    re.compile(r"^token$", re.IGNORECASE),
    re.compile(r"^api[_-]?key$", re.IGNORECASE),
    re.compile(r"^authorization$", re.IGNORECASE),
    re.compile(r"^credential[s]?$", re.IGNORECASE),
    re.compile(r"encrypted", re.IGNORECASE),
    re.compile(r"^private[_-]?key$", re.IGNORECASE),
    re.compile(r"^access[_-]?token$", re.IGNORECASE),
    re.compile(r"^refresh[_-]?token$", re.IGNORECASE),
    re.compile(r"^auth[_-]?key$", re.IGNORECASE),
]

_REDACTED = "***REDACTED***"


def _is_sensitive_field(field_name: str) -> bool:
    """Check if a field name matches any sensitive pattern."""
    return any(pattern.search(field_name) for pattern in SENSITIVE_FIELD_PATTERNS)


def redact_sensitive_fields(data: Any) -> Any:
    """Recursively redact sensitive fields in a data structure.

    Args:
        data: Dict, list, or scalar value.

    Returns:
        New data structure with sensitive field values replaced
        by "***REDACTED***".
    """
    if isinstance(data, dict):
        return {
            k: _REDACTED if _is_sensitive_field(k) else redact_sensitive_fields(v)
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [redact_sensitive_fields(item) for item in data]
    return data


class AuditWriter:
    """Writes audit events to the workflow_audit_events table.

    This is the production writer. A mock is injected in tests.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
    """

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory

    async def write_event(
        self,
        *,
        workflow_id: str,
        execution_id: str,
        node_id: str,
        event_type: str,
        actor_id: int,
        data: dict[str, Any] | None,
        tenant_id: str,
        trace_id: str | None = None,
    ) -> str:
        """Write an audit event to the database.

        Returns:
            The audit event ID (as a string).
        """
        from sqlalchemy import text

        async with self._db_session_factory() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO workflow_audit_events
                        ("workflowId", "executionId", "nodeId", "eventType",
                         "actorId", "data", "tenantId", "traceId", "createdAt")
                    VALUES
                        (:workflow_id, :execution_id, :node_id, :event_type,
                         :actor_id, :data::jsonb, :tenant_id, :trace_id, NOW())
                    RETURNING id
                    """
                ),
                {
                    "workflow_id": int(workflow_id) if workflow_id else None,
                    "execution_id": int(execution_id) if execution_id else None,
                    "node_id": node_id,
                    "event_type": event_type,
                    "actor_id": actor_id,
                    "data": __import__("json").dumps(data) if data else None,
                    "tenant_id": tenant_id,
                    "trace_id": trace_id,
                },
            )
            row = result.fetchone()
            await session.commit()

        return str(row[0]) if row else "unknown"


class AuditLogExecutor:
    """Executor for the Audit Log node.

    Args:
        audit_writer: An AuditWriter instance (or mock for testing).
    """

    def __init__(self, audit_writer: Any) -> None:
        self._writer = audit_writer

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Write a structured audit event.

        Config/Inputs:
            eventType (str, required): Event type identifier.
            fieldsToLog (dict, optional): Additional data fields to log.
            includeInput (bool, optional): Whether to include node input data.
            includeOutput (bool, optional): Whether to include node output data
                (from previous nodes -- this node's own output is the audit entry).

        Returns:
            {"auditId": str, "timestamp": str}
        """
        event_type = data.inputs.get("eventType") or data.config.get("event_type")
        if not event_type:
            raise ValueError("eventType is required")

        fields_to_log = data.inputs.get("fieldsToLog") or data.config.get("fields_to_log") or {}
        include_input = data.inputs.get("includeInput", False)
        include_output = data.inputs.get("includeOutput", False)

        # Build the audit data payload
        audit_data: dict[str, Any] = {}

        if isinstance(fields_to_log, dict):
            audit_data.update(fields_to_log)

        if include_input:
            audit_data["_node_inputs"] = data.inputs

        if include_output and data.state:
            # Include outputs from previous nodes (not this node)
            audit_data["_node_state"] = {
                k: v for k, v in data.state.items()
                if k != data.node_id
            }

        # Redact sensitive fields
        audit_data = redact_sensitive_fields(audit_data)

        now = datetime.now(timezone.utc)

        # Write to the audit events table
        audit_id = await self._writer.write_event(
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            node_id=data.node_id,
            event_type=event_type,
            actor_id=context.user_id,
            data=audit_data,
            tenant_id=context.tenant_id or "",
            trace_id=context.extra_data.get("trace_id"),
        )

        logger.info(
            "Audit event written",
            audit_id=audit_id,
            event_type=event_type,
            node_id=data.node_id,
        )

        return {
            "auditId": audit_id,
            "timestamp": now.isoformat(),
        }
```

### Step 8: Implement StructuredLogExecutor (Node #29)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/structured_log_executor.py`

```python
"""Structured Logging node executor.

Writes structured log entries to JSONL files, following the existing
audit log pattern from SmartSpecWeb (apps/web/logs/audit/audit-YYYY-MM-DD.jsonl).

Workflow-specific logs go to a separate file series:
  python-backend/logs/workflow/workflow-YYYY-MM-DD.jsonl
  (or custom directory if injected).
"""

import json
import os
import structlog
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# Default log directory (relative to python-backend/)
_DEFAULT_LOG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
    "logs",
    "workflow",
)


class StructuredLogExecutor:
    """Executor for the Structured Logging node.

    Writes JSONL entries to date-based log files.

    Args:
        log_dir: Directory for JSONL log files. Defaults to
            python-backend/logs/workflow/.
    """

    def __init__(self, log_dir: str | None = None) -> None:
        self._log_dir = log_dir or _DEFAULT_LOG_DIR

    def _get_log_path(self) -> str:
        """Get the log file path for today."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return os.path.join(self._log_dir, f"workflow-{today}.jsonl")

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Write a structured log entry.

        Config/Inputs:
            level (str, required): Log level ("info", "warn", "error", "debug").
            messageTemplate (str, required): Log message (may contain placeholders).
            fields (dict, optional): Additional structured fields to log.

        Returns:
            {"logged": bool}
        """
        level = data.inputs.get("level") or data.config.get("level", "info")
        message_template = data.inputs.get("messageTemplate") or data.config.get("message_template")
        if not message_template:
            raise ValueError("messageTemplate is required")

        fields = data.inputs.get("fields") or data.config.get("fields") or {}

        now = datetime.now(timezone.utc)

        # Build the log entry
        entry = {
            "timestamp": now.isoformat(),
            "level": level,
            "message": message_template,
            "fields": fields,
            "workflowId": context.workflow_id,
            "executionId": context.execution_id,
            "nodeId": data.node_id,
            "userId": context.user_id,
            "tenantId": context.tenant_id,
        }

        # Write to JSONL file (append mode, non-blocking for I/O)
        try:
            log_path = self._get_log_path()
            os.makedirs(os.path.dirname(log_path), exist_ok=True)

            with open(log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str, ensure_ascii=False) + "\n")

            # Also emit via structlog for centralized log aggregation
            log_fn = getattr(logger, level, logger.info)
            log_fn(
                message_template,
                **fields,
                workflow_id=context.workflow_id,
                execution_id=context.execution_id,
                node_id=data.node_id,
            )

            return {"logged": True}

        except Exception as exc:
            logger.error(
                "Failed to write structured log",
                error=str(exc),
                node_id=data.node_id,
            )
            # Log failures should not crash the workflow
            return {"logged": False}
```

### Step 9: Implement MetricsExecutor (Node #30)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/metrics_executor.py`

```python
"""Metrics & Alerting node executor.

Emits workflow metrics and optionally triggers alerts when thresholds
are exceeded. Metrics are stored via a MetricsWriter (which writes to
the workflow_audit_events table with a "metric" event type). Alerts
are dispatched via a Notifier abstraction that wraps the existing
NotificationService.
"""

import structlog
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class MetricsWriter:
    """Writes metric data points to the database.

    In the current implementation, metrics are stored as audit events
    with eventType="metric". A dedicated metrics table can be added
    in Phase 2 for time-series queries.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
    """

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory

    async def record_metric(
        self,
        *,
        metric_name: str,
        value: float,
        workflow_id: str,
        execution_id: str,
        node_id: str,
        tenant_id: str,
        user_id: int,
    ) -> None:
        """Record a metric data point."""
        from sqlalchemy import text
        import json

        async with self._db_session_factory() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO workflow_audit_events
                        ("workflowId", "executionId", "nodeId", "eventType",
                         "actorId", "data", "tenantId", "createdAt")
                    VALUES
                        (:workflow_id, :execution_id, :node_id, 'metric',
                         :user_id, :data::jsonb, :tenant_id, NOW())
                    """
                ),
                {
                    "workflow_id": int(workflow_id) if workflow_id else None,
                    "execution_id": int(execution_id) if execution_id else None,
                    "node_id": node_id,
                    "user_id": user_id,
                    "data": json.dumps({
                        "metricName": metric_name,
                        "value": value,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }),
                    "tenant_id": tenant_id,
                },
            )
            await session.commit()


class AlertNotifier:
    """Dispatches alerts via the existing NotificationService.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
    """

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory

    async def send_alert(
        self,
        *,
        metric_name: str,
        value: float,
        threshold: float,
        channel: str,
        user_id: int,
        workflow_id: str,
    ) -> None:
        """Send an alert notification."""
        from app.services.notification_service import NotificationService

        async with self._db_session_factory() as session:
            service = NotificationService(session)
            await service.create_notification(
                user_id=str(user_id),
                type="warning",
                title=f"Metric Alert: {metric_name}",
                message=(
                    f"Metric '{metric_name}' value {value} exceeded "
                    f"threshold {threshold} in workflow {workflow_id}."
                ),
                data={
                    "metricName": metric_name,
                    "value": value,
                    "threshold": threshold,
                    "workflowId": workflow_id,
                },
                send_email=(channel == "email"),
                send_webhook=(channel == "webhook"),
            )


class MetricsExecutor:
    """Executor for the Metrics & Alerting node.

    Args:
        metrics_writer: A MetricsWriter instance (or mock for testing).
        notifier: An AlertNotifier instance (or mock for testing).
    """

    def __init__(
        self,
        metrics_writer: Any,
        notifier: Any | None = None,
    ) -> None:
        self._writer = metrics_writer
        self._notifier = notifier

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Emit a metric and optionally trigger an alert.

        Config/Inputs:
            metricName (str, required): Metric identifier.
            value (number, required): Metric value.
            alertThreshold (number, optional): Alert when value exceeds this.
            alertChannel (str, optional): Alert delivery channel
                ("email", "slack", "webhook").

        Returns:
            {"recorded": bool, "alertTriggered": bool}
        """
        metric_name = data.inputs.get("metricName") or data.config.get("metric_name")
        if not metric_name:
            raise ValueError("metricName is required")

        value = data.inputs.get("value")
        if value is None:
            raise ValueError("value is required")

        value = float(value)
        alert_threshold = data.inputs.get("alertThreshold") or data.config.get("alert_threshold")
        alert_channel = data.inputs.get("alertChannel") or data.config.get("alert_channel", "email")

        # Record the metric
        await self._writer.record_metric(
            metric_name=metric_name,
            value=value,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            node_id=data.node_id,
            tenant_id=context.tenant_id or "",
            user_id=context.user_id,
        )

        # Check threshold and trigger alert if exceeded
        alert_triggered = False
        if alert_threshold is not None and value > float(alert_threshold):
            alert_triggered = True
            if self._notifier:
                await self._notifier.send_alert(
                    metric_name=metric_name,
                    value=value,
                    threshold=float(alert_threshold),
                    channel=alert_channel,
                    user_id=context.user_id,
                    workflow_id=context.workflow_id,
                )
                logger.warning(
                    "Metric alert triggered",
                    metric_name=metric_name,
                    value=value,
                    threshold=alert_threshold,
                    channel=alert_channel,
                )

        logger.info(
            "Metric recorded",
            metric_name=metric_name,
            value=value,
            alert_triggered=alert_triggered,
        )

        return {
            "recorded": True,
            "alertTriggered": alert_triggered,
        }
```

### Step 10: Implement RunHistoryExecutor (Node #31)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/run_history_executor.py`

```python
"""Run History & Replay node executor.

Read-only node that queries the workflow_executions table (Section 13)
for execution history. Supports filtering by status and limiting results.

Replay functionality (triggering a new execution from a checkpoint)
is handled by the API layer (Section 14), not by this node.
"""

import structlog
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class HistoryReader:
    """Reads execution history from the workflow_executions table.

    Args:
        db_session_factory: Async callable returning an AsyncSession.
    """

    def __init__(self, db_session_factory: Any) -> None:
        self._db_session_factory = db_session_factory

    async def query_executions(
        self,
        *,
        workflow_id: str | None,
        tenant_id: str,
        limit: int = 10,
        status_filter: str = "all",
    ) -> dict[str, Any]:
        """Query execution history.

        Returns:
            {"executions": [...], "totalCount": int}
        """
        from sqlalchemy import text

        conditions = ['"tenantId" = :tenant_id']
        params: dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}

        if workflow_id:
            conditions.append('"workflowId" = :workflow_id')
            params["workflow_id"] = int(workflow_id)

        if status_filter and status_filter != "all":
            conditions.append('"status" = :status')
            params["status"] = status_filter

        where_clause = " AND ".join(conditions)

        async with self._db_session_factory() as session:
            # Get total count
            count_result = await session.execute(
                text(f"SELECT count(*) FROM workflow_executions WHERE {where_clause}"),
                params,
            )
            total_count = count_result.scalar() or 0

            # Get paginated results
            result = await session.execute(
                text(
                    f"""
                    SELECT id, "workflowId", "status", "startedAt", "completedAt",
                           "error", "nodeCount", "creditsUsed", "triggerType", "createdAt"
                    FROM workflow_executions
                    WHERE {where_clause}
                    ORDER BY "createdAt" DESC
                    LIMIT :limit
                    """
                ),
                params,
            )
            rows = result.fetchall()

        executions = [
            {
                "id": row[0],
                "workflowId": row[1],
                "status": row[2],
                "startedAt": row[3].isoformat() if row[3] else None,
                "completedAt": row[4].isoformat() if row[4] else None,
                "error": row[5],
                "nodeCount": row[6],
                "creditsUsed": row[7],
                "triggerType": row[8],
                "createdAt": row[9].isoformat() if row[9] else None,
            }
            for row in rows
        ]

        return {
            "executions": executions,
            "totalCount": total_count,
        }


class RunHistoryExecutor:
    """Executor for the Run History & Replay node.

    Args:
        history_reader: A HistoryReader instance (or mock for testing).
    """

    def __init__(self, history_reader: Any) -> None:
        self._reader = history_reader

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Query workflow execution history.

        Config/Inputs:
            workflowId (str, optional): Filter by workflow ID.
                If empty, uses the current workflow.
            limit (int, optional): Max results. Default 10.
            statusFilter (str, optional): Filter by status
                ("all", "completed", "failed", "running").

        Returns:
            {"executions": [...], "totalCount": int}
        """
        workflow_id = data.inputs.get("workflowId") or data.config.get("workflow_id")
        if not workflow_id:
            workflow_id = context.workflow_id

        limit = data.inputs.get("limit") or data.config.get("limit", 10)
        limit = min(int(limit), 100)  # Cap at 100

        status_filter = data.inputs.get("statusFilter") or data.config.get("status_filter", "all")

        tenant_id = context.tenant_id
        if not tenant_id:
            raise ValueError("tenant_id is required for execution history query")

        result = await self._reader.query_executions(
            workflow_id=workflow_id,
            tenant_id=tenant_id,
            limit=limit,
            status_filter=status_filter,
        )

        logger.info(
            "Run history queried",
            workflow_id=workflow_id,
            result_count=result["totalCount"],
            status_filter=status_filter,
        )

        return {
            "executions": result["executions"],
            "totalCount": result["totalCount"],
        }
```

### Step 11: Create Test Package Init

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/__init__.py`

```python
"""Test package for node executor tests."""
```

---

## Node Registry Registration

The following registrations are defined in Section 11 (Node Registry Expansion) and are referenced here for completeness. The executor dotpaths match the files created above.

| Node Type | Registry `type` | Executor Path |
|-----------|----------------|---------------|
| Secrets Vault | `secrets_vault` | `app.orchestrator.node_executors.security_executors.secrets_executor.SecretsExecutor` |
| RBAC Check | `rbac_check` | `app.orchestrator.node_executors.security_executors.rbac_executor.RBACExecutor` |
| Audit Log | `audit_log` | `app.orchestrator.node_executors.security_executors.audit_log_executor.AuditLogExecutor` |
| Structured Log | `structured_log` | `app.orchestrator.node_executors.security_executors.structured_log_executor.StructuredLogExecutor` |
| Metrics & Alert | `metrics` | `app.orchestrator.node_executors.security_executors.metrics_executor.MetricsExecutor` |
| Run History | `run_history` | `app.orchestrator.node_executors.security_executors.run_history_executor.RunHistoryExecutor` |

All six nodes use `category="security"`, `color="red"`, and are defined with full `InputSpec`/`OutputSpec` in Section 11. The `secrets_vault` node's output port uses `data_type="secret"` (a new port type also defined in Section 11).

---

## Error Handling

| Error Condition | Executor | Behavior |
|----------------|----------|----------|
| Secret not found | SecretsExecutor | Raises `KeyError` with secret name (not value) |
| Decryption failure | SecretsExecutor | Raises `ValueError` -- key may have changed |
| Unknown vault backend | SecretsExecutor | Raises `ValueError` listing available backends |
| Missing `secretName` | SecretsExecutor | Raises `ValueError` |
| Missing `tenant_id` | SecretsExecutor, RunHistoryExecutor | Raises `ValueError` |
| Missing `requiredRole` | RBACExecutor | Raises `ValueError` |
| User not found in DB | RBACExecutor | Defaults to `viewer` (lowest privilege) |
| Missing `eventType` | AuditLogExecutor | Raises `ValueError` |
| Audit DB write failure | AuditLogExecutor | Raises (propagates to DLQ if configured) |
| Missing `messageTemplate` | StructuredLogExecutor | Raises `ValueError` |
| Log file write failure | StructuredLogExecutor | Returns `{"logged": False}` (non-fatal) |
| Missing `metricName` or `value` | MetricsExecutor | Raises `ValueError` |
| Alert notification failure | MetricsExecutor | Logs error but does not re-raise (metric still recorded) |
| Execution query failure | RunHistoryExecutor | Raises (propagates as node error) |

---

## Security Considerations

### Secret Propagation Prevention

The system uses a three-layer defense to prevent secret material from leaking:

1. **`SecretValue` wrapper** (`secret_value.py`): Wraps decrypted secrets in an object whose `__str__` and `__repr__` return `"***REDACTED***"`. Even if a secret accidentally enters a log statement or error message via string formatting, the actual value is not exposed.

2. **Adapter scrubbing** (`node_adapter.py`): The `make_langgraph_node` function calls `scrub_secrets()` on the executor's output before writing to `node_outputs` in the LangGraph state. This ensures secrets are *never* written to the LangGraph checkpoint (PostgreSQL). The original `SecretValue` object is only available within the current Python execution scope.

3. **Audit redaction** (`audit_log_executor.py`): The `redact_sensitive_fields()` function automatically strips values from fields with sensitive names (password, token, apiKey, etc.) before writing audit events.

### How Downstream Nodes Access Secrets

Since secrets are scrubbed from `node_outputs` before state persistence, downstream nodes that need the actual secret value have two options:

- **Same execution (before checkpoint)**: Access the raw output from the executor's return value within the same `_node_fn` scope. This requires the downstream node to be directly connected and executed before any state checkpoint.
- **Re-fetch from vault**: The preferred approach. The downstream node (e.g., an HTTP Request node) includes its own `secretName` config and fetches the secret independently from the vault. This is more robust and works across checkpoint boundaries.

### Encryption Key Security

- The `InternalVaultBackend` uses `LLM_ENCRYPTION_KEY` via `smartspecweb_crypto.py` for decryption and direct `AESGCM` for encryption.
- If `LLM_ENCRYPTION_KEY` is rotated, all secrets in `workflow_secrets` must be re-encrypted. A rotation utility should be built as part of Section 14 (API endpoints).
- Secret values are never stored in LangGraph checkpoints, JSONL logs, or `workflow_audit_events.data`.

### RBAC Design

- The role hierarchy (`viewer < editor < admin < owner`) maps to the existing SmartSpecWeb roles (`user`, `admin`, `domain_admin`).
- Role comparison is purely numeric (higher level = more permissions). Resource-level permissions (e.g., "can user X edit workflow Y") are deferred to Phase 2 and the RBAC system at `/home/dev/projects/SmartSpecPro/python-backend/app/rbac/`.
- The RBAC executor resolves the user's role from the database if no `role_resolver` is injected. This adds one DB query per RBAC node execution.

---

## Verification Checklist

| Test Name | Test File | What it Verifies | TDD Requirement |
|-----------|----------|-----------------|-----------------|
| `test_secret_value_is_tagged` | `test_security.py` | SecretValue has `__secret__` marker | Prerequisite for scrubbing |
| `test_scrub_removes_secret_values` | `test_security.py` | `scrub_secrets()` replaces SecretValue with redaction | `test_secrets_scrubbed_from_state` |
| `test_secrets_scrubbed_from_state` | `test_security.py` | Integration: secrets removed from `node_outputs` | `test_secrets_scrubbed_from_state` |
| `test_secrets_vault_retrieves` | `test_security.py` | Secret decrypted and returned as SecretValue | `test_secrets_vault_retrieves` |
| `test_secrets_vault_never_logged` | `test_security.py` | Secret value not in str/repr/serialized form | `test_secrets_vault_never_logged` |
| `test_rbac_allows_admin` | `test_security.py` | Admin role passes editor check | `test_rbac_allows_admin` |
| `test_rbac_blocks_viewer` | `test_security.py` | Viewer role blocked for editor requirement | `test_rbac_blocks_viewer` |
| `test_audit_log_writes` | `test_security.py` | Audit event written via writer | `test_audit_log_writes` |
| `test_audit_log_redacts_sensitive` | `test_security.py` | password/apiKey fields redacted | `test_audit_log_redacts_sensitive` |
| `test_structured_logging_writes` | `test_security.py` | JSONL entry written to file | `test_structured_logging_writes` |
| `test_metrics_emits` | `test_security.py` | Metric recorded via writer | `test_metrics_emits` |
| `test_metrics_alert_triggered` | `test_security.py` | Alert fires when value > threshold | `test_metrics_alert_triggered` |
| `test_run_history_queries` | `test_security.py` | Execution history returned | `test_run_history_queries` |

All 11 required TDD tests from the plan are covered, plus additional edge case tests for completeness.

---

## Dependency Injection Pattern

All six executors follow a dependency injection pattern where service collaborators (vault, writer, reader, notifier) are injected via constructor arguments. This enables:

1. **Testability**: Mock objects are injected in tests -- no database or Redis needed for unit tests.
2. **Configurability**: Different backends can be swapped without changing executor logic.
3. **Production wiring**: A factory function (to be implemented in Section 11's executor loading or the runtime) creates executors with production dependencies.

**Example production wiring** (to be added to the runtime or executor factory):

```python
# In the runtime's executor factory (Section 01 / Section 11):
from app.core.secrets_vault import SecretsVault
from app.orchestrator.node_executors.security_executors import (
    SecretsExecutor,
    AuditLogExecutor,
    MetricsExecutor,
    RunHistoryExecutor,
    StructuredLogExecutor,
    RBACExecutor,
)
from app.orchestrator.node_executors.security_executors.audit_log_executor import AuditWriter
from app.orchestrator.node_executors.security_executors.metrics_executor import (
    MetricsWriter,
    AlertNotifier,
)
from app.orchestrator.node_executors.security_executors.run_history_executor import HistoryReader

def create_security_executors(db_session_factory):
    """Create all security executors with production dependencies."""
    vault = SecretsVault(db_session_factory)
    return {
        "secrets_vault": SecretsExecutor(vault=vault),
        "rbac_check": RBACExecutor(),  # Uses default DB resolver
        "audit_log": AuditLogExecutor(audit_writer=AuditWriter(db_session_factory)),
        "structured_log": StructuredLogExecutor(),  # Uses default log dir
        "metrics": MetricsExecutor(
            metrics_writer=MetricsWriter(db_session_factory),
            notifier=AlertNotifier(db_session_factory),
        ),
        "run_history": RunHistoryExecutor(
            history_reader=HistoryReader(db_session_factory),
        ),
    }
```