"""
Tests for AgencySwarmAdapter — version-isolated wrapper for agency-swarm v1.8.0.

All agency-swarm classes are mocked. No real LLM calls.
"""

import asyncio
import uuid

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from openai import AuthenticationError, RateLimitError

import app.services.agency_swarm_adapter as adapter_mod
from app.services.agency_swarm_adapter import (
    AgencySwarmAdapter,
    AgentConfig,
    AgencyConfig,
    RunResult,
    UsageBreakdown,
    MAX_RETRIES,
)


@pytest.mark.unit
@pytest.mark.agency
class TestCreateAgent:
    """Test AgencySwarmAdapter.create_agent()."""

    def test_create_agent_returns_agent_with_gateway_model(self, monkeypatch):
        """create_agent returns an Agent whose model is an OpenAIChatCompletionsModel."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel") as MockModel,
            patch.object(adapter_mod, "AsyncOpenAI") as MockClient,
        ):
            mock_agent_instance = MagicMock()
            MockAgent.return_value = mock_agent_instance

            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="TestAgent",
                instructions="You are a test agent.",
                model="gpt-4o",
            )
            result = adapter.create_agent(config, user_token="test-jwt-token")

            MockModel.assert_called_once()
            MockAgent.assert_called_once()
            assert result == mock_agent_instance

    def test_create_agent_model_base_url_matches_gateway(self, monkeypatch):
        """The AsyncOpenAI client base_url is NODEJS_INTERNAL_URL/v1."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent"),
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI") as MockClient,
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="TestAgent",
                instructions="Test",
                model="gpt-4o",
            )
            adapter.create_agent(config, user_token="my-jwt")

            MockClient.assert_called_once_with(
                api_key="my-jwt",
                base_url="http://test-gateway:3000/v1",
            )

    def test_create_agent_passes_instructions(self, monkeypatch):
        """Agent instructions are forwarded from the config."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write creative fiction.",
                model="gpt-4o",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["instructions"] == "Write creative fiction."

    def test_create_agent_passes_model_name(self, monkeypatch):
        """Agent model name matches the config's model field."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent"),
            patch.object(
                adapter_mod, "OpenAIChatCompletionsModel"
            ) as MockModel,
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Analyst",
                instructions="Analyze data.",
                model="claude-sonnet-4-20250514",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockModel.call_args[1]
            assert call_kwargs["model"] == "claude-sonnet-4-20250514"

    def test_create_agent_with_tools(self, monkeypatch):
        """Agent tools are forwarded from the config."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_tool = MagicMock()
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Coder",
                instructions="Write code.",
                model="gpt-4o",
                tools=[mock_tool],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert mock_tool in call_kwargs["tools"]

    def test_create_agent_with_model_settings(self, monkeypatch):
        """Agent model_settings are forwarded as ModelSettings."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
            patch.object(adapter_mod, "ModelSettings") as MockModelSettings,
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write.",
                model="gpt-4o",
                model_settings={"temperature": 0.7, "max_tokens": 1000},
            )
            adapter.create_agent(config, user_token="jwt")

            MockModelSettings.assert_called_once_with(
                temperature=0.7, max_tokens=1000
            )
            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["model_settings"] == MockModelSettings.return_value

    def test_create_agent_stores_entry_point_metadata(self, monkeypatch):
        """create_agent stores _is_entry_point on the returned Agent."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_agent = MagicMock()
            MockAgent.return_value = mock_agent

            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="CEO",
                instructions="Lead.",
                model="gpt-4o",
                is_entry_point=True,
            )
            result = adapter.create_agent(config, user_token="jwt")

            assert result._is_entry_point is True


@pytest.mark.unit
@pytest.mark.agency
class TestCreateAgency:
    """Test AgencySwarmAdapter.create_agency()."""

    def test_create_agency_with_communication_flows(self, monkeypatch):
        """create_agency creates an Agency with the correct communication flows."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()

            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True
            dev = MagicMock()
            dev.name = "Dev"
            dev._is_entry_point = False

            config = AgencyConfig(
                agency_id="agency-1",
                name="TestAgency",
                system_prompt="Work together",
                communication_flows=[("CEO", "Dev")],
                tenant_id="tenant-1",
                user_id=1,
                conversation_id="conv-1",
            )

            adapter.create_agency(config, agents=[ceo, dev])

            MockAgency.assert_called_once()
            call_args = MockAgency.call_args
            # Entry point is passed as positional arg
            assert ceo in call_args[0]
            # Communication flows are (Agent, Agent) tuples
            comm_flows = call_args[1].get("communication_flows", [])
            assert (ceo, dev) in comm_flows

    def test_create_agency_uses_is_entry_point_metadata(self, monkeypatch):
        """create_agency uses _is_entry_point to determine entry points."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()

            # Dev is first in list but NOT entry point
            dev = MagicMock()
            dev.name = "Dev"
            dev._is_entry_point = False

            # CEO is second but IS entry point
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True

            config = AgencyConfig(
                agency_id="agency-1",
                name="TestAgency",
                system_prompt="",
                communication_flows=[("CEO", "Dev")],
                tenant_id="tenant-1",
                user_id=1,
                conversation_id="conv-1",
            )

            adapter.create_agency(config, agents=[dev, ceo])

            call_args = MockAgency.call_args
            # CEO should be the entry point, not Dev
            assert ceo in call_args[0]
            assert dev not in call_args[0]

    def test_create_agency_persistence_hooks_configured(self, monkeypatch):
        """create_agency attaches persistence load/save callbacks."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = False

            mock_load = MagicMock()
            mock_save = MagicMock()

            config = AgencyConfig(
                agency_id="agency-1",
                name="Test",
                system_prompt="",
                communication_flows=[],
                tenant_id="tenant-1",
                user_id=1,
                conversation_id="conv-1",
            )

            adapter.create_agency(
                config,
                agents=[ceo],
                persistence_hooks=(mock_load, mock_save),
            )

            call_kwargs = MockAgency.call_args[1]
            assert call_kwargs["load_threads_callback"] == mock_load
            assert call_kwargs["save_threads_callback"] == mock_save

    def test_create_agency_user_context_includes_tenant_id(self, monkeypatch):
        """User context (tenant_id, user_id) is passed to Agency construction."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = False

            config = AgencyConfig(
                agency_id="agency-1",
                name="Test",
                system_prompt="Global prompt",
                communication_flows=[],
                tenant_id="tenant-abc",
                user_id=42,
                conversation_id="conv-1",
            )

            adapter.create_agency(config, agents=[ceo])

            call_kwargs = MockAgency.call_args[1]
            assert call_kwargs["shared_instructions"] is not None
            assert call_kwargs["user_context"]["tenant_id"] == "tenant-abc"
            assert call_kwargs["user_context"]["user_id"] == 42

    def test_create_agency_raises_on_invalid_flow(self, monkeypatch):
        """create_agency raises ValueError when a flow references an unknown agent."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency"):
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = False

            config = AgencyConfig(
                agency_id="agency-1",
                name="Test",
                system_prompt="",
                communication_flows=[("CEO", "NonExistent")],
                tenant_id="tenant-1",
                user_id=1,
                conversation_id="conv-1",
            )

            with pytest.raises(ValueError, match="unknown agent"):
                adapter.create_agency(config, agents=[ceo])


@pytest.mark.unit
@pytest.mark.agency
class TestRun:
    """Test AgencySwarmAdapter.run()."""

    async def test_run_executes_agency_and_returns_result(self):
        """run() calls agency.get_response() and returns a RunResult."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Hello from the agency"
        mock_response.last_agent.name = "CEO"
        mock_usage = MagicMock(total_tokens=150, input_tokens=100, output_tokens=50)
        mock_response.raw_responses = [MagicMock(usage=mock_usage)]
        mock_response._main_agent_model = "gpt-4o"
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            result = await adapter.run(mock_agency, "Hello")

        assert isinstance(result, RunResult)
        assert result.response == "Hello from the agency"
        assert result.agent_name == "CEO"
        assert result.total_tokens == 150
        mock_agency.get_response.assert_awaited_once()

    async def test_run_handles_transient_error_with_retry(self):
        """run() retries on transient errors (HTTP 429/503)."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Success after retry"
        mock_response.last_agent.name = "Agent"
        mock_response.raw_responses = []

        mock_agency.get_response = AsyncMock(
            side_effect=[ConnectionError("refused"), mock_response]
        )

        with patch.object(adapter_mod, "asyncio") as mock_asyncio:
            mock_asyncio.sleep = AsyncMock()
            mock_asyncio.wait_for = AsyncMock(
                side_effect=[ConnectionError("refused"), mock_response]
            )
            mock_asyncio.TimeoutError = asyncio.TimeoutError

            result = await adapter.run(mock_agency, "Hello")

        assert result.response == "Success after retry"

    async def test_run_handles_permanent_error_immediately(self):
        """run() fails fast on permanent errors (auth, validation)."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()

        auth_err = AuthenticationError(
            message="Invalid API key",
            response=MagicMock(status_code=401),
            body=None,
        )

        with patch.object(adapter_mod, "asyncio") as mock_asyncio:
            mock_asyncio.wait_for = AsyncMock(side_effect=auth_err)
            mock_asyncio.sleep = AsyncMock()
            mock_asyncio.TimeoutError = asyncio.TimeoutError

            with pytest.raises(AuthenticationError):
                await adapter.run(mock_agency, "Hello")

        # wait_for called only once (no retry)
        assert mock_asyncio.wait_for.await_count == 1

    async def test_run_exhausts_retries_on_persistent_transient_error(self):
        """run() gives up after MAX_RETRIES attempts on transient errors."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()

        with patch.object(adapter_mod, "asyncio") as mock_asyncio:
            mock_asyncio.wait_for = AsyncMock(
                side_effect=ConnectionError("always refused")
            )
            mock_asyncio.sleep = AsyncMock()
            mock_asyncio.TimeoutError = asyncio.TimeoutError

            with pytest.raises(ConnectionError):
                await adapter.run(mock_agency, "Hello")

        assert mock_asyncio.wait_for.await_count == MAX_RETRIES + 1

    async def test_run_timeout_is_not_retried(self):
        """asyncio.TimeoutError from wait_for is treated as permanent."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()

        with patch.object(adapter_mod, "asyncio") as mock_asyncio:
            mock_asyncio.wait_for = AsyncMock(
                side_effect=asyncio.TimeoutError()
            )
            mock_asyncio.sleep = AsyncMock()
            mock_asyncio.TimeoutError = asyncio.TimeoutError

            with pytest.raises(asyncio.TimeoutError):
                await adapter.run(
                    mock_agency, "Hello", timeout_seconds=10
                )

        # wait_for called only once (no retry)
        assert mock_asyncio.wait_for.await_count == 1

    async def test_run_logs_agency_id_and_tenant_id(self):
        """run() includes agency_id and tenant_id in log events."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Agent"
        mock_response.raw_responses = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "logger") as mock_logger:
            await adapter.run(
                mock_agency,
                "Hello",
                agency_id="agency-123",
                tenant_id="tenant-456",
            )

            # Check the completion log includes agency context
            mock_logger.info.assert_called()
            for call in mock_logger.info.call_args_list:
                if call[0][0] == "agency_run_completed":
                    assert call[1]["agency_id"] == "agency-123"
                    assert call[1]["tenant_id"] == "tenant-456"


@pytest.mark.unit
@pytest.mark.agency
class TestRunStream:
    """Test AgencySwarmAdapter.run_stream()."""

    def test_run_stream_returns_synchronously(self):
        """run_stream() returns a streaming response (NOT awaited)."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_stream = MagicMock()
        mock_agency.get_response_stream.return_value = mock_stream

        result = adapter.run_stream(mock_agency, "Hello")

        assert result == mock_stream
        mock_agency.get_response_stream.assert_called_once_with(message="Hello")

    def test_run_stream_is_not_coroutine(self):
        """run_stream() does not return a coroutine."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        result = adapter.run_stream(mock_agency, "Hello")

        assert not asyncio.iscoroutine(result)

    def test_run_stream_logs_context(self):
        """run_stream() includes agency_id and tenant_id in log."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        with patch.object(adapter_mod, "logger") as mock_logger:
            adapter.run_stream(
                mock_agency,
                "Hello",
                agency_id="agency-1",
                tenant_id="tenant-1",
            )

            mock_logger.info.assert_called_once_with(
                "agency_run_stream_started",
                agency_id="agency-1",
                tenant_id="tenant-1",
            )


@pytest.mark.unit
@pytest.mark.agency
class TestThreadSafety:
    """Test per-request isolation guarantees."""

    async def test_concurrent_create_agency_produces_isolated_instances(
        self, monkeypatch
    ):
        """10 concurrent create_agency calls produce independent Agency objects."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        agencies_created = []

        def mock_agency_init(*args, **kwargs):
            instance = MagicMock()
            instance._unique_id = uuid.uuid4().hex
            agencies_created.append(instance)
            return instance

        with patch.object(
            adapter_mod, "Agency", side_effect=mock_agency_init
        ):
            adapter = AgencySwarmAdapter()

            async def create_one(i: int):
                agent = MagicMock()
                agent.name = f"Agent-{i}"
                agent._is_entry_point = False
                config = AgencyConfig(
                    agency_id=f"agency-{i}",
                    name=f"Agency-{i}",
                    system_prompt=f"Prompt {i}",
                    communication_flows=[],
                    tenant_id=f"tenant-{i}",
                    user_id=i,
                    conversation_id=f"conv-{i}",
                )
                return adapter.create_agency(config, agents=[agent])

            results = await asyncio.gather(
                *[create_one(i) for i in range(10)]
            )

        # All 10 are distinct instances
        assert len(results) == 10
        unique_ids = {r._unique_id for r in results}
        assert len(unique_ids) == 10


@pytest.mark.unit
@pytest.mark.agency
class TestErrorClassification:
    """Test _is_transient_error classification."""

    def test_connection_error_is_transient(self):
        adapter = AgencySwarmAdapter()
        assert adapter._is_transient_error(ConnectionError("refused")) is True

    def test_rate_limit_error_is_transient(self):
        adapter = AgencySwarmAdapter()
        err = RateLimitError(
            message="Rate limit",
            response=MagicMock(status_code=429),
            body=None,
        )
        assert adapter._is_transient_error(err) is True

    def test_api_status_503_is_transient(self):
        from openai import APIStatusError

        adapter = AgencySwarmAdapter()
        err = APIStatusError(
            message="Service unavailable",
            response=MagicMock(status_code=503),
            body=None,
        )
        assert adapter._is_transient_error(err) is True

    def test_api_status_502_is_transient(self):
        from openai import APIStatusError

        adapter = AgencySwarmAdapter()
        err = APIStatusError(
            message="Bad gateway",
            response=MagicMock(status_code=502),
            body=None,
        )
        assert adapter._is_transient_error(err) is True

    def test_api_status_504_is_transient(self):
        from openai import APIStatusError

        adapter = AgencySwarmAdapter()
        err = APIStatusError(
            message="Gateway timeout",
            response=MagicMock(status_code=504),
            body=None,
        )
        assert adapter._is_transient_error(err) is True

    def test_auth_error_is_permanent(self):
        adapter = AgencySwarmAdapter()
        err = AuthenticationError(
            message="Unauthorized",
            response=MagicMock(status_code=401),
            body=None,
        )
        assert adapter._is_transient_error(err) is False

    def test_bad_request_is_permanent(self):
        from openai import BadRequestError

        adapter = AgencySwarmAdapter()
        err = BadRequestError(
            message="Bad request",
            response=MagicMock(status_code=400),
            body=None,
        )
        assert adapter._is_transient_error(err) is False

    def test_value_error_is_permanent(self):
        adapter = AgencySwarmAdapter()
        assert adapter._is_transient_error(ValueError("bad value")) is False

    def test_generic_exception_is_permanent(self):
        adapter = AgencySwarmAdapter()
        assert adapter._is_transient_error(RuntimeError("unknown")) is False

    def test_timeout_error_is_permanent(self):
        """TimeoutError is now treated as permanent (not retried)."""
        adapter = AgencySwarmAdapter()
        assert adapter._is_transient_error(TimeoutError("timeout")) is False


# ── v1.6-1.8 Feature Tests ────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.agency
class TestConversationStarters:
    """Test v1.7-1.8: conversation_starters and quick_replies support."""

    def test_create_agent_passes_conversation_starters(self, monkeypatch):
        """conversation_starters are forwarded to Agent constructor."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Helper",
                instructions="Help users.",
                model="gpt-4o",
                conversation_starters=["How can I help?", "What do you need?"],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["conversation_starters"] == [
                "How can I help?",
                "What do you need?",
            ]

    def test_create_agent_passes_quick_replies(self, monkeypatch):
        """quick_replies are forwarded to Agent constructor."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Helper",
                instructions="Help users.",
                model="gpt-4o",
                quick_replies=["Yes", "No", "Tell me more"],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["quick_replies"] == ["Yes", "No", "Tell me more"]

    def test_create_agent_omits_starters_when_none(self, monkeypatch):
        """conversation_starters is not passed when None."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Helper",
                instructions="Help users.",
                model="gpt-4o",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "conversation_starters" not in call_kwargs
            assert "quick_replies" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestSharedResources:
    """Test v1.7: shared_tools, shared_files_folder, shared_mcp_servers."""

    def test_create_agency_passes_shared_tools(self, monkeypatch):
        """shared_tools are forwarded to Agency constructor."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True

            mock_tool_cls = MagicMock()
            config = AgencyConfig(
                agency_id="a-1",
                name="Test",
                system_prompt="",
                communication_flows=[],
                tenant_id="t-1",
                user_id=1,
                conversation_id="c-1",
                shared_tools=[mock_tool_cls],
            )

            adapter.create_agency(config, agents=[ceo])

            call_kwargs = MockAgency.call_args[1]
            assert call_kwargs["shared_tools"] == [mock_tool_cls]

    def test_create_agency_passes_shared_files_folder(self, monkeypatch):
        """shared_files_folder is forwarded to Agency constructor."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True

            config = AgencyConfig(
                agency_id="a-1",
                name="Test",
                system_prompt="",
                communication_flows=[],
                tenant_id="t-1",
                user_id=1,
                conversation_id="c-1",
                shared_files_folder="/tmp/shared_files",
            )

            adapter.create_agency(config, agents=[ceo])

            call_kwargs = MockAgency.call_args[1]
            assert call_kwargs["shared_files_folder"] == "/tmp/shared_files"

    def test_create_agency_passes_shared_mcp_servers(self, monkeypatch):
        """shared_mcp_servers are forwarded to Agency constructor."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True

            mock_mcp = MagicMock()
            config = AgencyConfig(
                agency_id="a-1",
                name="Test",
                system_prompt="",
                communication_flows=[],
                tenant_id="t-1",
                user_id=1,
                conversation_id="c-1",
                shared_mcp_servers=[mock_mcp],
            )

            adapter.create_agency(config, agents=[ceo])

            call_kwargs = MockAgency.call_args[1]
            assert call_kwargs["shared_mcp_servers"] == [mock_mcp]

    def test_create_agency_omits_shared_when_none(self, monkeypatch):
        """Shared resource kwargs are not passed when None."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with patch.object(adapter_mod, "Agency") as MockAgency:
            adapter = AgencySwarmAdapter()
            ceo = MagicMock()
            ceo.name = "CEO"
            ceo._is_entry_point = True

            config = AgencyConfig(
                agency_id="a-1",
                name="Test",
                system_prompt="",
                communication_flows=[],
                tenant_id="t-1",
                user_id=1,
                conversation_id="c-1",
            )

            adapter.create_agency(config, agents=[ceo])

            call_kwargs = MockAgency.call_args[1]
            assert "shared_tools" not in call_kwargs
            assert "shared_files_folder" not in call_kwargs
            assert "shared_mcp_servers" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestUsageTracking:
    """Test v1.6: per-model usage/cost tracking."""

    def test_extract_usage_from_main_agent(self):
        """_extract_usage extracts tokens from main agent raw_responses."""
        mock_response = MagicMock()
        mock_usage = MagicMock()
        mock_usage.input_tokens = 100
        mock_usage.output_tokens = 50
        mock_usage.total_tokens = 150

        mock_response.raw_responses = [MagicMock(usage=mock_usage)]
        mock_response._main_agent_model = "gpt-4o"
        mock_response._sub_agent_responses_with_model = []

        # Mock extract_usage_from_run_result to return None so fallback is used
        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter._extract_usage(mock_response)

        assert total == 150
        assert pt == 100
        assert ct == 50
        assert steps == 1
        assert len(breakdown) == 1
        assert breakdown[0].model == "gpt-4o"
        assert breakdown[0].total_tokens == 150

    def test_extract_usage_includes_sub_agents(self):
        """_extract_usage includes sub-agent token usage."""
        mock_response = MagicMock()
        mock_response.raw_responses = []
        mock_response._main_agent_model = "gpt-4o"

        sub_usage = MagicMock()
        sub_usage.input_tokens = 80
        sub_usage.output_tokens = 40
        sub_usage.total_tokens = 120

        sub_raw = MagicMock(usage=sub_usage)
        mock_response._sub_agent_responses_with_model = [("claude-sonnet", sub_raw)]

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter._extract_usage(mock_response)

        assert total == 120
        assert pt == 80
        assert ct == 40
        assert steps == 1
        assert len(breakdown) == 1
        assert breakdown[0].model == "claude-sonnet"

    def test_extract_usage_no_usage_data(self):
        """_extract_usage handles responses without usage data."""
        mock_response = MagicMock()
        mock_response.raw_responses = [MagicMock(usage=None)]
        mock_response._sub_agent_responses_with_model = []

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter._extract_usage(mock_response)

        assert total == 0
        assert steps == 1
        assert len(breakdown) == 0

    def test_extract_usage_uses_library_function(self):
        """_extract_usage delegates to extract_usage_from_run_result when available."""
        mock_response = MagicMock()
        mock_usage = MagicMock(input_tokens=300, output_tokens=200, total_tokens=500)
        mock_response.raw_responses = [MagicMock(usage=mock_usage)]
        mock_response._main_agent_model = "gpt-4o"
        mock_response._sub_agent_responses_with_model = []

        mock_stats = MagicMock()
        mock_stats.total_tokens = 500
        mock_stats.input_tokens = 300
        mock_stats.output_tokens = 200

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=mock_stats):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter._extract_usage(mock_response)

        assert total == 500
        assert pt == 300
        assert ct == 200
        # _build_breakdown is called when library function succeeds
        assert len(breakdown) == 1
        assert breakdown[0].model == "gpt-4o"
        assert breakdown[0].prompt_tokens == 300
        assert breakdown[0].completion_tokens == 200

    def test_extract_usage_combined_main_and_sub_agents(self):
        """_extract_usage sums tokens from both main agent and sub-agents."""
        mock_response = MagicMock()

        main_usage = MagicMock(input_tokens=100, output_tokens=50, total_tokens=150)
        mock_response.raw_responses = [MagicMock(usage=main_usage)]
        mock_response._main_agent_model = "gpt-4o"

        sub_usage = MagicMock(input_tokens=80, output_tokens=40, total_tokens=120)
        sub_raw = MagicMock(usage=sub_usage)
        mock_response._sub_agent_responses_with_model = [("claude-sonnet", sub_raw)]

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter._extract_usage(mock_response)

        assert total == 270  # 150 + 120
        assert pt == 180  # 100 + 80
        assert ct == 90  # 50 + 40
        assert steps == 2  # 1 main + 1 sub
        assert len(breakdown) == 2
        assert breakdown[0].model == "gpt-4o"
        assert breakdown[1].model == "claude-sonnet"

    async def test_run_returns_usage_breakdown(self):
        """run() includes usage_breakdown in RunResult."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Agent"

        mock_usage = MagicMock()
        mock_usage.input_tokens = 200
        mock_usage.output_tokens = 100
        mock_usage.total_tokens = 300
        mock_response.raw_responses = [MagicMock(usage=mock_usage)]
        mock_response._main_agent_model = "gpt-4o"
        mock_response._sub_agent_responses_with_model = []

        mock_agency.get_response = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            result = await adapter.run(mock_agency, "Hello")

        assert result.total_tokens == 300
        assert result.prompt_tokens == 200
        assert result.completion_tokens == 100
        assert len(result.usage_breakdown) == 1
        assert result.usage_breakdown[0].model == "gpt-4o"

    async def test_run_handles_no_last_agent(self):
        """run() returns empty agent_name when last_agent is None."""
        adapter = AgencySwarmAdapter()

        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent = None
        mock_response.raw_responses = []
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            result = await adapter.run(mock_agency, "Hello")

        assert result.agent_name == ""


@pytest.mark.unit
@pytest.mark.agency
class TestStreamCancellation:
    """Test v1.6: stream cancellation."""

    def test_cancel_stream_calls_cancel_method(self):
        """cancel_stream calls stream.cancel() with the specified mode."""
        mock_stream = MagicMock()
        mock_stream.cancel = MagicMock()

        AgencySwarmAdapter.cancel_stream(mock_stream, mode="after_turn")

        mock_stream.cancel.assert_called_once_with(mode="after_turn")

    def test_cancel_stream_immediate_mode(self):
        """cancel_stream defaults to 'immediate' mode."""
        mock_stream = MagicMock()
        mock_stream.cancel = MagicMock()

        AgencySwarmAdapter.cancel_stream(mock_stream)

        mock_stream.cancel.assert_called_once_with(mode="immediate")

    def test_cancel_stream_no_cancel_method(self):
        """cancel_stream handles streams without cancel() gracefully."""
        mock_stream = MagicMock(spec=[])  # No cancel method

        # Should not raise
        AgencySwarmAdapter.cancel_stream(mock_stream)


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyGraph:
    """Test v1.7: agency graph and metadata APIs."""

    def test_get_agency_graph_delegates_to_agency(self):
        """get_agency_graph calls agency.get_agency_graph()."""
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_agency_graph.return_value = {"nodes": [], "edges": []}

        result = adapter.get_agency_graph(mock_agency)

        mock_agency.get_agency_graph.assert_called_once_with(include_tools=True)
        assert result == {"nodes": [], "edges": []}

    def test_get_agency_metadata_delegates_to_agency(self):
        """get_agency_metadata calls agency.get_metadata()."""
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_metadata.return_value = {
            "nodes": [],
            "edges": [],
            "metadata": {"agencyName": "Test", "totalAgents": 2},
        }

        result = adapter.get_agency_metadata(mock_agency, include_tools=False)

        mock_agency.get_metadata.assert_called_once_with(include_tools=False)
        assert result["metadata"]["agencyName"] == "Test"

    def test_get_agency_graph_include_tools_false(self):
        """get_agency_graph passes include_tools parameter."""
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_agency_graph.return_value = {"nodes": [], "edges": []}

        adapter.get_agency_graph(mock_agency, include_tools=False)

        mock_agency.get_agency_graph.assert_called_once_with(include_tools=False)


@pytest.mark.unit
@pytest.mark.agency
class TestPresentFilesTool:
    """Test v1.8: PresentFiles builtin tool."""

    def test_get_present_files_tool_returns_class(self):
        """get_present_files_tool returns the PresentFiles class."""
        tool_cls = AgencySwarmAdapter.get_present_files_tool()
        assert tool_cls is not None
        assert tool_cls.__name__ == "PresentFiles"

    def test_present_files_tool_is_reusable(self):
        """Multiple calls return the same class."""
        cls1 = AgencySwarmAdapter.get_present_files_tool()
        cls2 = AgencySwarmAdapter.get_present_files_tool()
        assert cls1 is cls2


@pytest.mark.unit
@pytest.mark.agency
class TestNormalizeModelName:
    """Test model name normalization."""

    def test_strips_provider_prefix(self):
        assert AgencySwarmAdapter._normalize_model_name("openai/gpt-4o") == "gpt-4o"

    def test_leaves_plain_name_unchanged(self):
        assert AgencySwarmAdapter._normalize_model_name("gpt-4o") == "gpt-4o"

    def test_handles_multiple_slashes(self):
        assert AgencySwarmAdapter._normalize_model_name("provider/model/v2") == "model/v2"


# ── v1.8 Agent Constructor Feature Tests ──────────────────────────


@pytest.mark.unit
@pytest.mark.agency
class TestAgentDescription:
    """Test description param forwarded to Agent constructor."""

    def test_create_agent_passes_description(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write.",
                model="gpt-4o",
                description="A creative writing agent",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["description"] == "A creative writing agent"

    def test_create_agent_omits_description_when_none(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="Writer", instructions="Write.", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "description" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestRunConfigPersonaPrefix:
    """Test run_config persona_prefix prepends to instructions."""

    def test_create_agent_prepends_persona_prefix(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write articles.",
                model="gpt-4o",
            )
            adapter.create_agent(
                config,
                user_token="jwt",
                run_config={"persona_prefix": "You are a Thai copywriter."},
            )

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["instructions"].startswith("[PERSONA CONTEXT]")
            assert "You are a Thai copywriter." in call_kwargs["instructions"]
            assert "[/PERSONA CONTEXT]" in call_kwargs["instructions"]
            assert "Write articles." in call_kwargs["instructions"]

    def test_create_agent_no_persona_prefix_keeps_original(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write articles.",
                model="gpt-4o",
            )
            adapter.create_agent(config, user_token="jwt", run_config=None)

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["instructions"] == "Write articles."

    def test_create_agent_empty_persona_prefix_keeps_original(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Writer",
                instructions="Write articles.",
                model="gpt-4o",
            )
            adapter.create_agent(
                config,
                user_token="jwt",
                run_config={"persona_prefix": ""},
            )

            call_kwargs = MockAgent.call_args[1]
            # Empty string is falsy, so instructions should remain unchanged
            assert call_kwargs["instructions"] == "Write articles."


@pytest.mark.unit
@pytest.mark.agency
class TestOutputType:
    """Test output_type (structured output) param forwarded to Agent."""

    def test_create_agent_passes_output_type(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_schema = {"type": "object", "properties": {"result": {"type": "string"}}}
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Analyst",
                instructions="Analyze.",
                model="gpt-4o",
                output_type=mock_schema,
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["output_type"] == mock_schema

    def test_create_agent_omits_output_type_when_none(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="A", instructions=".", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "output_type" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestFilesFolder:
    """Test files_folder param forwarded to Agent."""

    def test_create_agent_passes_files_folder(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="Researcher",
                instructions="Research.",
                model="gpt-4o",
                files_folder="/tmp/agent_files",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["files_folder"] == "/tmp/agent_files"

    def test_create_agent_omits_files_folder_when_none(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="A", instructions=".", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "files_folder" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestGuardrails:
    """Test input_guardrails, output_guardrails, validation_attempts."""

    def test_create_agent_passes_input_guardrails(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_guardrail = MagicMock()
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                input_guardrails=[mock_guardrail],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["input_guardrails"] == [mock_guardrail]

    def test_create_agent_passes_output_guardrails(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_guardrail = MagicMock()
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                output_guardrails=[mock_guardrail],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["output_guardrails"] == [mock_guardrail]

    def test_create_agent_passes_validation_attempts(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                validation_attempts=3,
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["validation_attempts"] == 3

    def test_create_agent_omits_validation_attempts_when_default(self, monkeypatch):
        """validation_attempts=1 (default) is not passed to Agent."""
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="A", instructions=".", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "validation_attempts" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestToolUseBehavior:
    """Test tool_use_behavior param forwarded to Agent."""

    def test_create_agent_passes_tool_use_behavior(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                tool_use_behavior="stop_on_first_tool",
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["tool_use_behavior"] == "stop_on_first_tool"

    def test_create_agent_omits_tool_use_behavior_when_none(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="A", instructions=".", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "tool_use_behavior" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestPerAgentMCP:
    """Test per-agent mcp_servers and mcp_config."""

    def test_create_agent_passes_mcp_servers(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_server = MagicMock()
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                mcp_servers=[mock_server],
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["mcp_servers"] == [mock_server]

    def test_create_agent_passes_mcp_config(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_config = {"timeout": 30}
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                mcp_config=mock_config,
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["mcp_config"] == {"timeout": 30}

    def test_create_agent_omits_mcp_when_none(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            adapter = AgencySwarmAdapter()
            config = AgentConfig(name="A", instructions=".", model="gpt-4o")
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert "mcp_servers" not in call_kwargs
            assert "mcp_config" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestAgentHooks:
    """Test hooks param forwarded to Agent."""

    def test_create_agent_passes_hooks(self, monkeypatch):
        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")

        with (
            patch.object(adapter_mod, "Agent") as MockAgent,
            patch.object(adapter_mod, "OpenAIChatCompletionsModel"),
            patch.object(adapter_mod, "AsyncOpenAI"),
        ):
            mock_hooks = MagicMock()
            adapter = AgencySwarmAdapter()
            config = AgentConfig(
                name="A",
                instructions=".",
                model="gpt-4o",
                hooks=mock_hooks,
            )
            adapter.create_agent(config, user_token="jwt")

            call_kwargs = MockAgent.call_args[1]
            assert call_kwargs["hooks"] == mock_hooks


# ── Run/Stream with Extended Params ───────────────────────────────


@pytest.mark.unit
@pytest.mark.agency
class TestRunWithParams:
    """Test run() forwards recipient_agent, file_ids, additional_instructions."""

    async def test_run_passes_recipient_agent(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Dev"
        mock_response.raw_responses = []
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        await adapter.run(mock_agency, "Hello", recipient_agent="Dev")

        call_kwargs = mock_agency.get_response.call_args[1]
        assert call_kwargs["recipient_agent"] == "Dev"

    async def test_run_passes_file_ids(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Agent"
        mock_response.raw_responses = []
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        await adapter.run(mock_agency, "Analyze", file_ids=["file-1", "file-2"])

        call_kwargs = mock_agency.get_response.call_args[1]
        assert call_kwargs["file_ids"] == ["file-1", "file-2"]

    async def test_run_passes_additional_instructions(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Agent"
        mock_response.raw_responses = []
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        await adapter.run(mock_agency, "Hello", additional_instructions="Be brief")

        call_kwargs = mock_agency.get_response.call_args[1]
        assert call_kwargs["additional_instructions"] == "Be brief"

    async def test_run_omits_none_params(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_response = MagicMock()
        mock_response.final_output = "Done"
        mock_response.last_agent.name = "Agent"
        mock_response.raw_responses = []
        mock_response._sub_agent_responses_with_model = []
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        await adapter.run(mock_agency, "Hello")

        call_kwargs = mock_agency.get_response.call_args[1]
        assert "recipient_agent" not in call_kwargs
        assert "file_ids" not in call_kwargs
        assert "additional_instructions" not in call_kwargs


@pytest.mark.unit
@pytest.mark.agency
class TestStreamWithParams:
    """Test run_stream() forwards recipient_agent, file_ids, additional_instructions."""

    def test_run_stream_passes_recipient_agent(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        adapter.run_stream(mock_agency, "Hello", recipient_agent="Dev")

        call_kwargs = mock_agency.get_response_stream.call_args[1]
        assert call_kwargs["recipient_agent"] == "Dev"

    def test_run_stream_passes_file_ids(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        adapter.run_stream(mock_agency, "Analyze", file_ids=["f1"])

        call_kwargs = mock_agency.get_response_stream.call_args[1]
        assert call_kwargs["file_ids"] == ["f1"]

    def test_run_stream_passes_additional_instructions(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        adapter.run_stream(mock_agency, "Hello", additional_instructions="Be brief")

        call_kwargs = mock_agency.get_response_stream.call_args[1]
        assert call_kwargs["additional_instructions"] == "Be brief"

    def test_run_stream_omits_none_params(self):
        adapter = AgencySwarmAdapter()
        mock_agency = MagicMock()
        mock_agency.get_response_stream.return_value = MagicMock()

        adapter.run_stream(mock_agency, "Hello")

        call_kwargs = mock_agency.get_response_stream.call_args[1]
        assert call_kwargs == {"message": "Hello"}


@pytest.mark.unit
@pytest.mark.agency
class TestExtractStreamUsage:
    """Test extract_stream_usage accesses stream.final_result."""

    def test_extracts_usage_from_final_result(self):
        mock_stream = MagicMock()
        mock_final = MagicMock()
        mock_usage = MagicMock(input_tokens=200, output_tokens=100, total_tokens=300)
        mock_final.raw_responses = [MagicMock(usage=mock_usage)]
        mock_final._main_agent_model = "gpt-4o"
        mock_final._sub_agent_responses_with_model = []
        mock_stream.final_result = mock_final

        with patch.object(adapter_mod, "extract_usage_from_run_result", return_value=None):
            total, pt, ct, steps, breakdown = AgencySwarmAdapter.extract_stream_usage(mock_stream)

        assert total == 300
        assert pt == 200
        assert ct == 100
        assert steps == 1

    def test_returns_zeros_when_no_final_result(self):
        mock_stream = MagicMock(spec=[])  # No final_result attribute

        total, pt, ct, steps, breakdown = AgencySwarmAdapter.extract_stream_usage(mock_stream)

        assert total == 0
        assert pt == 0
        assert ct == 0
        assert steps == 0
        assert breakdown == []

    def test_returns_zeros_when_final_result_is_none(self):
        mock_stream = MagicMock()
        mock_stream.final_result = None

        total, pt, ct, steps, breakdown = AgencySwarmAdapter.extract_stream_usage(mock_stream)

        assert total == 0
        assert steps == 0


@pytest.mark.unit
@pytest.mark.agency
class TestCreateToolClass:
    """Test create_tool_class() dynamic BaseTool generation."""

    def test_creates_tool_class_with_correct_name(self):
        adapter = AgencySwarmAdapter()
        tool_cls = adapter.create_tool_class(
            tool_name="WebSearch",
            tool_description="Search the web",
            run_func=lambda self: "result",
        )

        assert tool_cls.__name__ == "SSPTool_WebSearch"

    def test_tool_class_has_correct_docstring(self):
        adapter = AgencySwarmAdapter()
        tool_cls = adapter.create_tool_class(
            tool_name="Calculator",
            tool_description="Perform calculations",
            run_func=lambda self: "42",
        )

        assert tool_cls.__doc__ == "Perform calculations"

    def test_tool_run_calls_run_func(self):
        adapter = AgencySwarmAdapter()
        captured = []

        def my_run(tool_instance):
            captured.append(tool_instance)
            return "executed"

        tool_cls = adapter.create_tool_class(
            tool_name="MyTool",
            tool_description="A tool",
            run_func=my_run,
        )

        instance = tool_cls()
        result = instance.run()

        assert result == "executed"
        assert len(captured) == 1
        assert captured[0] is instance

    def test_tool_has_query_field(self):
        adapter = AgencySwarmAdapter()
        tool_cls = adapter.create_tool_class(
            tool_name="QueryTool",
            tool_description="Tool with query",
            run_func=lambda self: self.query,
        )

        instance = tool_cls(query="test input")
        result = instance.run()

        assert result == "test input"

    def test_multiple_tool_classes_are_independent(self):
        adapter = AgencySwarmAdapter()

        cls_a = adapter.create_tool_class("A", "Tool A", lambda self: "a")
        cls_b = adapter.create_tool_class("B", "Tool B", lambda self: "b")

        assert cls_a.__name__ != cls_b.__name__
        assert cls_a.__doc__ != cls_b.__doc__
        assert cls_a().run() == "a"
        assert cls_b().run() == "b"
