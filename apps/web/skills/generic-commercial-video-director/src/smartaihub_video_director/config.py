from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class AgentRuntimeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str | None = None
    require_explicit_model: Literal[True] = True
    max_turns_per_stage: int = Field(default=6, ge=1, le=20)
    max_contract_repair_attempts: int = Field(default=1, ge=0, le=3)
    max_input_chars_per_stage: int = Field(default=120_000, ge=1_000, le=1_000_000)
    max_total_tokens_per_stage: int | None = Field(default=80_000, ge=1_000)
    max_total_tokens_per_run: int | None = Field(default=500_000, ge=5_000)
    tracing_enabled: bool = True
    trace_include_sensitive_data: bool = False
    workflow_name: str = "SmartAIHub Generic Commercial Video Director"
    use_sessions: bool = False
    session_history_limit: int = Field(default=40, ge=1, le=500)
    allow_research_tool: bool = True
    allow_asset_evidence_tool: bool = True
    allow_provider_profile_tool: bool = True
    allow_cost_estimate_tool: bool = True
    expose_generation_submission_as_agent_tool: Literal[False] = False
    require_controller_for_paid_side_effects: Literal[True] = True

    @classmethod
    def from_skill_input(cls, data: dict, *, default_model: str | None = None) -> "AgentRuntimeConfig":
        raw = dict(data.get("agentRuntime") or {})
        mapping = {
            "maxTurnsPerStage":"max_turns_per_stage","maxContractRepairAttempts":"max_contract_repair_attempts",
            "maxInputCharsPerStage":"max_input_chars_per_stage","maxTotalTokensPerStage":"max_total_tokens_per_stage",
            "maxTotalTokensPerRun":"max_total_tokens_per_run","tracingEnabled":"tracing_enabled",
            "traceIncludeSensitiveData":"trace_include_sensitive_data","useSessions":"use_sessions",
            "sessionHistoryLimit":"session_history_limit","allowResearchTool":"allow_research_tool",
            "allowAssetEvidenceTool":"allow_asset_evidence_tool","allowProviderProfileTool":"allow_provider_profile_tool",
            "allowCostEstimateTool":"allow_cost_estimate_tool"
        }
        normalized={mapping.get(k,k):v for k,v in raw.items() if k!="enabled"}
        if not normalized.get("model") and default_model: normalized["model"]=default_model
        return cls(**normalized)
