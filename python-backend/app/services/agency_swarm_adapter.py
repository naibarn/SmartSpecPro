"""
AgencySwarmAdapter -- version-isolated interface to agency-swarm v1.8.0.

This module is the ONLY place in SmartSpecPro that imports from agency-swarm
(or the openai-agents-sdk). All other modules interact with agency-swarm
through this adapter.

Design principles:
1. Version isolation -- if agency-swarm upgrades, only this file changes
2. Gateway routing -- all LLM calls go through Node.js gateway for credit deduction
3. Per-request instantiation -- Agency objects are never reused across requests
4. Raw streaming -- StreamingRunResponse events are exposed directly (no re-wrapping)
"""

import asyncio
import os
import time
import uuid
from typing import Any, Callable

import structlog
from pydantic import BaseModel

# ── agency-swarm imports (ONLY in this file) ────────────────────────
from agency_swarm import Agent, Agency
from agents import ModelSettings
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from openai import (
    AsyncOpenAI,
    APIStatusError,
    AuthenticationError,
    RateLimitError,
)

logger = structlog.get_logger(__name__)

# Retry configuration for transient errors
MAX_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 1.0


# ── Data Types ──────────────────────────────────────────────────────


class AgentConfig(BaseModel):
    """Configuration for constructing a single agency-swarm Agent."""

    name: str
    instructions: str
    model: str
    model_settings: dict[str, Any] | None = None
    tools: list[Any] = []
    is_entry_point: bool = False


class AgencyConfig(BaseModel):
    """Configuration for constructing an agency-swarm Agency."""

    agency_id: str
    name: str
    system_prompt: str
    communication_flows: list[tuple[str, str]]
    tenant_id: str
    user_id: int
    conversation_id: str
    max_run_time_seconds: int = 600
    credit_multiplier: float = 1.0
    creator_fee_credits: int = 0
    platform_share_pct: int = 20
    creator_id: int | None = None


class RunResult(BaseModel):
    """Result of a non-streaming agency run."""

    run_id: str
    response: str
    agent_name: str
    total_tokens: int = 0
    step_count: int = 0
    duration_ms: int = 0


# ── Adapter ─────────────────────────────────────────────────────────


class AgencySwarmAdapter:
    """Version-isolated interface to agency-swarm v1.8.0."""

    @staticmethod
    def _normalize_model_name(model_name: str) -> str:
        """Strip provider prefixes (e.g. 'openai/gpt-5.2' → 'gpt-5.2').

        The SmartSpecPro LLM gateway resolves models by internal modelId
        (e.g. 'gpt-5.2'), not by provider-prefixed names. Some frontends
        store the prefixed form, so we strip it here.
        """
        if "/" in model_name:
            return model_name.split("/", 1)[1]
        return model_name

    def _create_model(
        self, model_name: str, user_token: str
    ) -> OpenAIChatCompletionsModel:
        """Create an OpenAIChatCompletionsModel pointing to the Node.js gateway.

        The AsyncOpenAI client uses:
        - base_url: NODEJS_INTERNAL_URL/v1 (OpenAI-compatible gateway endpoint)
        - api_key: user_token (JWT for credit attribution)

        The OpenAI SDK appends /chat/completions to base_url, so we point to
        /v1 to hit the registered route at /v1/chat/completions.
        """
        model_name = self._normalize_model_name(model_name)
        base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
        client = AsyncOpenAI(
            api_key=user_token,
            base_url=f"{base_url}/v1",
        )
        return OpenAIChatCompletionsModel(model=model_name, openai_client=client)

    def create_agent(
        self,
        config: AgentConfig,
        user_token: str,
        run_config: dict[str, Any] | None = None,
    ) -> Agent:
        """Construct an Agent with SmartSpecPro's gateway-routed LLM model.

        Returns an agency-swarm Agent instance with:
        - name and instructions from config (with optional persona_prefix prepended)
        - model routed through Node.js gateway
        - tools attached
        """
        model = self._create_model(config.model, user_token)

        instructions = config.instructions
        if run_config and run_config.get("persona_prefix"):
            instructions = f"{run_config['persona_prefix']}\n\n{instructions}"

        agent_kwargs: dict[str, Any] = {
            "name": config.name,
            "instructions": instructions,
            "model": model,
            "tools": list(config.tools),
        }

        if config.model_settings:
            agent_kwargs["model_settings"] = ModelSettings(
                **config.model_settings
            )

        agent = Agent(**agent_kwargs)
        # Store entry-point metadata for create_agency to consume
        agent._is_entry_point = config.is_entry_point  # type: ignore[attr-defined]

        logger.info(
            "agency_agent_created",
            agent_name=config.name,
            model=config.model,
            tool_count=len(config.tools),
            is_entry_point=config.is_entry_point,
        )

        return agent

    def create_agency(
        self,
        config: AgencyConfig,
        agents: list[Agent],
        persistence_hooks: tuple[Callable, Callable] | None = None,
    ) -> Agency:
        """Construct an Agency with persistence hooks and user context.

        Builds communication flows from config.communication_flows (list of
        (from_name, to_name) tuples) by mapping names to Agent instances.

        Agency objects are instantiated per-request -- never reused.
        """
        # Build name → Agent lookup
        agents_by_name: dict[str, Agent] = {a.name: a for a in agents}

        # Determine entry points from is_entry_point metadata, fallback to first agent
        entry_points: list[Agent] = [
            a for a in agents
            if getattr(a, "_is_entry_point", False)
        ]
        if not entry_points:
            entry_points = [agents[0]]

        # Build communication flows as (Agent, Agent) tuples
        comm_flows: list[tuple[Agent, Agent]] = []
        for from_name, to_name in config.communication_flows:
            from_agent = agents_by_name.get(from_name)
            to_agent = agents_by_name.get(to_name)
            if not from_agent or not to_agent:
                raise ValueError(
                    f"Communication flow references unknown agent: "
                    f"{from_name} -> {to_name}. "
                    f"Available: {list(agents_by_name.keys())}"
                )
            comm_flows.append((from_agent, to_agent))

        agency_kwargs: dict[str, Any] = {
            "name": config.name,
            "shared_instructions": config.system_prompt,
            "user_context": {
                "tenant_id": config.tenant_id,
                "user_id": config.user_id,
                "conversation_id": config.conversation_id,
                "agency_id": config.agency_id,
            },
        }

        if comm_flows:
            agency_kwargs["communication_flows"] = comm_flows

        if persistence_hooks:
            load_cb, save_cb = persistence_hooks
            agency_kwargs["load_threads_callback"] = load_cb
            agency_kwargs["save_threads_callback"] = save_cb

        agency = Agency(*entry_points, **agency_kwargs)

        logger.info(
            "agency_created",
            agency_id=config.agency_id,
            agency_name=config.name,
            tenant_id=config.tenant_id,
            agent_count=len(agents),
            flow_count=len(comm_flows),
        )

        return agency

    async def run(
        self,
        agency: Agency,
        message: str,
        timeout_seconds: int = 600,
        agency_id: str = "",
        tenant_id: str = "",
    ) -> RunResult:
        """Execute agency.get_response() with error handling, retry, and timeout.

        Transient errors (ConnectionError, HTTP 429/502/503/504) are retried
        up to MAX_RETRIES times with exponential backoff.
        Permanent errors (auth failure, validation) fail immediately.
        asyncio.TimeoutError from the timeout guard is treated as permanent
        (not retried) to prevent multiplying long timeouts.

        Returns a RunResult with the final response.
        """
        run_id = str(uuid.uuid4())
        start_time = time.monotonic()

        last_error: Exception | None = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                if attempt > 0:
                    delay = RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
                    logger.info(
                        "agency_run_retry",
                        run_id=run_id,
                        agency_id=agency_id,
                        attempt=attempt,
                        delay_seconds=delay,
                    )
                    await asyncio.sleep(delay)

                response = await asyncio.wait_for(
                    agency.get_response(message=message),
                    timeout=timeout_seconds,
                )

                elapsed_ms = int((time.monotonic() - start_time) * 1000)

                # Extract token counts from raw responses
                total_tokens = 0
                step_count = 0
                if hasattr(response, "raw_responses"):
                    step_count = len(response.raw_responses)
                    for raw in response.raw_responses:
                        if hasattr(raw, "usage") and raw.usage:
                            total_tokens += getattr(
                                raw.usage, "total_tokens", 0
                            )

                agent_name = ""
                if hasattr(response, "last_agent") and response.last_agent:
                    agent_name = response.last_agent.name

                result = RunResult(
                    run_id=run_id,
                    response=str(response.final_output),
                    agent_name=agent_name,
                    total_tokens=total_tokens,
                    step_count=step_count,
                    duration_ms=elapsed_ms,
                )

                logger.info(
                    "agency_run_completed",
                    run_id=run_id,
                    agency_id=agency_id,
                    tenant_id=tenant_id,
                    agent_name=agent_name,
                    total_tokens=total_tokens,
                    duration_ms=elapsed_ms,
                    attempts=attempt + 1,
                )

                return result

            except asyncio.TimeoutError:
                # Timeout from wait_for is permanent -- do not retry
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                logger.error(
                    "agency_run_timeout",
                    run_id=run_id,
                    agency_id=agency_id,
                    tenant_id=tenant_id,
                    timeout_seconds=timeout_seconds,
                    duration_ms=elapsed_ms,
                )
                raise

            except Exception as e:
                last_error = e

                if not self._is_transient_error(e) or attempt >= MAX_RETRIES:
                    logger.error(
                        "agency_run_failed",
                        run_id=run_id,
                        agency_id=agency_id,
                        tenant_id=tenant_id,
                        error_type=type(e).__name__,
                        is_transient=self._is_transient_error(e),
                        attempt=attempt + 1,
                        exc_info=True,
                    )
                    raise

                logger.warning(
                    "agency_run_transient_error",
                    run_id=run_id,
                    agency_id=agency_id,
                    error_type=type(e).__name__,
                    attempt=attempt + 1,
                )

        # Should not reach here, but just in case
        raise last_error  # type: ignore[misc]

    def run_stream(
        self,
        agency: Agency,
        message: str,
        agency_id: str = "",
        tenant_id: str = "",
    ):
        """Return a streaming response (synchronous -- do NOT await).

        Calls agency.get_response_stream() which returns a
        StreamingRunResponse. The caller iterates this to get SSE events.
        """
        logger.info(
            "agency_run_stream_started",
            agency_id=agency_id,
            tenant_id=tenant_id,
        )
        return agency.get_response_stream(message=message)

    def create_tool_class(
        self,
        tool_name: str,
        tool_description: str,
        run_func: Callable[..., str],
    ) -> type:
        """Create an agency-swarm BaseTool subclass.

        Wraps a run function into a BaseTool-conforming class that agency-swarm
        can accept as a tool for Agent construction.

        This keeps all agency-swarm imports isolated to this adapter.

        Args:
            tool_name: Name of the tool (used as class name).
            tool_description: Description for the agent.
            run_func: The function to call when the tool runs.
                      Receives the tool instance as argument.

        Returns:
            A BaseTool subclass (class, not instance).
        """
        from agency_swarm.tools import BaseTool
        from pydantic import Field as PydField

        captured_run = run_func

        class _ToolBridge(BaseTool):
            query: str = PydField(default="", description="Input for the tool")

            def run(self) -> str:
                return captured_run(self)

        _ToolBridge.__name__ = f"SSPTool_{tool_name}"
        _ToolBridge.__qualname__ = f"SSPTool_{tool_name}"
        _ToolBridge.__doc__ = tool_description

        return _ToolBridge

    def _is_transient_error(self, error: Exception) -> bool:
        """Classify whether an error is transient (retryable).

        Transient: ConnectionError, HTTP 429, HTTP 502/503/504
        Permanent: TimeoutError (from wait_for), AuthenticationError,
                   ValidationError, HTTP 400/401/403
        """
        if isinstance(error, ConnectionError):
            return True

        if isinstance(error, RateLimitError):
            return True

        if isinstance(error, APIStatusError):
            return error.status_code in (502, 503, 504)

        return False
