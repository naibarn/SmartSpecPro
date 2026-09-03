from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Mapping

@dataclass(frozen=True)
class NormalizedJob:
    provider_job_id: str
    status: str
    progress: float | None = None
    output_assets: tuple[str, ...] = ()
    error_code: str | None = None
    error_message: str | None = None
    interaction_id: str | None = None
    cumulative_duration_seconds: float | None = None

class VideoProviderAdapter(ABC):
    adapter_id: str

    @abstractmethod
    def capability_profile(self) -> Mapping[str, Any]: ...

    @abstractmethod
    def validate_request(self, shot: Mapping[str, Any]) -> list[str]: ...

    def validate_sequence(self, sequence: Mapping[str, Any]) -> list[str]:
        return []

    def plan_temporal_segments(self, sequence: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError('Temporal planning is not implemented for this adapter')

    @abstractmethod
    def build_request(self, shot: Mapping[str, Any], assets: Mapping[str, Any]) -> Mapping[str, Any]: ...

    def build_extension_request(self, segment: Mapping[str, Any], previous_job: NormalizedJob, assets: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError('Extension is not implemented for this adapter')

    def build_continuation_request(self, segment: Mapping[str, Any], previous_asset: Mapping[str, Any], assets: Mapping[str, Any]) -> Mapping[str, Any]:
        """Build a new-segment continuation request for providers such as MiniMax H3.
        Unlike build_extension_request(), this does not imply provider-native append.
        """
        raise NotImplementedError('Reference continuation is not implemented for this adapter')

    @abstractmethod
    async def submit_job(self, request: Mapping[str, Any], *, idempotency_key: str) -> NormalizedJob: ...

    @abstractmethod
    async def get_job_status(self, provider_job_id: str) -> NormalizedJob: ...

    @abstractmethod
    async def cancel_job(self, provider_job_id: str) -> None: ...
