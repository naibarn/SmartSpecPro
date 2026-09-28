from __future__ import annotations
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class StageOutputEnvelope(StrictModel):
    stage: str
    schema_id: str = Field(alias="schemaId")
    payload: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    evidence_asset_ids: list[str] = Field(default_factory=list, alias="evidenceAssetIds")
    needs_human_review: bool = Field(default=False, alias="needsHumanReview")
    confidence: float = Field(default=1.0, ge=0, le=1)

class StageUsage(StrictModel):
    requests: int = Field(default=0, ge=0)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    def plus(self, other: "StageUsage") -> "StageUsage":
        return StageUsage(requests=self.requests+other.requests,input_tokens=self.input_tokens+other.input_tokens,
            output_tokens=self.output_tokens+other.output_tokens,total_tokens=self.total_tokens+other.total_tokens)

class AssetEvidence(StrictModel):
    asset_id: str
    authorized: bool
    media_type: str | None = None
    role: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)

class CostEstimate(StrictModel):
    provider_profile_id: str
    estimated_credits: float = Field(ge=0)
    currency_cost: float | None = Field(default=None, ge=0)
    currency: str | None = None

class GenerationAuthorization(StrictModel):
    approved: bool
    approval_id: str | None = None
    credit_reservation_id: str | None = None
    idempotency_key: str | None = None

class RunCheckpoint(StrictModel):
    project_id: str
    run_id: str
    workflow_version: str
    current_stage: str
    stage_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    approval_state: dict[str, str] = Field(default_factory=dict)
    repair_count_by_shot: dict[str, int] = Field(default_factory=dict)
    budget_state: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None
    session_id: str | None = None

class ExecutionPreflightResult(StrictModel):
    provider_profile_id: str
    adapter_id: str
    provider_plan_sha256: str
    cost_estimate: CostEstimate
    authorization: GenerationAuthorization
    ready_to_submit: bool
