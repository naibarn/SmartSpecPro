diff --git a/python-backend/app/services/agency_swarm_adapter.py b/python-backend/app/services/agency_swarm_adapter.py
new file mode 100644
index 0000000..8a6b379
--- /dev/null
+++ b/python-backend/app/services/agency_swarm_adapter.py
@@ -0,0 +1,322 @@
+"""
+AgencySwarmAdapter -- version-isolated interface to agency-swarm v1.8.0.
+
+This module is the ONLY place in SmartSpecPro that imports from agency-swarm
+(or the openai-agents-sdk). All other modules interact with agency-swarm
+through this adapter.
+
+Design principles:
+1. Version isolation -- if agency-swarm upgrades, only this file changes
+2. Gateway routing -- all LLM calls go through Node.js gateway for credit deduction
+3. Per-request instantiation -- Agency objects are never reused across requests
+4. Raw streaming -- StreamingRunResponse events are exposed directly (no re-wrapping)
+"""
+
+import asyncio
+import os
+import time
+import uuid
+from typing import Any, Callable
+
+import structlog
+from pydantic import BaseModel
+
+# ── agency-swarm imports (ONLY in this file) ────────────────────────
+from agency_swarm import Agent, Agency
+from agents import ModelSettings
+from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
+from openai import (
+    AsyncOpenAI,
+    APIStatusError,
+    AuthenticationError,
+    BadRequestError,
+    PermissionDeniedError,
+    RateLimitError,
+)
+
+logger = structlog.get_logger(__name__)
+
+NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
+
+# Retry configuration for transient errors
+MAX_RETRIES = 3
+RETRY_BASE_DELAY_SECONDS = 1.0
+
+
+# ── Data Types ──────────────────────────────────────────────────────
+
+
+class AgentConfig(BaseModel):
+    """Configuration for constructing a single agency-swarm Agent."""
+
+    name: str
+    instructions: str
+    model: str
+    model_settings: dict[str, Any] | None = None
+    tools: list[Any] = []
+    is_entry_point: bool = False
+
+
+class AgencyConfig(BaseModel):
+    """Configuration for constructing an agency-swarm Agency."""
+
+    agency_id: str
+    name: str
+    system_prompt: str
+    communication_flows: list[tuple[str, str]]
+    tenant_id: str
+    user_id: int
+    conversation_id: str
+    max_run_time_seconds: int = 600
+
+
+class RunResult(BaseModel):
+    """Result of a non-streaming agency run."""
+
+    run_id: str
+    response: str
+    agent_name: str
+    total_tokens: int = 0
+    step_count: int = 0
+    duration_ms: int = 0
+
+
+# ── Adapter ─────────────────────────────────────────────────────────
+
+
+class AgencySwarmAdapter:
+    """Version-isolated interface to agency-swarm v1.8.0."""
+
+    def _create_model(
+        self, model_name: str, user_token: str
+    ) -> OpenAIChatCompletionsModel:
+        """Create an OpenAIChatCompletionsModel pointing to the Node.js gateway.
+
+        The AsyncOpenAI client uses:
+        - base_url: NODEJS_INTERNAL_URL/api/llm/v2 (gateway endpoint)
+        - api_key: user_token (JWT for credit attribution)
+        """
+        client = AsyncOpenAI(
+            api_key=user_token,
+            base_url=f"{NODEJS_INTERNAL_URL}/api/llm/v2",
+        )
+        return OpenAIChatCompletionsModel(model=model_name, openai_client=client)
+
+    def create_agent(self, config: AgentConfig, user_token: str) -> Agent:
+        """Construct an Agent with SmartSpecPro's gateway-routed LLM model.
+
+        Returns an agency-swarm Agent instance with:
+        - name and instructions from config
+        - model routed through Node.js gateway
+        - tools attached
+        """
+        model = self._create_model(config.model, user_token)
+
+        agent_kwargs: dict[str, Any] = {
+            "name": config.name,
+            "instructions": config.instructions,
+            "model": model,
+            "tools": list(config.tools),
+        }
+
+        if config.model_settings:
+            agent_kwargs["model_settings"] = ModelSettings(
+                **config.model_settings
+            )
+
+        logger.info(
+            "agency_agent_created",
+            agent_name=config.name,
+            model=config.model,
+            tool_count=len(config.tools),
+            is_entry_point=config.is_entry_point,
+        )
+
+        return Agent(**agent_kwargs)
+
+    def create_agency(
+        self,
+        config: AgencyConfig,
+        agents: list[Agent],
+        persistence_hooks: tuple[Callable, Callable] | None = None,
+    ) -> Agency:
+        """Construct an Agency with persistence hooks and user context.
+
+        Builds communication flows from config.communication_flows (list of
+        (from_name, to_name) tuples) by mapping names to Agent instances.
+
+        Agency objects are instantiated per-request -- never reused.
+        """
+        # Build name → Agent lookup
+        agents_by_name: dict[str, Agent] = {a.name: a for a in agents}
+
+        # Determine entry points (agents marked as entry point, or first agent)
+        entry_points: list[Agent] = []
+        for agent in agents:
+            # Convention: first agent in list is the entry point if none explicitly marked
+            if not entry_points:
+                entry_points.append(agent)
+                break
+
+        # Build communication flows as (Agent, Agent) tuples
+        comm_flows: list[tuple[Agent, Agent]] = []
+        for from_name, to_name in config.communication_flows:
+            from_agent = agents_by_name.get(from_name)
+            to_agent = agents_by_name.get(to_name)
+            if from_agent and to_agent:
+                comm_flows.append((from_agent, to_agent))
+            else:
+                logger.warning(
+                    "agency_flow_agent_not_found",
+                    agency_id=config.agency_id,
+                    from_name=from_name,
+                    to_name=to_name,
+                    available_agents=list(agents_by_name.keys()),
+                )
+
+        agency_kwargs: dict[str, Any] = {
+            "name": config.name,
+            "shared_instructions": config.system_prompt,
+            "user_context": {
+                "tenant_id": config.tenant_id,
+                "user_id": config.user_id,
+                "conversation_id": config.conversation_id,
+                "agency_id": config.agency_id,
+            },
+        }
+
+        if comm_flows:
+            agency_kwargs["communication_flows"] = comm_flows
+
+        if persistence_hooks:
+            load_cb, save_cb = persistence_hooks
+            agency_kwargs["load_threads_callback"] = load_cb
+            agency_kwargs["save_threads_callback"] = save_cb
+
+        agency = Agency(*entry_points, **agency_kwargs)
+
+        logger.info(
+            "agency_created",
+            agency_id=config.agency_id,
+            agency_name=config.name,
+            tenant_id=config.tenant_id,
+            agent_count=len(agents),
+            flow_count=len(comm_flows),
+        )
+
+        return agency
+
+    async def run(self, agency: Agency, message: str) -> RunResult:
+        """Execute agency.get_response() with error handling and retry.
+
+        Transient errors (TimeoutError, HTTP 429/503) are retried up to
+        MAX_RETRIES times with exponential backoff.
+        Permanent errors (auth failure, validation) fail immediately.
+
+        Returns a RunResult with the final response.
+        """
+        run_id = str(uuid.uuid4())
+        start_time = time.monotonic()
+
+        last_error: Exception | None = None
+
+        for attempt in range(MAX_RETRIES + 1):
+            try:
+                if attempt > 0:
+                    delay = RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
+                    logger.info(
+                        "agency_run_retry",
+                        run_id=run_id,
+                        attempt=attempt,
+                        delay_seconds=delay,
+                    )
+                    await asyncio.sleep(delay)
+
+                response = await agency.get_response(message=message)
+
+                elapsed_ms = int((time.monotonic() - start_time) * 1000)
+
+                # Extract token counts from raw responses
+                total_tokens = 0
+                step_count = 0
+                if hasattr(response, "raw_responses"):
+                    step_count = len(response.raw_responses)
+                    for raw in response.raw_responses:
+                        if hasattr(raw, "usage") and raw.usage:
+                            total_tokens += getattr(
+                                raw.usage, "total_tokens", 0
+                            )
+
+                agent_name = ""
+                if hasattr(response, "last_agent") and response.last_agent:
+                    agent_name = response.last_agent.name
+
+                result = RunResult(
+                    run_id=run_id,
+                    response=str(response.final_output),
+                    agent_name=agent_name,
+                    total_tokens=total_tokens,
+                    step_count=step_count,
+                    duration_ms=elapsed_ms,
+                )
+
+                logger.info(
+                    "agency_run_completed",
+                    run_id=run_id,
+                    agent_name=agent_name,
+                    total_tokens=total_tokens,
+                    duration_ms=elapsed_ms,
+                    attempts=attempt + 1,
+                )
+
+                return result
+
+            except Exception as e:
+                last_error = e
+
+                if not self._is_transient_error(e) or attempt >= MAX_RETRIES:
+                    logger.error(
+                        "agency_run_failed",
+                        run_id=run_id,
+                        error_type=type(e).__name__,
+                        is_transient=self._is_transient_error(e),
+                        attempt=attempt + 1,
+                        exc_info=True,
+                    )
+                    raise
+
+                logger.warning(
+                    "agency_run_transient_error",
+                    run_id=run_id,
+                    error_type=type(e).__name__,
+                    attempt=attempt + 1,
+                )
+
+        # Should not reach here, but just in case
+        raise last_error  # type: ignore[misc]
+
+    def run_stream(self, agency: Agency, message: str):
+        """Return a streaming response (synchronous -- do NOT await).
+
+        Calls agency.get_response_stream() which returns a
+        StreamingRunResponse. The caller iterates this to get SSE events.
+        """
+        logger.info("agency_run_stream_started")
+        return agency.get_response_stream(message=message)
+
+    def _is_transient_error(self, error: Exception) -> bool:
+        """Classify whether an error is transient (retryable).
+
+        Transient: TimeoutError, ConnectionError, HTTP 429, HTTP 503
+        Permanent: AuthenticationError, ValidationError, HTTP 401/403/400
+        """
+        if isinstance(error, (TimeoutError, ConnectionError)):
+            return True
+
+        if isinstance(error, RateLimitError):
+            return True
+
+        if isinstance(error, APIStatusError):
+            return error.status_code in (503, 502, 504)
+
+        return False
diff --git a/python-backend/tests/unit/test_agency_adapter.py b/python-backend/tests/unit/test_agency_adapter.py
new file mode 100644
index 0000000..f02eda8
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_adapter.py
@@ -0,0 +1,594 @@
+"""
+Tests for AgencySwarmAdapter — version-isolated wrapper for agency-swarm v1.8.0.
+
+All agency-swarm classes are mocked. No real LLM calls.
+"""
+
+import asyncio
+import uuid
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestCreateAgent:
+    """Test AgencySwarmAdapter.create_agent()."""
+
+    def test_create_agent_returns_agent_with_gateway_model(self, monkeypatch):
+        """create_agent returns an Agent whose model is an OpenAIChatCompletionsModel."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ) as MockAgent,
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ) as MockModel,
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ) as MockClient,
+        ):
+            mock_agent_instance = MagicMock()
+            MockAgent.return_value = mock_agent_instance
+
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="TestAgent",
+                instructions="You are a test agent.",
+                model="gpt-4o",
+            )
+            result = adapter.create_agent(config, user_token="test-jwt-token")
+
+            MockModel.assert_called_once()
+            MockAgent.assert_called_once()
+            assert result == mock_agent_instance
+
+    def test_create_agent_model_base_url_matches_gateway(self, monkeypatch):
+        """The AsyncOpenAI client base_url is NODEJS_INTERNAL_URL/api/llm/v2."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ) as MockAgent,
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ) as MockModel,
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ) as MockClient,
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="TestAgent",
+                instructions="Test",
+                model="gpt-4o",
+            )
+            adapter.create_agent(config, user_token="my-jwt")
+
+            MockClient.assert_called_once_with(
+                api_key="my-jwt",
+                base_url="http://test-gateway:3000/api/llm/v2",
+            )
+
+    def test_create_agent_passes_instructions(self, monkeypatch):
+        """Agent instructions are forwarded from the config."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ) as MockAgent,
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ),
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ),
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="Writer",
+                instructions="Write creative fiction.",
+                model="gpt-4o",
+            )
+            adapter.create_agent(config, user_token="jwt")
+
+            call_kwargs = MockAgent.call_args[1]
+            assert call_kwargs["instructions"] == "Write creative fiction."
+
+    def test_create_agent_passes_model_name(self, monkeypatch):
+        """Agent model name matches the config's model field."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ),
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ) as MockModel,
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ),
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="Analyst",
+                instructions="Analyze data.",
+                model="claude-sonnet-4-20250514",
+            )
+            adapter.create_agent(config, user_token="jwt")
+
+            call_kwargs = MockModel.call_args[1]
+            assert call_kwargs["model"] == "claude-sonnet-4-20250514"
+
+    def test_create_agent_with_tools(self, monkeypatch):
+        """Agent tools are forwarded from the config."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ) as MockAgent,
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ),
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ),
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            mock_tool = MagicMock()
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="Coder",
+                instructions="Write code.",
+                model="gpt-4o",
+                tools=[mock_tool],
+            )
+            adapter.create_agent(config, user_token="jwt")
+
+            call_kwargs = MockAgent.call_args[1]
+            assert mock_tool in call_kwargs["tools"]
+
+    def test_create_agent_with_model_settings(self, monkeypatch):
+        """Agent model_settings are forwarded as ModelSettings."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with (
+            patch(
+                "app.services.agency_swarm_adapter.Agent"
+            ) as MockAgent,
+            patch(
+                "app.services.agency_swarm_adapter.OpenAIChatCompletionsModel"
+            ),
+            patch(
+                "app.services.agency_swarm_adapter.AsyncOpenAI"
+            ),
+            patch(
+                "app.services.agency_swarm_adapter.ModelSettings"
+            ) as MockModelSettings,
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgentConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            config = AgentConfig(
+                name="Writer",
+                instructions="Write.",
+                model="gpt-4o",
+                model_settings={"temperature": 0.7, "max_tokens": 1000},
+            )
+            adapter.create_agent(config, user_token="jwt")
+
+            MockModelSettings.assert_called_once_with(temperature=0.7, max_tokens=1000)
+            call_kwargs = MockAgent.call_args[1]
+            assert call_kwargs["model_settings"] == MockModelSettings.return_value
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestCreateAgency:
+    """Test AgencySwarmAdapter.create_agency()."""
+
+    def test_create_agency_with_communication_flows(self, monkeypatch):
+        """create_agency creates an Agency with the correct communication flows."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with patch(
+            "app.services.agency_swarm_adapter.Agency"
+        ) as MockAgency:
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgencyConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+
+            ceo = MagicMock()
+            ceo.name = "CEO"
+            dev = MagicMock()
+            dev.name = "Dev"
+
+            agents_map = {"CEO": ceo, "Dev": dev}
+            config = AgencyConfig(
+                agency_id="agency-1",
+                name="TestAgency",
+                system_prompt="Work together",
+                communication_flows=[("CEO", "Dev")],
+                tenant_id="tenant-1",
+                user_id=1,
+                conversation_id="conv-1",
+            )
+
+            adapter.create_agency(config, agents=[ceo, dev])
+
+            MockAgency.assert_called_once()
+            call_args = MockAgency.call_args
+            # Entry point is passed as positional arg
+            assert ceo in call_args[0]
+            # Communication flows are (Agent, Agent) tuples
+            comm_flows = call_args[1].get("communication_flows", [])
+            assert (ceo, dev) in comm_flows
+
+    def test_create_agency_persistence_hooks_configured(self, monkeypatch):
+        """create_agency attaches persistence load/save callbacks."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with patch(
+            "app.services.agency_swarm_adapter.Agency"
+        ) as MockAgency:
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgencyConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            ceo = MagicMock()
+            ceo.name = "CEO"
+
+            mock_load = MagicMock()
+            mock_save = MagicMock()
+
+            config = AgencyConfig(
+                agency_id="agency-1",
+                name="Test",
+                system_prompt="",
+                communication_flows=[],
+                tenant_id="tenant-1",
+                user_id=1,
+                conversation_id="conv-1",
+            )
+
+            adapter.create_agency(
+                config,
+                agents=[ceo],
+                persistence_hooks=(mock_load, mock_save),
+            )
+
+            call_kwargs = MockAgency.call_args[1]
+            assert call_kwargs["load_threads_callback"] == mock_load
+            assert call_kwargs["save_threads_callback"] == mock_save
+
+    def test_create_agency_user_context_includes_tenant_id(self, monkeypatch):
+        """User context (tenant_id, user_id) is passed to Agency construction."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        with patch(
+            "app.services.agency_swarm_adapter.Agency"
+        ) as MockAgency:
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgencyConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+            ceo = MagicMock()
+            ceo.name = "CEO"
+
+            config = AgencyConfig(
+                agency_id="agency-1",
+                name="Test",
+                system_prompt="Global prompt",
+                communication_flows=[],
+                tenant_id="tenant-abc",
+                user_id=42,
+                conversation_id="conv-1",
+            )
+
+            adapter.create_agency(config, agents=[ceo])
+
+            call_kwargs = MockAgency.call_args[1]
+            assert call_kwargs["shared_instructions"] is not None
+            assert call_kwargs["user_context"] is not None
+            assert call_kwargs["user_context"]["tenant_id"] == "tenant-abc"
+            assert call_kwargs["user_context"]["user_id"] == 42
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestRun:
+    """Test AgencySwarmAdapter.run()."""
+
+    async def test_run_executes_agency_and_returns_result(self):
+        """run() calls agency.get_response() and returns a RunResult."""
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter, RunResult
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_response = MagicMock()
+        mock_response.final_output = "Hello from the agency"
+        mock_response.last_agent.name = "CEO"
+        mock_response.raw_responses = [MagicMock()]
+        mock_response.raw_responses[0].usage = MagicMock(
+            total_tokens=150
+        )
+        mock_agency.get_response = AsyncMock(return_value=mock_response)
+
+        result = await adapter.run(mock_agency, "Hello")
+
+        assert isinstance(result, RunResult)
+        assert result.response == "Hello from the agency"
+        assert result.agent_name == "CEO"
+        mock_agency.get_response.assert_awaited_once()
+
+    async def test_run_handles_transient_error_with_retry(self):
+        """run() retries on transient errors (timeout, HTTP 429/503)."""
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_response = MagicMock()
+        mock_response.final_output = "Success after retry"
+        mock_response.last_agent.name = "Agent"
+        mock_response.raw_responses = []
+
+        mock_agency.get_response = AsyncMock(
+            side_effect=[TimeoutError("timed out"), mock_response]
+        )
+
+        with patch("app.services.agency_swarm_adapter.asyncio.sleep", new_callable=AsyncMock):
+            result = await adapter.run(mock_agency, "Hello")
+
+        assert result.response == "Success after retry"
+        assert mock_agency.get_response.await_count == 2
+
+    async def test_run_handles_permanent_error_immediately(self):
+        """run() fails fast on permanent errors (auth, validation)."""
+        from openai import AuthenticationError
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_agency.get_response = AsyncMock(
+            side_effect=AuthenticationError(
+                message="Invalid API key",
+                response=MagicMock(status_code=401),
+                body=None,
+            )
+        )
+
+        with pytest.raises(AuthenticationError):
+            await adapter.run(mock_agency, "Hello")
+
+        # Should NOT retry
+        assert mock_agency.get_response.await_count == 1
+
+    async def test_run_exhausts_retries_on_persistent_transient_error(self):
+        """run() gives up after MAX_RETRIES attempts on transient errors."""
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter, MAX_RETRIES
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_agency.get_response = AsyncMock(
+            side_effect=TimeoutError("always times out")
+        )
+
+        with (
+            patch("app.services.agency_swarm_adapter.asyncio.sleep", new_callable=AsyncMock),
+            pytest.raises(TimeoutError),
+        ):
+            await adapter.run(mock_agency, "Hello")
+
+        assert mock_agency.get_response.await_count == MAX_RETRIES + 1
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestRunStream:
+    """Test AgencySwarmAdapter.run_stream()."""
+
+    def test_run_stream_returns_synchronously(self):
+        """run_stream() returns a streaming response (NOT awaited)."""
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_stream = MagicMock()
+        mock_agency.get_response_stream.return_value = mock_stream
+
+        result = adapter.run_stream(mock_agency, "Hello")
+
+        assert result == mock_stream
+        mock_agency.get_response_stream.assert_called_once_with(message="Hello")
+
+    def test_run_stream_is_not_coroutine(self):
+        """run_stream() does not return a coroutine."""
+        import asyncio
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+
+        mock_agency = MagicMock()
+        mock_agency.get_response_stream.return_value = MagicMock()
+
+        result = adapter.run_stream(mock_agency, "Hello")
+
+        assert not asyncio.iscoroutine(result)
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestThreadSafety:
+    """Test per-request isolation guarantees."""
+
+    async def test_concurrent_create_agency_produces_isolated_instances(
+        self, monkeypatch
+    ):
+        """10 concurrent create_agency calls produce independent Agency objects."""
+        monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")
+
+        agencies_created = []
+
+        def mock_agency_init(*args, **kwargs):
+            instance = MagicMock()
+            instance._unique_id = uuid.uuid4().hex
+            agencies_created.append(instance)
+            return instance
+
+        with patch(
+            "app.services.agency_swarm_adapter.Agency",
+            side_effect=mock_agency_init,
+        ):
+            from app.services.agency_swarm_adapter import (
+                AgencySwarmAdapter,
+                AgencyConfig,
+            )
+
+            adapter = AgencySwarmAdapter()
+
+            async def create_one(i: int):
+                agent = MagicMock()
+                agent.name = f"Agent-{i}"
+                config = AgencyConfig(
+                    agency_id=f"agency-{i}",
+                    name=f"Agency-{i}",
+                    system_prompt=f"Prompt {i}",
+                    communication_flows=[],
+                    tenant_id=f"tenant-{i}",
+                    user_id=i,
+                    conversation_id=f"conv-{i}",
+                )
+                return adapter.create_agency(config, agents=[agent])
+
+            results = await asyncio.gather(
+                *[create_one(i) for i in range(10)]
+            )
+
+        # All 10 are distinct instances
+        assert len(results) == 10
+        unique_ids = {r._unique_id for r in results}
+        assert len(unique_ids) == 10
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestErrorClassification:
+    """Test _is_transient_error classification."""
+
+    def test_timeout_error_is_transient(self):
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        assert adapter._is_transient_error(TimeoutError("timeout")) is True
+
+    def test_connection_error_is_transient(self):
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        assert adapter._is_transient_error(ConnectionError("refused")) is True
+
+    def test_rate_limit_error_is_transient(self):
+        from openai import RateLimitError
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        err = RateLimitError(
+            message="Rate limit",
+            response=MagicMock(status_code=429),
+            body=None,
+        )
+        assert adapter._is_transient_error(err) is True
+
+    def test_api_status_503_is_transient(self):
+        from openai import APIStatusError
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        err = APIStatusError(
+            message="Service unavailable",
+            response=MagicMock(status_code=503),
+            body=None,
+        )
+        assert adapter._is_transient_error(err) is True
+
+    def test_auth_error_is_permanent(self):
+        from openai import AuthenticationError
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        err = AuthenticationError(
+            message="Unauthorized",
+            response=MagicMock(status_code=401),
+            body=None,
+        )
+        assert adapter._is_transient_error(err) is False
+
+    def test_bad_request_is_permanent(self):
+        from openai import BadRequestError
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        err = BadRequestError(
+            message="Bad request",
+            response=MagicMock(status_code=400),
+            body=None,
+        )
+        assert adapter._is_transient_error(err) is False
+
+    def test_value_error_is_permanent(self):
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        assert adapter._is_transient_error(ValueError("bad value")) is False
+
+    def test_generic_exception_is_permanent(self):
+        from app.services.agency_swarm_adapter import AgencySwarmAdapter
+
+        adapter = AgencySwarmAdapter()
+        assert adapter._is_transient_error(RuntimeError("unknown")) is False
