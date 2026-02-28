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
        """The AsyncOpenAI client base_url is NODEJS_INTERNAL_URL/api/llm/v2."""
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
                base_url="http://test-gateway:3000/api/llm/v2",
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
        mock_response.raw_responses = [MagicMock()]
        mock_response.raw_responses[0].usage = MagicMock(total_tokens=150)
        mock_agency.get_response = AsyncMock(return_value=mock_response)

        result = await adapter.run(mock_agency, "Hello")

        assert isinstance(result, RunResult)
        assert result.response == "Hello from the agency"
        assert result.agent_name == "CEO"
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
