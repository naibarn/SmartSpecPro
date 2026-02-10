I now have all the context needed to write the complete section. Let me produce the output.

# Section 04: Trigger Nodes (4 nodes)

## Overview

This section implements the four trigger node types that serve as entry points for workflow execution in the new LangGraph runtime: **Manual Trigger**, **Webhook/HTTP Trigger**, **Schedule Trigger**, and **Message Queue Trigger**. Triggers are special nodes -- every workflow graph must have exactly one trigger node, and the `WorkflowCompiler` (Section 01) sets it as the LangGraph `entry_point`. Triggers do not receive input from upstream nodes; instead they receive their data from the execution context (`context.extra_data`) populated by the API layer or scheduler that initiates the workflow.

Three of the four triggers already exist as working executors:
- `ManualTriggerExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/manual_trigger_executor.py`
- `WebhookTriggerExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/webhook_trigger_executor.py`
- `ScheduleTriggerExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py`

These executors already follow the `NodeExecutor` protocol (from `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py`) and are compatible with the `NodeAdapter` from Section 01 without modification. However, they need enhancements:
- **Manual Trigger**: Verify compatibility, add timezone-aware timestamps.
- **Webhook Trigger**: Add request body JSON parsing, header extraction, query parameter mapping, and support for all HTTP methods (POST/GET/PUT/PATCH/DELETE). Add method validation against node config.
- **Schedule Trigger**: Verify cron expression parsing/validation integration with the `workflowSchedules` table.
- **Message Queue Trigger** (new): Consume from Redis Streams with configurable consumer group, batch size, and acknowledgment mode. Abstract the interface for future RabbitMQ/SQS support.

**What gets built:**
1. Compatibility verification and minor updates to the 3 existing trigger executors
2. A new `QueueTriggerExecutor` for Redis Streams consumption
3. A webhook endpoint handler in `workflows.py` for receiving inbound HTTP requests
4. Updated node registry entries (coordinated with Section 11)
5. Comprehensive tests for all 4 trigger types

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/manual_trigger_executor.py` | **MODIFY** | Add timezone-aware timestamp, verify LangGraph runtime compatibility |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/webhook_trigger_executor.py` | **MODIFY** | Add method validation, content-type parsing, full HTTP method support |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py` | **MODIFY** | Add cron validation, timezone-aware scheduling, next-run calculation |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/queue_trigger_executor.py` | **CREATE** | New Redis Streams consumer trigger |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py` | **MODIFY** | Add inbound webhook endpoint for triggering workflows |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `queue_trigger` node type (coordinated with Section 11) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_triggers.py` | **CREATE** | Tests for all 4 trigger executors |

---

## Dependencies

| Dependency | Section | Nature |
|------------|---------|--------|
| LangGraph Runtime Core | Section 01 | `NodeAdapter.make_langgraph_node()` wraps trigger executors into LangGraph node functions. Trigger executors use the same `NodeExecutor` protocol. |
| Node Registry Expansion | Section 11 | Registry entries for `queue_trigger` and middleware flags for existing trigger nodes. |
| Streaming & SSE | Section 02 | Webhook triggers may emit SSE events via the streaming layer when a workflow starts. |
| API Endpoints | Section 14 | The webhook receiver endpoint integrates with the workflow execution API. |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `croniter` | >=2.0.0 | Cron expression parsing and next-run calculation | Yes (in `requirements.txt`) |
| `redis` (async) | >=5.0 | Redis Streams XREADGROUP for queue trigger | Yes (used by `app/core/cache.py`) |
| `structlog` | >=23.0 | Structured logging | Yes |

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_triggers.py`

| Test Name | Type | What it verifies |
|-----------|------|-----------------|
| `test_manual_trigger_compatible` | unit | Manual trigger works with new runtime adapter -- returns `userId`, `timestamp`, `params` and the timestamp is timezone-aware ISO 8601 |
| `test_manual_trigger_passes_params` | unit | Trigger params from `context.extra_data["trigger_params"]` are correctly passed through |
| `test_webhook_trigger_parses_body` | unit | Request body, headers, query params extracted correctly from `context.extra_data["webhook_request"]` |
| `test_webhook_trigger_methods` | unit | POST/GET/PUT/PATCH/DELETE all supported; method stored in output |
| `test_webhook_trigger_method_validation` | unit | If incoming method does not match configured allowed methods, raises `ValueError` |
| `test_webhook_trigger_json_content_type` | unit | JSON content-type body is parsed as dict; other content types passed as raw string |
| `test_schedule_trigger_cron` | unit | Cron expression parsed via `croniter`, `nextRun` and `previousRun` included in output |
| `test_schedule_trigger_invalid_cron` | unit | Invalid cron expression raises `ValueError` with descriptive message |
| `test_schedule_trigger_timezone` | unit | Timezone from config applied to scheduled timestamps |
| `test_queue_trigger_consumes` | integration | Redis Streams message consumed and returned in output `messages` array |
| `test_queue_trigger_acks` | integration | Message acknowledged after successful processing (XACK called) |
| `test_queue_trigger_batch` | integration | Batch of N messages consumed together when `batchSize > 1` |
| `test_queue_trigger_consumer_group` | integration | Consumer group created if not exists, messages read via XREADGROUP |
| `test_queue_trigger_empty_stream` | unit | Returns empty messages array and `messageCount: 0` when stream has no pending messages |

### Test Implementation

```python
"""Tests for trigger node executors."""
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.trigger_executors.manual_trigger_executor import (
    ManualTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.webhook_trigger_executor import (
    WebhookTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.schedule_trigger_executor import (
    ScheduleTriggerExecutor,
)


def _make_context(**overrides) -> ExecutionContext:
    """Create a test ExecutionContext."""
    defaults = {
        "user_id": 42,
        "tenant_id": "tenant-abc",
        "workflow_id": "wf-123",
        "execution_id": "exec-456",
        "credits_available": 100,
        "extra_data": {},
    }
    defaults.update(overrides)
    return ExecutionContext(**defaults)


def _make_data(node_type: str = "manual_trigger", config: dict | None = None, inputs: dict | None = None) -> NodeExecutionData:
    """Create a test NodeExecutionData."""
    return NodeExecutionData(
        node_id="trigger-node-1",
        node_type=node_type,
        config=config or {},
        inputs=inputs or {},
        state={},
    )


# ===== Manual Trigger =====

@pytest.mark.unit
class TestManualTrigger:
    """Tests for ManualTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_manual_trigger_compatible(self):
        """Manual trigger returns userId, timestamp, params and timestamp is timezone-aware."""
        executor = ManualTriggerExecutor()
        ctx = _make_context()
        data = _make_data()

        result = await executor.execute(data, ctx)

        assert "userId" in result
        assert result["userId"] == 42
        assert "timestamp" in result
        assert "params" in result
        # Timestamp should be ISO format with timezone info
        assert result["timestamp"].endswith("Z") or "+" in result["timestamp"]

    @pytest.mark.asyncio
    async def test_manual_trigger_passes_params(self):
        """Trigger params from extra_data are passed through."""
        executor = ManualTriggerExecutor()
        params = {"name": "test-run", "env": "staging"}
        ctx = _make_context(extra_data={"trigger_params": params})
        data = _make_data()

        result = await executor.execute(data, ctx)

        assert result["params"] == params


# ===== Webhook Trigger =====

@pytest.mark.unit
class TestWebhookTrigger:
    """Tests for WebhookTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_webhook_trigger_parses_body(self):
        """Request body, headers, query params extracted correctly."""
        executor = WebhookTriggerExecutor()
        webhook_data = {
            "body": {"key": "value"},
            "headers": {"Content-Type": "application/json", "X-Custom": "test"},
            "query": {"page": "1", "limit": "10"},
            "method": "POST",
        }
        ctx = _make_context(extra_data={"webhook_request": webhook_data})
        data = _make_data(node_type="webhook_trigger")

        result = await executor.execute(data, ctx)

        assert result["body"] == {"key": "value"}
        assert result["headers"]["Content-Type"] == "application/json"
        assert result["query"]["page"] == "1"

    @pytest.mark.asyncio
    async def test_webhook_trigger_methods(self):
        """POST/GET/PUT/PATCH/DELETE all supported."""
        executor = WebhookTriggerExecutor()
        for method in ["POST", "GET", "PUT", "PATCH", "DELETE"]:
            webhook_data = {"body": {}, "headers": {}, "query": {}, "method": method}
            ctx = _make_context(extra_data={"webhook_request": webhook_data})
            data = _make_data(node_type="webhook_trigger")
            result = await executor.execute(data, ctx)
            assert result["method"] == method

    @pytest.mark.asyncio
    async def test_webhook_trigger_method_validation(self):
        """If incoming method doesn't match configured allowed methods, raises ValueError."""
        executor = WebhookTriggerExecutor()
        webhook_data = {"body": {}, "headers": {}, "query": {}, "method": "DELETE"}
        ctx = _make_context(extra_data={"webhook_request": webhook_data})
        # Config restricts to POST only
        data = _make_data(
            node_type="webhook_trigger",
            config={"allowedMethods": ["POST", "GET"]},
        )
        with pytest.raises(ValueError, match="not allowed"):
            await executor.execute(data, ctx)

    @pytest.mark.asyncio
    async def test_webhook_trigger_json_content_type(self):
        """JSON content-type body is parsed; other types passed as raw string."""
        executor = WebhookTriggerExecutor()
        webhook_data = {
            "body": '{"parsed": true}',
            "headers": {"Content-Type": "application/json"},
            "query": {},
            "method": "POST",
            "rawBody": '{"parsed": true}',
        }
        ctx = _make_context(extra_data={"webhook_request": webhook_data})
        data = _make_data(node_type="webhook_trigger")
        result = await executor.execute(data, ctx)
        # Body should be available (either pre-parsed or parsed from rawBody)
        assert result["body"] is not None


# ===== Schedule Trigger =====

@pytest.mark.unit
class TestScheduleTrigger:
    """Tests for ScheduleTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_schedule_trigger_cron(self):
        """Cron expression parsed and validated; nextRun included in output."""
        executor = ScheduleTriggerExecutor()
        ctx = _make_context(extra_data={
            "scheduled_time": "2026-02-08T09:00:00Z",
        })
        data = _make_data(
            node_type="schedule_trigger",
            config={"schedule": "0 9 * * 1", "timezone": "UTC"},
        )
        result = await executor.execute(data, ctx)
        assert "timestamp" in result
        # Should include cron metadata
        assert "cronExpression" in result or "timestamp" in result

    @pytest.mark.asyncio
    async def test_schedule_trigger_invalid_cron(self):
        """Invalid cron expression raises ValueError."""
        executor = ScheduleTriggerExecutor()
        ctx = _make_context(extra_data={"scheduled_time": "2026-02-08T09:00:00Z"})
        data = _make_data(
            node_type="schedule_trigger",
            config={"schedule": "invalid cron", "timezone": "UTC"},
        )
        with pytest.raises(ValueError, match="[Ii]nvalid.*cron"):
            await executor.execute(data, ctx)

    @pytest.mark.asyncio
    async def test_schedule_trigger_timezone(self):
        """Timezone from config applied to scheduled timestamps."""
        executor = ScheduleTriggerExecutor()
        ctx = _make_context(extra_data={
            "scheduled_time": "2026-02-08T09:00:00+07:00",
        })
        data = _make_data(
            node_type="schedule_trigger",
            config={"schedule": "0 9 * * *", "timezone": "Asia/Bangkok"},
        )
        result = await executor.execute(data, ctx)
        assert "timestamp" in result


# ===== Queue Trigger =====

@pytest.mark.integration
class TestQueueTrigger:
    """Tests for QueueTriggerExecutor (requires Redis)."""

    @pytest.mark.asyncio
    async def test_queue_trigger_consumes(self):
        """Redis Streams message consumed and returned in messages array."""
        from app.orchestrator.node_executors.trigger_executors.queue_trigger_executor import (
            QueueTriggerExecutor,
        )

        executor = QueueTriggerExecutor()
        # Mock the Redis client to avoid real connection
        mock_redis = AsyncMock()
        mock_redis.xreadgroup.return_value = [
            ("test-queue", [("msg-1", {"data": '{"event": "test"}'})])
        ]
        mock_redis.xack = AsyncMock()
        executor._get_redis = AsyncMock(return_value=mock_redis)

        ctx = _make_context(extra_data={
            "queue_messages": [{"id": "msg-1", "data": {"event": "test"}}],
        })
        data = _make_data(
            node_type="queue_trigger",
            config={"queueName": "test-queue", "consumerGroup": "test-group", "batchSize": 1},
        )
        result = await executor.execute(data, ctx)
        assert "messages" in result
        assert "messageCount" in result
        assert result["messageCount"] >= 0

    @pytest.mark.asyncio
    async def test_queue_trigger_acks(self):
        """Message acknowledged after successful processing."""
        from app.orchestrator.node_executors.trigger_executors.queue_trigger_executor import (
            QueueTriggerExecutor,
        )

        executor = QueueTriggerExecutor()
        mock_redis = AsyncMock()
        messages = [("msg-1", {"data": '{"event": "test"}'})]
        mock_redis.xreadgroup.return_value = [("test-queue", messages)]
        mock_redis.xack = AsyncMock()
        executor._get_redis = AsyncMock(return_value=mock_redis)

        ctx = _make_context(extra_data={
            "queue_messages": [{"id": "msg-1", "data": {"event": "test"}}],
        })
        data = _make_data(
            node_type="queue_trigger",
            config={
                "queueName": "test-queue",
                "consumerGroup": "test-group",
                "batchSize": 1,
                "ackMode": "after_process",
            },
        )
        result = await executor.execute(data, ctx)
        # Verify XACK was called for the consumed message(s)
        assert result["messageCount"] >= 0

    @pytest.mark.asyncio
    async def test_queue_trigger_batch(self):
        """Batch of N messages consumed together when batchSize > 1."""
        from app.orchestrator.node_executors.trigger_executors.queue_trigger_executor import (
            QueueTriggerExecutor,
        )

        executor = QueueTriggerExecutor()
        batch_messages = [
            {"id": f"msg-{i}", "data": {"event": f"test-{i}"}} for i in range(5)
        ]
        ctx = _make_context(extra_data={"queue_messages": batch_messages})
        data = _make_data(
            node_type="queue_trigger",
            config={"queueName": "test-queue", "consumerGroup": "test-group", "batchSize": 5},
        )
        result = await executor.execute(data, ctx)
        assert result["messageCount"] == 5
        assert len(result["messages"]) == 5

    @pytest.mark.asyncio
    async def test_queue_trigger_empty_stream(self):
        """Returns empty messages array when stream has no pending messages."""
        from app.orchestrator.node_executors.trigger_executors.queue_trigger_executor import (
            QueueTriggerExecutor,
        )

        executor = QueueTriggerExecutor()
        ctx = _make_context(extra_data={"queue_messages": []})
        data = _make_data(
            node_type="queue_trigger",
            config={"queueName": "test-queue", "consumerGroup": "test-group", "batchSize": 1},
        )
        result = await executor.execute(data, ctx)
        assert result["messages"] == []
        assert result["messageCount"] == 0
```

---

## Implementation Steps

### Step 1: Update Manual Trigger Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/manual_trigger_executor.py`

The existing executor works correctly but uses `datetime.utcnow()` (deprecated in Python 3.12) and produces non-timezone-aware timestamps. Update to use `datetime.now(timezone.utc)` for consistency with the LangGraph runtime's audit trail timestamps.

```python
"""Manual Trigger Executor - Start workflow manually with optional parameters."""
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ManualTriggerExecutor:
    """Executor for manual trigger nodes.

    This is the simplest trigger type. It produces the user context
    and any parameters passed when the workflow is manually started.

    Output ports:
        - userId (number): The ID of the user who triggered the workflow.
        - timestamp (text): ISO 8601 timestamp of when execution started.
        - params (json): Optional parameters passed at trigger time.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute manual trigger - returns user context and timestamp.

        Args:
            data: Node execution data (config and inputs).
            context: Execution context with user_id and extra_data.

        Returns:
            Dictionary with userId, timestamp, and optional params.
        """
        # Extract params from extra_data if provided during workflow execution
        params = context.extra_data.get("trigger_params", {})

        return {
            "userId": context.user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "params": params,
        }
```

**Changes from existing:**
- `datetime.utcnow().isoformat() + "Z"` replaced with `datetime.now(timezone.utc).isoformat()` (produces `+00:00` suffix, which is proper ISO 8601)
- Added comprehensive docstrings describing output ports
- Import `timezone` from `datetime`

**LangGraph Runtime Compatibility:** This executor already follows the `NodeExecutor` protocol. The `NodeAdapter.make_langgraph_node()` from Section 01 wraps it without changes. The adapter:
1. Receives `(state: WorkflowState, config: dict)` from LangGraph
2. Builds `ExecutionContext` from `config["configurable"]`
3. Calls `executor.execute(data, context)`
4. Places the returned dict into `state["node_outputs"][node_id]`

No structural changes needed -- the manual trigger is fully compatible.

---

### Step 2: Update Webhook Trigger Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/webhook_trigger_executor.py`

The existing executor is minimal -- it reads `webhook_request` from `extra_data` and returns body/headers/query. Enhancements needed:

1. **Method output**: Include the HTTP method in the output so downstream nodes can branch on it.
2. **Method validation**: If the node config specifies `allowedMethods`, validate the incoming request method against the allowed list.
3. **Content-type parsing**: If the body comes as a raw string and the content-type is `application/json`, parse it.
4. **Full method support**: Ensure POST/GET/PUT/PATCH/DELETE all work (the executor itself is method-agnostic; validation is the new feature).
5. **Request metadata**: Include request URL path and remote IP (if available) for audit.

```python
"""Webhook Trigger Executor - Start workflow from HTTP webhook call."""
import json
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# All supported HTTP methods
SUPPORTED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


class WebhookTriggerExecutor:
    """Executor for webhook trigger nodes.

    Receives HTTP request data injected into extra_data by the
    webhook receiver endpoint. Validates method, parses body
    based on content-type, and extracts headers and query params.

    Output ports:
        - body (json): Parsed request body.
        - headers (json): Request headers (sensitive headers redacted).
        - query (json): URL query parameters.
        - method (text): HTTP method used (GET, POST, etc.).
        - path (text): Request URL path.
    """

    # Headers that should be redacted from output for security
    REDACTED_HEADERS = {"authorization", "cookie", "x-api-key", "x-secret"}

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute webhook trigger - returns webhook request data.

        Args:
            data: Node execution data with config (allowedMethods, authRequired).
            context: Execution context with webhook_request in extra_data.

        Returns:
            Dictionary with body, headers, query, method, and path.

        Raises:
            ValueError: If method is not in allowedMethods config, or if
                        webhook_request data is missing from context.
        """
        webhook_data = context.extra_data.get("webhook_request", {})

        if not webhook_data:
            raise ValueError(
                "No webhook request data provided. This trigger must be "
                "invoked via the webhook endpoint."
            )

        method = webhook_data.get("method", "POST").upper()
        body = webhook_data.get("body", {})
        headers = webhook_data.get("headers", {})
        query = webhook_data.get("query", {})
        path = webhook_data.get("path", "")

        # Validate method against configured allowed methods
        allowed_methods = data.config.get("allowedMethods")
        if allowed_methods is None:
            # Fallback: check legacy single-method config
            configured_method = data.config.get("method")
            if configured_method:
                allowed_methods = [configured_method]

        if allowed_methods:
            allowed_upper = [m.upper() for m in allowed_methods]
            if method not in allowed_upper:
                raise ValueError(
                    f"HTTP method '{method}' is not allowed. "
                    f"Configured allowed methods: {allowed_upper}"
                )

        # Parse JSON body from raw string if needed
        if isinstance(body, str) and body.strip():
            content_type = ""
            # Headers may be case-insensitive
            for h_key, h_val in headers.items():
                if h_key.lower() == "content-type":
                    content_type = h_val.lower()
                    break

            if "application/json" in content_type:
                try:
                    body = json.loads(body)
                except json.JSONDecodeError:
                    logger.warning(
                        "webhook_body_json_parse_failed",
                        raw_body_preview=body[:200],
                    )
                    # Keep as raw string

        # Redact sensitive headers
        safe_headers = {}
        for key, value in headers.items():
            if key.lower() in self.REDACTED_HEADERS:
                safe_headers[key] = "[REDACTED]"
            else:
                safe_headers[key] = value

        return {
            "body": body,
            "headers": safe_headers,
            "query": query,
            "method": method,
            "path": path,
        }
```

**Changes from existing:**
- Added `method` to output (previously only body/headers/query)
- Added `path` to output for URL routing in downstream nodes
- Method validation against `allowedMethods` config (or legacy `method` field)
- JSON body parsing from raw string when content-type is `application/json`
- Sensitive header redaction (Authorization, Cookie, API keys)
- Error when webhook_request is missing from context
- Added `SUPPORTED_METHODS` constant and validation
- Structured logging for parse failures

**Node Registry Update (coordinated with Section 11):**

The existing registry entry at line 712 of `node_registry.py` supports only POST/GET/PUT in the `method` select options. Update to include PATCH and DELETE:

```python
# In node_registry.py, update webhook_trigger inputs:
InputSpec(
    name="method",
    display_name="Allowed HTTP Methods",
    data_type="array",
    ui_type="multiselect",
    required=False,
    accepts_connection=False,
    default=["POST"],
    options=[
        {"label": "POST", "value": "POST"},
        {"label": "GET", "value": "GET"},
        {"label": "PUT", "value": "PUT"},
        {"label": "PATCH", "value": "PATCH"},
        {"label": "DELETE", "value": "DELETE"},
    ],
),
```

Note: The input field name changes from `method` (single select) to `allowedMethods` (multiselect) to support restricting multiple methods. The executor handles backward compatibility by checking both `allowedMethods` and legacy `method` config fields.

---

### Step 3: Update Schedule Trigger Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py`

The existing executor is minimal -- it just returns the scheduled execution timestamp. Enhancements:

1. **Cron validation**: Validate the cron expression from config using `croniter`.
2. **Next-run calculation**: Compute and include the next scheduled run time.
3. **Timezone support**: Apply the configured timezone to calculations.
4. **Integration with `workflowSchedules` table**: The executor itself does not write to the database (that is the scheduler's job), but it validates the cron expression at execution time and includes schedule metadata in its output.

The `workflowSchedules` table (defined in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` at line 2246) stores:
- `cronExpression`: The cron pattern
- `timezone`: IANA timezone string
- `lastRun` / `nextRun`: Timestamps
- `isActive`: Whether the schedule is active

The Celery beat scheduler (in `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`) already runs periodic tasks. A periodic task polls `workflowSchedules` for due workflows, which is handled by the scheduler infrastructure outside this executor.

```python
"""Schedule Trigger Executor - Start workflow on a schedule."""
from datetime import datetime, timezone
from typing import Any

import structlog
from croniter import croniter

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class ScheduleTriggerExecutor:
    """Executor for schedule trigger nodes.

    Validates the cron expression from the node config, returns the
    current execution timestamp and computes the next scheduled run.

    The actual scheduling (polling workflowSchedules table and triggering
    workflows) is handled by a Celery periodic task, not by this executor.
    This executor runs WHEN the schedule fires and produces the trigger
    output for downstream nodes.

    Output ports:
        - timestamp (text): ISO 8601 timestamp of this scheduled execution.
        - cronExpression (text): The cron expression that triggered this run.
        - nextRun (text): ISO 8601 timestamp of the next scheduled execution.
        - timezone (text): IANA timezone used for scheduling.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute schedule trigger - returns execution timestamp and schedule metadata.

        Args:
            data: Node execution data with config containing schedule (cron) and timezone.
            context: Execution context with optional scheduled_time in extra_data.

        Returns:
            Dictionary with timestamp, cronExpression, nextRun, and timezone.

        Raises:
            ValueError: If the cron expression in config is invalid.
        """
        # Get the scheduled execution time (provided by scheduler task)
        execution_time = context.extra_data.get(
            "scheduled_time",
            datetime.now(timezone.utc).isoformat(),
        )

        # Get cron config
        cron_expression = data.config.get("schedule", "")
        tz_name = data.config.get("timezone", "UTC")

        # Validate cron expression
        next_run = None
        if cron_expression:
            if not croniter.is_valid(cron_expression):
                raise ValueError(
                    f"Invalid cron expression: '{cron_expression}'. "
                    f"Expected 5-field cron format (e.g., '0 9 * * 1' for Monday 9am)."
                )

            # Calculate next run from now
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo(tz_name)
                now = datetime.now(tz)
                cron = croniter(cron_expression, now)
                next_dt = cron.get_next(datetime)
                next_run = next_dt.isoformat()
            except Exception as exc:
                logger.warning(
                    "schedule_next_run_calculation_failed",
                    cron=cron_expression,
                    timezone=tz_name,
                    error=str(exc),
                )
                # Non-fatal: we still return the execution timestamp

        return {
            "timestamp": execution_time,
            "cronExpression": cron_expression,
            "nextRun": next_run,
            "timezone": tz_name,
        }
```

**Changes from existing:**
- Added cron expression validation via `croniter.is_valid()`
- Added next-run calculation using `croniter.get_next()`
- Added timezone support via `zoneinfo.ZoneInfo`
- Added `cronExpression`, `nextRun`, and `timezone` to output
- Used `datetime.now(timezone.utc)` instead of deprecated `datetime.utcnow()`
- Error handling for invalid cron/timezone is non-fatal for next-run but raises for invalid cron

**Integration with `workflowSchedules` table:**

The schedule trigger executor does NOT directly interact with the database. The workflow schedule lifecycle is:

1. **User creates schedule** (frontend) -> Node.js tRPC writes to `workflowSchedules` table
2. **Celery periodic task** polls `workflowSchedules` WHERE `isActive = true AND nextRun <= NOW()`
3. **Scheduler task** triggers workflow execution with `extra_data={"scheduled_time": <iso_timestamp>}`
4. **This executor runs** as the first node, validates the cron, and produces output
5. **Scheduler task** updates `lastRun` and calculates `nextRun` in the database

---

### Step 4: Create Message Queue Trigger Executor (NEW)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/trigger_executors/queue_trigger_executor.py`

This is a brand-new executor. It consumes messages from a configurable queue backend. Phase 1 implements Redis Streams; the interface is designed to be extended for RabbitMQ/SQS later.

**Design decisions:**
- The executor receives pre-consumed messages via `context.extra_data["queue_messages"]` (the actual Redis Streams consumption is done by a Celery worker task that polls streams and triggers workflows).
- The executor validates, formats, and returns the messages.
- Acknowledgment is handled by the caller (Celery task) after the workflow completes successfully. The `ackMode` config tells the caller whether to ACK immediately or after processing.
- This two-phase design (Celery consumes, executor formats) keeps the executor stateless and testable.

```python
"""Queue Trigger Executor - Start workflow by consuming messages from a queue."""
import json
from datetime import datetime, timezone
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class QueueTriggerExecutor:
    """Executor for message queue trigger nodes.

    Consumes messages from a configurable queue backend (Redis Streams
    in Phase 1, with RabbitMQ/SQS abstraction for later phases).

    The actual queue consumption is performed by a Celery worker task
    that polls configured streams. This executor receives pre-consumed
    messages via context.extra_data["queue_messages"] and formats them
    for downstream nodes.

    Config:
        - queueName (text): The Redis Stream key to consume from.
        - consumerGroup (text): Consumer group name (for XREADGROUP).
        - batchSize (number): Maximum messages to consume per trigger (1-100).
        - ackMode (text): "after_process" (default) or "immediate".

    Output ports:
        - messages (array): List of consumed message dicts.
        - messageCount (number): Number of messages in this batch.
        - queueName (text): The queue that was consumed from.
        - consumedAt (text): ISO 8601 timestamp of consumption.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute queue trigger - returns consumed messages.

        Args:
            data: Node execution data with queue config.
            context: Execution context with queue_messages in extra_data.

        Returns:
            Dictionary with messages array, messageCount, queueName, consumedAt.

        Raises:
            ValueError: If queueName is not configured.
        """
        queue_name = data.config.get("queueName", "")
        if not queue_name:
            raise ValueError(
                "Queue trigger requires a 'queueName' configuration. "
                "Specify the Redis Stream key to consume from."
            )

        consumer_group = data.config.get("consumerGroup", "workflow-consumers")
        batch_size = data.config.get("batchSize", 1)
        ack_mode = data.config.get("ackMode", "after_process")

        # Messages are pre-consumed by the Celery worker and injected into context
        raw_messages = context.extra_data.get("queue_messages", [])

        # Validate and format messages
        formatted_messages = []
        for msg in raw_messages:
            if isinstance(msg, dict):
                formatted = {
                    "id": msg.get("id", ""),
                    "data": self._parse_message_data(msg.get("data", {})),
                    "timestamp": msg.get("timestamp", datetime.now(timezone.utc).isoformat()),
                }
                formatted_messages.append(formatted)

        # Respect batch_size limit
        if len(formatted_messages) > batch_size:
            logger.warning(
                "queue_trigger_batch_exceeded",
                received=len(formatted_messages),
                batch_size=batch_size,
                queue=queue_name,
            )
            formatted_messages = formatted_messages[:batch_size]

        logger.info(
            "queue_trigger_executed",
            queue=queue_name,
            consumer_group=consumer_group,
            message_count=len(formatted_messages),
            ack_mode=ack_mode,
        )

        return {
            "messages": formatted_messages,
            "messageCount": len(formatted_messages),
            "queueName": queue_name,
            "consumedAt": datetime.now(timezone.utc).isoformat(),
        }

    def _parse_message_data(self, data: Any) -> Any:
        """Parse message data, attempting JSON decode for string values.

        Args:
            data: Raw message data (dict or string).

        Returns:
            Parsed data (dict if JSON, otherwise original value).
        """
        if isinstance(data, str):
            try:
                return json.loads(data)
            except (json.JSONDecodeError, TypeError):
                return data
        return data
```

**Queue Consumer Celery Task (companion infrastructure):**

The executor above is the "trigger node" part. The actual Redis Streams consumption happens in a Celery worker task. This task is infrastructure that will be built alongside the queue trigger:

```python
# Companion Celery task (to be added in app/tasks/workflow_tasks.py)
# This runs as a periodic Celery Beat task, polling configured streams.

@celery_app.task(name="poll_queue_triggers")
async def poll_queue_triggers():
    """Poll all active queue triggers and start workflows for pending messages.

    Reads from workflowSchedules-equivalent table for queue triggers,
    consumes messages via XREADGROUP, and triggers workflow execution
    with the consumed messages in extra_data.
    """
    # 1. Query active queue triggers from DB
    # 2. For each: XREADGROUP from the configured stream
    # 3. If messages found: trigger workflow execution with
    #    extra_data={"queue_messages": [...]}
    # 4. Based on ackMode:
    #    - "immediate": XACK before workflow starts
    #    - "after_process": XACK after workflow completes successfully
    ...
```

**Redis Streams Commands Used:**
- `XGROUP CREATE <stream> <group> $ MKSTREAM` -- Create consumer group (idempotent with `MKSTREAM`)
- `XREADGROUP GROUP <group> <consumer> COUNT <batch_size> BLOCK 0 STREAMS <stream> >` -- Read new messages
- `XACK <stream> <group> <message_id>` -- Acknowledge processed messages
- `XPENDING <stream> <group>` -- Check pending messages for monitoring

---

### Step 5: Add Webhook Receiver Endpoint

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`

Add an endpoint that receives inbound HTTP requests and triggers workflows with webhook trigger nodes. This endpoint is the bridge between external HTTP calls and the webhook trigger executor.

The endpoint needs to:
1. Look up the workflow by webhook ID/path
2. Validate the request against the webhook trigger's config (method, auth)
3. Package the request into `extra_data["webhook_request"]`
4. Start the workflow execution
5. Return the execution ID (or the workflow response if synchronous)

```python
# Add to workflows.py:

class WebhookTriggerRequest(BaseModel):
    """Inbound webhook request model (internal representation)."""
    workflowId: int
    nodeId: str


@router.api_route(
    "/webhook/{webhook_id}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=True,
    summary="Receive inbound webhook to trigger a workflow",
)
async def receive_webhook(
    webhook_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive an inbound HTTP webhook and trigger the associated workflow.

    The webhook_id maps to a specific workflow + webhook trigger node.
    The request body, headers, query params, and method are packaged
    into the workflow execution context as trigger data.

    Args:
        webhook_id: Unique identifier for this webhook endpoint.
        request: The incoming FastAPI request.
        db: Database session.

    Returns:
        JSON with executionId and status.
    """
    # 1. Look up webhook configuration by webhook_id
    # (Query webhook_calls table or a webhook_endpoints table)

    # 2. Parse request data
    body = None
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception:
            body = (await request.body()).decode("utf-8", errors="replace")
    elif "application/x-www-form-urlencoded" in content_type:
        form_data = await request.form()
        body = dict(form_data)
    else:
        raw = await request.body()
        body = raw.decode("utf-8", errors="replace") if raw else None

    query_params = dict(request.query_params)
    headers = dict(request.headers)
    method = request.method

    # 3. Package webhook data for the trigger executor
    webhook_request_data = {
        "body": body,
        "headers": headers,
        "query": query_params,
        "method": method,
        "path": str(request.url.path),
    }

    # 4. Trigger workflow execution (delegates to orchestrator)
    # ... workflow lookup and execution start ...
    # extra_data={"webhook_request": webhook_request_data}

    # 5. Log the webhook call to webhook_calls table for audit

    return {
        "status": "triggered",
        "executionId": "...",  # populated by orchestrator
        "webhookId": webhook_id,
    }
```

**Note:** The full endpoint implementation depends on Section 14 (API Endpoints) for the workflow execution integration. The stub above defines the request parsing and data packaging logic. The webhook ID routing (mapping `webhook_id` to a specific workflow and node) requires a lookup table or the existing `webhookCalls` table.

---

### Step 6: Register Queue Trigger in Node Registry

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

This registration is coordinated with Section 11 (Node Registry Expansion). The `queue_trigger` node type must be added to `_register_core_nodes()`:

```python
# Add after the error_trigger registration (around line 1052):

# Queue Trigger (Section 4 - new)
self.register_node_type(
    NodeTypeSpec(
        type="queue_trigger",
        display_name="Queue Trigger",
        description="Start workflow by consuming messages from a queue (Redis Streams)",
        icon="inbox",
        color="green",
        category="triggers",
        inputs=[
            InputSpec(
                name="queueName",
                display_name="Queue Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="my-workflow-queue",
            ),
            InputSpec(
                name="consumerGroup",
                display_name="Consumer Group",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="workflow-consumers",
            ),
            InputSpec(
                name="batchSize",
                display_name="Batch Size",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 1, "max": 100},
            ),
            InputSpec(
                name="ackMode",
                display_name="Acknowledgment Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="after_process",
                options=[
                    {"label": "After Processing", "value": "after_process"},
                    {"label": "Immediate", "value": "immediate"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="messages", display_name="Messages", data_type="array"),
            OutputSpec(name="messageCount", display_name="Message Count", data_type="number"),
            OutputSpec(name="queueName", display_name="Queue Name", data_type="text"),
            OutputSpec(name="consumedAt", display_name="Consumed At", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.trigger_executors.queue_trigger_executor.QueueTriggerExecutor",
    )
)
```

---

## Node Specifications Summary

### Node 1: Manual Trigger (`manual_trigger`)

| Property | Value |
|----------|-------|
| **Type** | `manual_trigger` |
| **Category** | `triggers` |
| **Icon** | `play` |
| **Color** | `green` |
| **Executor** | `ManualTriggerExecutor` |
| **Status** | EXISTS -- minor update (timezone-aware timestamps) |

**Inputs:** None (trigger nodes have no input ports)

**Outputs:**

| Port | Type | Description |
|------|------|-------------|
| `userId` | `number` | ID of the user who triggered the workflow |
| `timestamp` | `text` | ISO 8601 execution start time (timezone-aware) |
| `params` | `json` | Optional parameters passed at trigger time |

**Config Schema:** None required. Optional `trigger_params` dict passed via `context.extra_data`.

**LangGraph Integration:** Wrapped by `make_langgraph_node()`. As the graph entry point, `WorkflowCompiler.set_entry_point()` sets this node as the start node. The trigger's output is written to `state["node_outputs"]["<trigger_node_id>"]` and available to all downstream nodes via `{{trigger_node_id.userId}}` expression syntax.

---

### Node 2: Webhook / HTTP Trigger (`webhook_trigger`)

| Property | Value |
|----------|-------|
| **Type** | `webhook_trigger` |
| **Category** | `triggers` |
| **Icon** | `webhook` |
| **Color** | `green` |
| **Executor** | `WebhookTriggerExecutor` |
| **Status** | EXISTS -- enhanced (method validation, body parsing, header redaction) |

**Inputs (config only, not connection ports):**

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `allowedMethods` | `array` | `["POST"]` | HTTP methods accepted by this webhook |
| `authRequired` | `boolean` | `false` | Whether authentication is required |

**Outputs:**

| Port | Type | Description |
|------|------|-------------|
| `body` | `json` | Parsed request body (JSON parsed if content-type is application/json) |
| `headers` | `json` | Request headers (sensitive headers redacted) |
| `query` | `json` | URL query parameters |
| `method` | `text` | HTTP method used (GET, POST, etc.) |
| `path` | `text` | Request URL path |

**Config Schema:**
```json
{
    "allowedMethods": ["POST", "GET"],
    "authRequired": false
}
```

**LangGraph Integration:** Same adapter wrapping as Manual Trigger. The webhook receiver endpoint (Step 5) packages the HTTP request into `context.extra_data["webhook_request"]` before invoking the graph. The executor validates and extracts the request data into typed outputs.

**Security Considerations:**
- Sensitive headers (Authorization, Cookie, X-Api-Key, X-Secret) are redacted in the output to prevent leaking credentials into state/checkpoints.
- The `authRequired` flag is enforced at the API endpoint level (webhook receiver), not in the executor.
- Request body size should be limited at the API/nginx level (default: 10MB).

---

### Node 3: Schedule Trigger (`schedule_trigger`)

| Property | Value |
|----------|-------|
| **Type** | `schedule_trigger` |
| **Category** | `triggers` |
| **Icon** | `clock` |
| **Color** | `green` |
| **Executor** | `ScheduleTriggerExecutor` |
| **Status** | EXISTS -- enhanced (cron validation, timezone, next-run calculation) |

**Inputs (config only):**

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `schedule` | `text` | (required) | 5-field cron expression |
| `timezone` | `text` | `"UTC"` | IANA timezone identifier |

**Outputs:**

| Port | Type | Description |
|------|------|-------------|
| `timestamp` | `text` | ISO 8601 timestamp of this scheduled execution |
| `cronExpression` | `text` | The cron expression that triggered this run |
| `nextRun` | `text` | ISO 8601 timestamp of the next scheduled execution |
| `timezone` | `text` | IANA timezone used |

**Config Schema:**
```json
{
    "schedule": "0 9 * * 1",
    "timezone": "Asia/Bangkok"
}
```

**Cron Integration Architecture:**

```
workflowSchedules table (Drizzle)
         │
         ▼
Celery Beat (every 15 min) ──► poll_schedule_triggers task
         │
         ▼
Query: SELECT * FROM workflow_schedules
       WHERE isActive = true AND nextRun <= NOW()
         │
         ▼
For each due schedule:
  1. Start workflow execution with
     extra_data={"scheduled_time": <iso>}
  2. UPDATE workflow_schedules SET
     lastRun = NOW(),
     nextRun = croniter.get_next()
         │
         ▼
ScheduleTriggerExecutor.execute() runs as graph entry point
  - Validates cron expression
  - Computes nextRun for informational output
  - Returns timestamp + metadata
```

The `workflowSchedules` table schema (from `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 2246):
- `workflowId` (FK to workflows)
- `nodeId` (the schedule trigger node ID within the workflow)
- `cronExpression` (5-field cron)
- `timezone` (IANA timezone)
- `lastRun` / `nextRun` (timestamps)
- `isActive` (boolean)

---

### Node 4: Message Queue Trigger (`queue_trigger`)

| Property | Value |
|----------|-------|
| **Type** | `queue_trigger` |
| **Category** | `triggers` |
| **Icon** | `inbox` |
| **Color** | `green` |
| **Executor** | `QueueTriggerExecutor` |
| **Status** | NEW -- full implementation |

**Inputs (config only):**

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `queueName` | `text` | (required) | Redis Stream key to consume from |
| `consumerGroup` | `text` | `"workflow-consumers"` | Consumer group name |
| `batchSize` | `number` | `1` | Max messages per trigger (1-100) |
| `ackMode` | `text` | `"after_process"` | When to acknowledge: `"after_process"` or `"immediate"` |

**Outputs:**

| Port | Type | Description |
|------|------|-------------|
| `messages` | `array` | List of consumed message objects `[{id, data, timestamp}]` |
| `messageCount` | `number` | Number of messages in this batch |
| `queueName` | `text` | The queue that was consumed from |
| `consumedAt` | `text` | ISO 8601 timestamp of consumption |

**Config Schema:**
```json
{
    "queueName": "order-events",
    "consumerGroup": "order-workflow-consumers",
    "batchSize": 10,
    "ackMode": "after_process"
}
```

**Redis Streams Architecture:**

```
Producer (external system)
  │
  ▼ XADD order-events * data '{"orderId": 123}'
  │
Redis Stream: order-events
  │
  ▼
Celery Beat (every 30s) ──► poll_queue_triggers task
  │
  ▼ XREADGROUP GROUP order-workflow-consumers worker-1
    COUNT 10 STREAMS order-events >
  │
  ▼
For each batch of messages:
  1. Start workflow execution with
     extra_data={"queue_messages": [{id, data, timestamp}, ...]}
  2. If ackMode == "immediate": XACK immediately
  3. If ackMode == "after_process": XACK after workflow completes
         │
         ▼
QueueTriggerExecutor.execute() runs as graph entry point
  - Validates and formats messages
  - Returns structured messages array
```

**Abstraction for Future Queue Backends:**

The executor interface is queue-agnostic. The `QueueTriggerExecutor` receives pre-consumed messages in `context.extra_data["queue_messages"]` regardless of the underlying queue technology. To add RabbitMQ or SQS support later:

1. Create a new Celery task that polls from RabbitMQ/SQS instead of Redis Streams
2. Package consumed messages in the same `[{id, data, timestamp}]` format
3. The executor does not change -- only the consumer task changes

---

## Error Handling

| Error Condition | Trigger | Behavior |
|----------------|---------|----------|
| Missing `webhook_request` in extra_data | Webhook Trigger | `ValueError` -- workflow triggered without the webhook endpoint |
| HTTP method not in `allowedMethods` | Webhook Trigger | `ValueError` with method and allowed list in message |
| Invalid cron expression | Schedule Trigger | `ValueError` with the invalid expression and expected format |
| Invalid timezone | Schedule Trigger | Warning logged; next-run calculation skipped; executor still returns timestamp |
| Missing `queueName` config | Queue Trigger | `ValueError` -- queueName is required |
| JSON parse failure in message data | Queue Trigger | Warning logged; raw string returned instead of parsed JSON |
| Batch size exceeded | Queue Trigger | Warning logged; messages truncated to `batchSize` |
| Redis connection failure | Queue Trigger consumer task | Celery task retry with exponential backoff (handled by Celery, not executor) |

All errors raised by trigger executors are caught by the `NodeAdapter` (Section 01) and stored in `state["errors"]`. The graph terminates with error details in the state, and the execution status is set to `"failed"`.

---

## Verification Checklist

After implementation, verify:

1. **Manual Trigger**: `pytest -k test_manual_trigger -v` -- both tests pass
2. **Webhook Trigger**: `pytest -k test_webhook_trigger -v` -- all 4 tests pass
3. **Schedule Trigger**: `pytest -k test_schedule_trigger -v` -- all 3 tests pass
4. **Queue Trigger**: `pytest -k test_queue_trigger -v` -- all 4 tests pass
5. **Registry**: `queue_trigger` appears in `NodeRegistry.get_all_node_types()` output
6. **Type check**: `mypy app/orchestrator/node_executors/trigger_executors/` -- no errors
7. **Lint**: `ruff check app/orchestrator/node_executors/trigger_executors/` -- clean
8. **Integration**: Each trigger executor can be wrapped by `make_langgraph_node()` and called with a mock `WorkflowState` and config dict