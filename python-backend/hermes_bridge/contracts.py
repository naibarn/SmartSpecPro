from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .transport import validate_hermes_api_server_url


class HermesBridgeRuntimeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hermes_version: str = Field(min_length=1)
    profile_name: str = Field(min_length=1)
    llm_routing_mode: Literal["auto", "pinned_provider"] = "auto"
    preferred_provider_id: int | None = None
    preferred_provider_name: str | None = None
    api_server_enabled: bool = True
    api_server_base_url: str | None = None
    remote_endpoint_policy_exception_id: str | None = None
    terminal_backend: str = Field(min_length=1)
    gateway_platforms: list[str] = Field(default_factory=list)
    supports_delegated_http: bool = False
    supports_delegated_mcp: bool = False
    supports_bound_connector: bool = False
    supports_callbacks: bool = False
    host_platform: str = Field(min_length=1)
    host_execution_mode: str = Field(min_length=1)

    @field_validator("remote_endpoint_policy_exception_id")
    @classmethod
    def normalize_remote_endpoint_policy_exception_id(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("remote_endpoint_policy_exception_id cannot be blank")
        return normalized

    @field_validator("preferred_provider_name")
    @classmethod
    def normalize_preferred_provider_name(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("preferred_provider_name cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_api_server_contract(self) -> "HermesBridgeRuntimeMetadata":
        if self.api_server_enabled and not self.api_server_base_url:
            raise ValueError("api_server_base_url is required when api_server_enabled is true")
        if self.llm_routing_mode == "pinned_provider" and self.preferred_provider_id is None:
            raise ValueError("preferred_provider_id is required when llm_routing_mode is pinned_provider")
        if self.preferred_provider_id is not None and self.llm_routing_mode != "pinned_provider":
            raise ValueError("llm_routing_mode must be pinned_provider when preferred_provider_id is set")
        if self.preferred_provider_name is not None and self.preferred_provider_id is None:
            raise ValueError("preferred_provider_name requires preferred_provider_id")
        if self.api_server_base_url:
            self.api_server_base_url = validate_hermes_api_server_url(
                self.api_server_base_url,
                allow_remote=self.remote_endpoint_policy_exception_id is not None,
            )
        return self


class HermesBridgeRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runtime_type: str = "hermes_agent_gateway"
    worker_mode: str = "per_user"
    runtime_mode: str = "external_managed"
    external_reference: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    metadata: HermesBridgeRuntimeMetadata

    @model_validator(mode="after")
    def validate_bridge_identity(self) -> "HermesBridgeRegistration":
        if self.runtime_type != "hermes_agent_gateway":
            raise ValueError("runtime_type must be hermes_agent_gateway")
        if self.worker_mode != "per_user":
            raise ValueError("worker_mode must be per_user")
        if self.runtime_mode != "external_managed":
            raise ValueError("runtime_mode must be external_managed")
        if not self.external_reference.startswith("hermes://"):
            raise ValueError("external_reference must use hermes:// URI form")
        return self
