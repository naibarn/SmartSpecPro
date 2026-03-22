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

v1.6-1.8 features supported:
- Built-in usage/cost tracking (v1.6) -- delegates to agency-swarm's extract_usage_from_run_result()
- Stream cancellation (v1.6) -- immediate and after_turn modes
- Shared resources (v1.7) -- shared_tools, shared_files_folder, shared_mcp_servers
- Conversation starters + quick replies (v1.7-1.8)
- Tool input schema in metadata (v1.8)
- PresentFiles builtin tool (v1.8)
- Agency graph API (v1.7) -- get_agency_graph() / get_metadata()
- Agent description (multi-agent SendMessage context)
- Structured output (output_type)
- File handling (files_folder, file_ids)
- Guardrails (input/output validation)
- Tool use behavior control
- Per-agent MCP servers
- Per-run additional_instructions + recipient_agent targeting
"""

import asyncio
import os
import time
import uuid
from typing import Any, Callable

import structlog
from pydantic import BaseModel, Field

# ── agency-swarm imports (ONLY in this file) ────────────────────────
from agency_swarm import Agent, Agency
from agency_swarm.tools.built_in.PresentFiles import PresentFiles
from agency_swarm.utils.usage_tracking import (
    UsageStats,
    extract_usage_from_run_result,
)
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
    description: str | None = None
    model_settings: dict[str, Any] | None = None
    tools: list[Any] = []
    is_entry_point: bool = False
    # v1.7-1.8: Conversation starters and quick replies
    conversation_starters: list[str] | None = None
    quick_replies: list[str] | None = None
    # Structured output: enforce a JSON schema on agent output
    output_type: Any | None = None
    # File handling: directory of files for the agent (auto-adds FileSearchTool)
    files_folder: str | None = None
    # Guardrails: input/output validation functions
    input_guardrails: list[Any] | None = None
    output_guardrails: list[Any] | None = None
    validation_attempts: int = 1
    # Tool use behavior: "run_llm_again" | "stop_on_first_tool" | StopAtTools | dict
    tool_use_behavior: Any | None = None
    # Per-agent MCP servers (separate from agency-level shared_mcp_servers)
    mcp_servers: list[Any] | None = None
    mcp_config: Any | None = None
    # Agent hooks for lifecycle callbacks
    hooks: Any | None = None
    # v1.8: Runtime settings
    parallel_tool_calls: bool | None = None
    max_turns: int | None = None
    # v1.9: Few-shot examples (list of conversation pairs)
    examples: list[list[dict[str, str]]] | None = None


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
    # v1.7: Shared resources applied to all agents
    shared_tools: list[Any] | None = None
    shared_files_folder: str | None = None
    shared_mcp_servers: list[Any] | None = None
    # v1.8: User-provided context seed data for the run
    user_context: dict[str, Any] | None = None
    # v1.9: Shared instructions prepended to all agents
    shared_instructions: str | None = None
    # v1.9: Conversation starters with optional caching
    conversation_starters: list[str] | None = None
    cache_conversation_starters: bool = False


class UsageBreakdown(BaseModel):
    """Per-model token usage from a single model response."""

    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class RunResult(BaseModel):
    """Result of a non-streaming agency run."""

    run_id: str
    response: str
    agent_name: str
    total_tokens: int = 0
    step_count: int = 0
    duration_ms: int = 0
    structured_result: dict[str, Any] | None = None
    preview_artifacts: list[dict[str, Any]] = Field(default_factory=list)
    # v1.6: Per-model usage breakdown (main agent + sub-agents)
    usage_breakdown: list[UsageBreakdown] = Field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0


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
        - name, description, and instructions from config
        - model routed through Node.js gateway
        - tools attached
        - conversation_starters and quick_replies (v1.7-1.8)
        - output_type for structured output enforcement
        - files_folder for document handling
        - guardrails for input/output validation
        - tool_use_behavior for controlling tool execution flow
        - per-agent mcp_servers for MCP integration
        """
        model = self._create_model(config.model, user_token)

        # v1.9: Prepend shared instructions from agency level
        from app.services.agency_few_shot import prepend_shared_instructions

        instructions = config.instructions
        if run_config and run_config.get("shared_instructions"):
            instructions = prepend_shared_instructions(
                instructions, run_config["shared_instructions"]
            )
        if run_config and run_config.get("persona_prefix"):
            # Sanitize: strip control chars, limit length, wrap in delimiter
            persona = str(run_config["persona_prefix"]).strip()[:2000]
            persona = "".join(ch for ch in persona if ch.isprintable() or ch in "\n\r\t")
            if persona:
                instructions = f"[PERSONA CONTEXT]\n{persona}\n[/PERSONA CONTEXT]\n\n{instructions}"

        agent_kwargs: dict[str, Any] = {
            "name": config.name,
            "instructions": instructions,
            "model": model,
            "tools": list(config.tools),
        }

        # Agent description -- used by SendMessage tool to describe this agent's role
        if config.description:
            agent_kwargs["description"] = config.description

        if config.model_settings:
            ms_kwargs = dict(config.model_settings)
            # Map reasoningEffort to reasoning dict for ModelSettings
            reasoning_effort = ms_kwargs.pop("reasoningEffort", None)
            if reasoning_effort:
                ms_kwargs["reasoning"] = {"effort": reasoning_effort}
            # Map parallel_tool_calls from AgentConfig into ModelSettings
            if config.parallel_tool_calls is not None:
                ms_kwargs["parallel_tool_calls"] = config.parallel_tool_calls
            agent_kwargs["model_settings"] = ModelSettings(**ms_kwargs)
        elif config.parallel_tool_calls is not None:
            agent_kwargs["model_settings"] = ModelSettings(
                parallel_tool_calls=config.parallel_tool_calls,
            )

        if config.max_turns is not None:
            agent_kwargs["max_turns"] = config.max_turns

        # v1.7-1.8: Conversation starters and quick replies
        if config.conversation_starters:
            agent_kwargs["conversation_starters"] = config.conversation_starters
        if config.quick_replies:
            agent_kwargs["quick_replies"] = config.quick_replies

        # Structured output: enforce a specific JSON schema on agent output
        if config.output_type is not None:
            agent_kwargs["output_type"] = config.output_type

        # File handling: directory of files for the agent
        if config.files_folder:
            agent_kwargs["files_folder"] = config.files_folder

        # Guardrails: input/output validation
        if config.input_guardrails:
            agent_kwargs["input_guardrails"] = config.input_guardrails
        if config.output_guardrails:
            agent_kwargs["output_guardrails"] = config.output_guardrails
        if config.validation_attempts != 1:
            agent_kwargs["validation_attempts"] = config.validation_attempts

        # Tool use behavior: control how agent handles tool calls
        if config.tool_use_behavior is not None:
            agent_kwargs["tool_use_behavior"] = config.tool_use_behavior

        # Per-agent MCP servers (separate from agency-level shared_mcp_servers)
        if config.mcp_servers:
            agent_kwargs["mcp_servers"] = config.mcp_servers
        if config.mcp_config is not None:
            agent_kwargs["mcp_config"] = config.mcp_config

        # Agent hooks for lifecycle callbacks
        if config.hooks is not None:
            agent_kwargs["hooks"] = config.hooks

        agent = Agent(**agent_kwargs)
        # Store entry-point metadata for create_agency to consume
        agent._is_entry_point = config.is_entry_point  # type: ignore[attr-defined]

        logger.info(
            "agency_agent_created",
            agent_name=config.name,
            model=config.model,
            tool_count=len(config.tools),
            is_entry_point=config.is_entry_point,
            has_description=bool(config.description),
            has_starters=bool(config.conversation_starters),
            has_quick_replies=bool(config.quick_replies),
            has_output_type=config.output_type is not None,
            has_files_folder=bool(config.files_folder),
            has_guardrails=bool(config.input_guardrails or config.output_guardrails),
            has_mcp=bool(config.mcp_servers),
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

        Supports v1.7 shared resources (shared_tools, shared_files_folder,
        shared_mcp_servers) applied to all agents in the agency.

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

        # v1.7: Shared resources
        if config.shared_tools:
            agency_kwargs["shared_tools"] = config.shared_tools
        if config.shared_files_folder:
            agency_kwargs["shared_files_folder"] = config.shared_files_folder
        if config.shared_mcp_servers:
            agency_kwargs["shared_mcp_servers"] = config.shared_mcp_servers

        agency = Agency(*entry_points, **agency_kwargs)

        logger.info(
            "agency_created",
            agency_id=config.agency_id,
            agency_name=config.name,
            tenant_id=config.tenant_id,
            agent_count=len(agents),
            flow_count=len(comm_flows),
            has_shared_tools=bool(config.shared_tools),
            has_shared_files=bool(config.shared_files_folder),
            has_shared_mcp=bool(config.shared_mcp_servers),
        )

        return agency

    @staticmethod
    def _extract_usage(response: Any) -> tuple[int, int, int, int, list[UsageBreakdown]]:
        """Extract comprehensive token usage from a RunResult or RunResultStreaming.

        Delegates to agency-swarm's extract_usage_from_run_result() which handles:
        - context_wrapper.usage (main agent)
        - _sub_agent_responses_with_model (sub-agents)
        - reasoning tokens, cached tokens

        Falls back to manual raw_responses extraction if the library function
        returns None (e.g. for partially-completed streams).

        Returns (total_tokens, prompt_tokens, completion_tokens, step_count, breakdown).
        """
        # Try agency-swarm's built-in extractor first (most accurate)
        usage_stats: UsageStats | None = extract_usage_from_run_result(response)
        if usage_stats is not None:
            # Build per-model breakdown from raw_responses + sub-agent responses
            breakdown = AgencySwarmAdapter._build_breakdown(response)
            step_count = len(getattr(response, "raw_responses", []))
            sub_responses = getattr(response, "_sub_agent_responses_with_model", [])
            step_count += len(sub_responses)
            return (
                usage_stats.total_tokens,
                usage_stats.input_tokens,
                usage_stats.output_tokens,
                step_count,
                breakdown,
            )

        # Fallback: manual extraction for objects without context_wrapper
        total_tokens = 0
        prompt_tokens = 0
        completion_tokens = 0
        step_count = 0
        breakdown: list[UsageBreakdown] = []

        if hasattr(response, "raw_responses"):
            step_count = len(response.raw_responses)
            main_model = getattr(response, "_main_agent_model", "")
            for raw in response.raw_responses:
                usage = getattr(raw, "usage", None)
                if usage:
                    pt = getattr(usage, "input_tokens", 0) or 0
                    ct = getattr(usage, "output_tokens", 0) or 0
                    tt = getattr(usage, "total_tokens", 0) or 0
                    total_tokens += tt
                    prompt_tokens += pt
                    completion_tokens += ct
                    breakdown.append(UsageBreakdown(
                        model=main_model,
                        prompt_tokens=pt,
                        completion_tokens=ct,
                        total_tokens=tt,
                    ))

        sub_responses = getattr(response, "_sub_agent_responses_with_model", [])
        for model_name, raw in sub_responses:
            usage = getattr(raw, "usage", None)
            if usage:
                pt = getattr(usage, "input_tokens", 0) or 0
                ct = getattr(usage, "output_tokens", 0) or 0
                tt = getattr(usage, "total_tokens", 0) or 0
                total_tokens += tt
                prompt_tokens += pt
                completion_tokens += ct
                step_count += 1
                breakdown.append(UsageBreakdown(
                    model=model_name or "",
                    prompt_tokens=pt,
                    completion_tokens=ct,
                    total_tokens=tt,
                ))

        return total_tokens, prompt_tokens, completion_tokens, step_count, breakdown

    @staticmethod
    def _build_breakdown(response: Any) -> list[UsageBreakdown]:
        """Build per-model UsageBreakdown list from a RunResult/RunResultStreaming."""
        breakdown: list[UsageBreakdown] = []
        main_model = getattr(response, "_main_agent_model", "")

        for raw in getattr(response, "raw_responses", []):
            usage = getattr(raw, "usage", None)
            if usage:
                breakdown.append(UsageBreakdown(
                    model=main_model,
                    prompt_tokens=getattr(usage, "input_tokens", 0) or 0,
                    completion_tokens=getattr(usage, "output_tokens", 0) or 0,
                    total_tokens=getattr(usage, "total_tokens", 0) or 0,
                ))

        for model_name, raw in getattr(response, "_sub_agent_responses_with_model", []):
            usage = getattr(raw, "usage", None)
            if usage:
                breakdown.append(UsageBreakdown(
                    model=model_name or "",
                    prompt_tokens=getattr(usage, "input_tokens", 0) or 0,
                    completion_tokens=getattr(usage, "output_tokens", 0) or 0,
                    total_tokens=getattr(usage, "total_tokens", 0) or 0,
                ))

        return breakdown

    @staticmethod
    def extract_stream_usage(stream: Any) -> tuple[int, int, int, int, list[UsageBreakdown]]:
        """Extract usage from a completed StreamingRunResponse.

        Unlike _extract_usage() which works on RunResult directly, this method
        accesses stream.final_result to get the RunResultStreaming object which
        contains the actual raw_responses and usage data.

        Must be called AFTER stream iteration completes.
        """
        final_result = getattr(stream, "final_result", None)
        if final_result is not None:
            return AgencySwarmAdapter._extract_usage(final_result)

        # Stream not yet completed or no final result available
        logger.warning("agency_stream_usage_no_final_result")
        return 0, 0, 0, 0, []

    async def run(
        self,
        agency: Agency,
        message: str,
        timeout_seconds: int = 600,
        agency_id: str = "",
        tenant_id: str = "",
        recipient_agent: str | None = None,
        file_ids: list[str] | None = None,
        additional_instructions: str | None = None,
    ) -> RunResult:
        """Execute agency.get_response() with error handling, retry, and timeout.

        Transient errors (ConnectionError, HTTP 429/502/503/504) are retried
        up to MAX_RETRIES times with exponential backoff.
        Permanent errors (auth failure, validation) fail immediately.
        asyncio.TimeoutError from the timeout guard is treated as permanent
        (not retried) to prevent multiplying long timeouts.

        Args:
            agency: The Agency instance to run.
            message: User message to send.
            timeout_seconds: Maximum time for the run.
            agency_id: For logging.
            tenant_id: For logging.
            recipient_agent: Target a specific agent by name (default: entry point).
            file_ids: File IDs to include with the message.
            additional_instructions: Per-run instruction override appended to agent's instructions.

        Returns a RunResult with the final response and usage breakdown.
        """
        run_id = str(uuid.uuid4())
        start_time = time.monotonic()

        last_error: Exception | None = None

        # Build kwargs for get_response()
        get_response_kwargs: dict[str, Any] = {"message": message}
        if recipient_agent:
            get_response_kwargs["recipient_agent"] = recipient_agent
        if file_ids:
            get_response_kwargs["file_ids"] = file_ids
        if additional_instructions:
            get_response_kwargs["additional_instructions"] = additional_instructions

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
                    agency.get_response(**get_response_kwargs),
                    timeout=timeout_seconds,
                )

                elapsed_ms = int((time.monotonic() - start_time) * 1000)

                # Extract comprehensive token usage (main + sub-agents)
                total_tokens, pt, ct, step_count, breakdown = self._extract_usage(response)

                agent_name = ""
                if hasattr(response, "last_agent") and response.last_agent:
                    agent_name = response.last_agent.name

                result = RunResult(
                    run_id=run_id,
                    response=str(response.final_output),
                    agent_name=agent_name,
                    total_tokens=total_tokens,
                    prompt_tokens=pt,
                    completion_tokens=ct,
                    step_count=step_count,
                    duration_ms=elapsed_ms,
                    usage_breakdown=breakdown,
                )

                logger.info(
                    "agency_run_completed",
                    run_id=run_id,
                    agency_id=agency_id,
                    tenant_id=tenant_id,
                    agent_name=agent_name,
                    total_tokens=total_tokens,
                    prompt_tokens=pt,
                    completion_tokens=ct,
                    duration_ms=elapsed_ms,
                    attempts=attempt + 1,
                    usage_models=[b.model for b in breakdown],
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
        recipient_agent: str | None = None,
        file_ids: list[str] | None = None,
        additional_instructions: str | None = None,
    ):
        """Return a streaming response (synchronous -- do NOT await).

        Calls agency.get_response_stream() which returns a
        StreamingRunResponse. The caller iterates this to get SSE events.

        The returned stream supports v1.6 cancellation via stream.cancel().
        After iteration, call extract_stream_usage(stream) for token tracking.

        Args:
            agency: The Agency instance to stream from.
            message: User message to send.
            agency_id: For logging.
            tenant_id: For logging.
            recipient_agent: Target a specific agent by name (default: entry point).
            file_ids: File IDs to include with the message.
            additional_instructions: Per-run instruction override.
        """
        logger.info(
            "agency_run_stream_started",
            agency_id=agency_id,
            tenant_id=tenant_id,
        )
        stream_kwargs: dict[str, Any] = {"message": message}
        if recipient_agent:
            stream_kwargs["recipient_agent"] = recipient_agent
        if file_ids:
            stream_kwargs["file_ids"] = file_ids
        if additional_instructions:
            stream_kwargs["additional_instructions"] = additional_instructions

        return agency.get_response_stream(**stream_kwargs)

    @staticmethod
    def cancel_stream(stream: Any, mode: str = "immediate") -> None:
        """Cancel a running stream (v1.6).

        Args:
            stream: The StreamingRunResponse returned by run_stream().
            mode: "immediate" stops right away, "after_turn" waits for
                  the current agent turn to complete.
        """
        if hasattr(stream, "cancel"):
            stream.cancel(mode=mode)
            logger.info("agency_stream_cancelled", mode=mode)
        else:
            logger.warning("agency_stream_cancel_not_supported")

    def get_agency_graph(self, agency: Agency, include_tools: bool = True) -> dict[str, Any]:
        """Return a ReactFlow-compatible JSON graph of the agency (v1.7).

        Output includes nodes (agents with tools, starters, capabilities)
        and edges (communication flows).
        """
        return agency.get_agency_graph(include_tools=include_tools)

    def get_agency_metadata(self, agency: Agency, include_tools: bool = True) -> dict[str, Any]:
        """Return combined graph + summary metadata (v1.7).

        Includes everything from get_agency_graph plus a metadata block
        with agencyName, totalAgents, totalTools, entryPoints, etc.
        """
        return agency.get_metadata(include_tools=include_tools)

    @staticmethod
    def get_present_files_tool() -> type:
        """Return the agency-swarm PresentFiles tool class (v1.8).

        This built-in tool moves files to the MNT preview directory and
        returns file metadata for display in the chat UI.

        Environment variables consumed by PresentFiles:
        - MNT_DIR: Mount directory (default: /app/mnt)
        - FILE_PREVIEW_MAX_BYTES: Max file size (default: 100MB)
        """
        return PresentFiles

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
