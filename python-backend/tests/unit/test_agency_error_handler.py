"""Tests for agency_error_handler — error handler strategies."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.agency_error_handler import (
    MAX_RETRIES_CAP,
    RunTerminatedError,
    execute_fallback,
    execute_retry,
    execute_skip,
    execute_terminate,
    scrub_error_payload,
)


@pytest.mark.unit
@pytest.mark.agency
class TestScrubErrorPayload:
    def test_scrubs_file_paths(self):
        raw = 'Error at /home/dev/projects/app.py line 42'
        result = scrub_error_payload(raw)
        assert "/home/dev" not in result
        assert "[REDACTED]" in result

    def test_scrubs_db_urls(self):
        raw = "Connection failed: postgresql://user:pass@host:5432/db"
        result = scrub_error_payload(raw)
        assert "postgresql://" not in result
        assert "pass" not in result

    def test_scrubs_api_keys(self):
        raw = "Auth error with key sk-abc123defghijklmnop"
        result = scrub_error_payload(raw)
        assert "sk-abc123" not in result

    def test_scrubs_bearer_tokens(self):
        raw = "Header: Bearer eyJhbGciOiJIUzI1NiJ9.token"
        result = scrub_error_payload(raw)
        assert "eyJhbGci" not in result

    def test_scrubs_stack_traces(self):
        raw = 'File "/home/dev/app.py", line 10, in foo\n  x = 1'
        result = scrub_error_payload(raw)
        assert 'File "' not in result

    def test_truncates_long_messages(self):
        raw = "x" * 1000
        result = scrub_error_payload(raw)
        assert len(result) <= 504  # 500 + "..."

    def test_preserves_safe_summary(self):
        raw = "Connection timeout after 30 seconds"
        result = scrub_error_payload(raw)
        assert "Connection timeout" in result


@pytest.mark.unit
@pytest.mark.agency
class TestExecuteRetry:
    @pytest.mark.asyncio
    async def test_retry_succeeds_after_failures(self):
        call_count = 0

        async def failing_then_success(node, ctx):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("transient error")
            return "success"

        node = {"id": "n1", "name": "TestNode"}
        ctx = MagicMock()
        retry_config = {"maxRetries": 3, "backoffMs": 1, "backoffMultiplier": 2}

        result = await execute_retry(failing_then_success, node, ctx, retry_config)
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_exhausted_raises(self):
        async def always_fail(node, ctx):
            raise RuntimeError("permanent error")

        node = {"id": "n1", "name": "TestNode"}
        ctx = MagicMock()
        retry_config = {"maxRetries": 2, "backoffMs": 1, "backoffMultiplier": 1}

        with pytest.raises(RuntimeError, match="permanent error"):
            await execute_retry(always_fail, node, ctx, retry_config)

    @pytest.mark.asyncio
    async def test_max_retries_capped_at_5(self):
        call_count = 0

        async def always_fail(node, ctx):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("fail")

        node = {"id": "n1", "name": "TestNode"}
        ctx = MagicMock()
        retry_config = {"maxRetries": 10, "backoffMs": 1, "backoffMultiplier": 1}

        with pytest.raises(RuntimeError):
            await execute_retry(always_fail, node, ctx, retry_config)
        # initial + 5 retries = 6
        assert call_count == MAX_RETRIES_CAP + 1

    @pytest.mark.asyncio
    async def test_retry_emits_events(self):
        call_count = 0

        async def fail_once(node, ctx):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("oops")
            return "ok"

        emitter = MagicMock()
        emitter.emit = AsyncMock()
        node = {"id": "n1", "name": "RetryNode"}
        ctx = MagicMock()
        retry_config = {"maxRetries": 2, "backoffMs": 1, "backoffMultiplier": 1}

        result = await execute_retry(fail_once, node, ctx, retry_config, emitter=emitter)
        assert result == "ok"
        assert emitter.emit.call_count >= 1
        # First call is error event, second is success
        first_call = emitter.emit.call_args_list[0]
        assert first_call[0][0] == "error_handled"
        assert first_call[0][1]["strategy"] == "retry"


@pytest.mark.unit
@pytest.mark.agency
class TestExecuteFallback:
    def test_fallback_with_node_id(self):
        result, redirect = execute_fallback(
            fallback_node_id="node-backup",
            fallback_message=None,
            error=RuntimeError("API down"),
        )
        assert result is None
        assert redirect == "node-backup"

    def test_fallback_with_message(self):
        result, redirect = execute_fallback(
            fallback_node_id=None,
            fallback_message="Using cached response",
            error=RuntimeError("API down"),
        )
        assert result == "Using cached response"
        assert redirect is None

    def test_fallback_default_message(self):
        result, redirect = execute_fallback(
            fallback_node_id=None,
            fallback_message=None,
            error=RuntimeError("API down"),
        )
        assert result is not None
        assert "Fallback" in result
        assert redirect is None


@pytest.mark.unit
@pytest.mark.agency
class TestExecuteSkip:
    def test_skip_with_message(self):
        result = execute_skip("Step skipped due to API error")
        assert result == "Step skipped due to API error"

    def test_skip_default_message(self):
        result = execute_skip(None)
        assert "skipped" in result.lower()


@pytest.mark.unit
@pytest.mark.agency
class TestExecuteTerminate:
    def test_terminate_raises(self):
        with pytest.raises(RunTerminatedError) as exc_info:
            execute_terminate("FailedNode", RuntimeError("critical"))
        assert "FailedNode" in str(exc_info.value)

    def test_terminate_scrubs_error(self):
        error = RuntimeError("Failed at /home/dev/secret/app.py with key sk-secretkey1234567890")
        with pytest.raises(RunTerminatedError) as exc_info:
            execute_terminate("Node1", error)
        msg = str(exc_info.value)
        assert "/home/dev" not in msg
        assert "sk-secret" not in msg


@pytest.mark.unit
@pytest.mark.agency
class TestScrubAdditionalPaths:
    def test_scrubs_var_paths(self):
        raw = "Error at /var/task/app.py"
        result = scrub_error_payload(raw)
        assert "/var/" not in result

    def test_scrubs_tmp_paths(self):
        raw = "Cached at /tmp/cached_model.py"
        result = scrub_error_payload(raw)
        assert "/tmp/" not in result

    def test_scrubs_usr_paths(self):
        raw = "Binary at /usr/local/bin/python3"
        result = scrub_error_payload(raw)
        assert "/usr/" not in result


@pytest.mark.unit
@pytest.mark.agency
class TestErrorHandlerMapConstruction:
    def test_error_handler_map_built_at_init(self):
        """error_handler_map is built from error_handler nodes at construction."""
        from app.services.agency_orchestrator import AgencyOrchestrator

        nodes = [
            {"id": "agent-a", "node_type": "agent", "name": "Agent A", "is_entry_point": True},
            {"id": "agent-b", "node_type": "agent", "name": "Agent B"},
            {"id": "handler-1", "node_type": "error_handler", "name": "Handler", "node_config": {
                "watchedNodeIds": ["agent-a", "agent-b"],
                "onError": "skip",
            }},
        ]
        edges = [{"from_node_id": "agent-a", "to_node_id": "agent-b"}]
        orch = AgencyOrchestrator(nodes=nodes, edges=edges)

        assert "agent-a" in orch.error_handler_map
        assert "agent-b" in orch.error_handler_map
        assert orch.error_handler_map["agent-a"][0]["id"] == "handler-1"
        # handler-1 itself should NOT be in the map
        assert "handler-1" not in orch.error_handler_map

    @pytest.mark.asyncio
    async def test_error_interception_wraps_watched_node(self):
        """When a watched node fails, the error handler intercepts and returns skip message."""
        from unittest.mock import patch
        from app.services.agency_orchestrator import AgencyOrchestrator

        nodes = [
            {"id": "agent-a", "node_type": "agent", "name": "Agent A", "is_entry_point": True,
             "model": "test", "instructions": "test"},
            {"id": "handler-1", "node_type": "error_handler", "name": "Handler", "node_config": {
                "watchedNodeIds": ["agent-a"],
                "onError": "skip",
                "skipMessage": "Skipped due to test error",
            }},
        ]
        edges: list = []
        orch = AgencyOrchestrator(nodes=nodes, edges=edges)

        with patch.object(orch, "_execute_agent_node", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = RuntimeError("test failure")
            result = await orch.run("hello", "token", "tenant-1")
            assert "Skipped due to test error" in result
