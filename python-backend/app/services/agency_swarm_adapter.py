"""Retired compatibility boundary for the former Agency Swarm runtime.

Agency execution was replaced by the OpenAI Agents Orchestra. This module is
kept only so historical data/migration helpers can import the old configuration
shapes without importing (or installing) the retired third-party package.
Every execution-capable method fails closed before a provider call.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field

MAX_RETRIES = 0
RETRY_BASE_DELAY_SECONDS = 0.0


class AgencySwarmRetiredError(RuntimeError):
    """Raised whenever a legacy Agency execution path is reached."""

    code = "agency_swarm_retired"

    def __init__(self) -> None:
        super().__init__(
            "Agency Swarm execution has been retired; use the OpenAI Agents Orchestra."
        )


class AgentConfig(BaseModel):
    """Persisted legacy agent configuration shape (not an SDK object)."""

    name: str
    instructions: str
    model: str
    description: str | None = None
    model_settings: dict[str, Any] | None = None
    tools: list[Any] = Field(default_factory=list)
    is_entry_point: bool = False
    conversation_starters: list[str] | None = None
    quick_replies: list[str] | None = None
    output_type: Any | None = None
    files_folder: str | None = None
    input_guardrails: list[Any] | None = None
    output_guardrails: list[Any] | None = None
    validation_attempts: int = 1
    tool_use_behavior: Any | None = None
    mcp_servers: list[Any] | None = None
    mcp_config: Any | None = None
    hooks: Any | None = None
    parallel_tool_calls: bool | None = None
    max_turns: int | None = None
    examples: list[list[dict[str, str]]] | None = None


class AgencyConfig(BaseModel):
    """Persisted legacy agency configuration shape (not an SDK object)."""

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
    shared_tools: list[Any] | None = None
    shared_files_folder: str | None = None
    shared_mcp_servers: list[Any] | None = None
    user_context: dict[str, Any] | None = None
    shared_instructions: str | None = None
    conversation_starters: list[str] | None = None
    cache_conversation_starters: bool = False


class UsageBreakdown(BaseModel):
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class RunResult(BaseModel):
    """Historical result shape retained for deserializing old records."""

    run_id: str
    response: str
    agent_name: str
    total_tokens: int = 0
    step_count: int = 0
    duration_ms: int = 0
    structured_result: dict[str, Any] | None = None
    preview_artifacts: list[dict[str, Any]] = Field(default_factory=list)
    step_attempt_snapshots: list[dict[str, Any]] = Field(default_factory=list)
    hybrid_summary: dict[str, Any] | None = None
    usage_breakdown: list[UsageBreakdown] = Field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0


class AgencySwarmAdapter:
    """Import-compatible, non-executable boundary for retired integrations."""

    @staticmethod
    def _normalize_model_name(model_name: str) -> str:
        return model_name.split("/", 1)[1] if "/" in model_name else model_name

    @staticmethod
    def _retired() -> None:
        raise AgencySwarmRetiredError()

    def create_agent(
        self,
        config: AgentConfig,
        user_token: str,
        run_config: dict[str, Any] | None = None,
    ) -> Any:
        self._retired()

    def create_agency(
        self,
        config: AgencyConfig,
        agents: list[Any],
        persistence_hooks: tuple[Callable[..., Any], Callable[..., Any]] | None = None,
    ) -> Any:
        self._retired()

    async def run(
        self,
        agency: Any,
        message: str,
        timeout_seconds: int = 600,
        agency_id: str = "",
        tenant_id: str = "",
        recipient_agent: str | None = None,
        file_ids: list[str] | None = None,
        additional_instructions: str | None = None,
    ) -> RunResult:
        self._retired()

    def run_stream(
        self,
        agency: Any,
        message: str,
        agency_id: str = "",
        tenant_id: str = "",
        recipient_agent: str | None = None,
        file_ids: list[str] | None = None,
        additional_instructions: str | None = None,
    ) -> Any:
        self._retired()

    @staticmethod
    def cancel_stream(stream: Any, mode: str = "immediate") -> None:
        # Cancellation is idempotent for callers cleaning up a legacy stream.
        return None

    @staticmethod
    def extract_stream_usage(stream: Any) -> tuple[int, int, int, int, list[UsageBreakdown]]:
        return 0, 0, 0, 0, []

    def get_agency_graph(self, agency: Any, include_tools: bool = True) -> dict[str, Any]:
        self._retired()

    def get_agency_metadata(self, agency: Any, include_tools: bool = True) -> dict[str, Any]:
        self._retired()

    @staticmethod
    def get_present_files_tool() -> type:
        raise AgencySwarmRetiredError()

    def create_tool_class(
        self,
        tool_name: str,
        tool_description: str,
        run_func: Callable[..., str],
    ) -> type:
        self._retired()
