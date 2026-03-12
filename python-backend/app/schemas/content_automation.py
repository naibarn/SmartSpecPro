"""Pydantic v2 request/response models for content automation tools.

These models mirror the Zod schemas in apps/web/shared/contentAutomation/types.ts
and are used by Python agents to construct typed payloads for the 4 internal tool endpoints.
"""
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

_ALLOWED_PLACEHOLDERS = {"date", "day_of_week"}
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# Minutes field patterns that indicate sub-hourly intervals (blocked)
_SUB_HOURLY_RE = re.compile(
    r"^(?:\*/\d+|\d+(?:,\d+)+|\d+-\d+)$"  # */N, n,m, or n-m
)


class AutoDraftRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=1000)
    user_id: int = Field(gt=0)
    tenant_id: str = Field(min_length=1)
    article_skill_slug: Optional[str] = Field(default=None, max_length=100)
    media_skill_slug: Optional[str] = Field(default=None, max_length=100)
    canvas_preset: Literal["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"] = "16:9"
    num_slides: Optional[int] = Field(default=None, ge=1, le=30)
    language: Optional[str] = Field(default=None, min_length=2, max_length=10)
    reference_image_urls: Optional[list[str]] = Field(default=None, max_length=5)
    source: Optional[str] = Field(default=None, max_length=200)
    trace_id: Optional[str] = Field(default=None, max_length=100)


class AutoDraftResponse(BaseModel):
    success: bool
    deck_id: Optional[int] = None
    slide_count: Optional[int] = None
    credits_used: Optional[float] = None
    warnings: Optional[list[str]] = None
    error: Optional[str] = None


class ModelSuggestRequest(BaseModel):
    purpose: Literal["image", "video", "audio", "text"]
    quality_preference: Literal["speed", "balanced", "quality"] = "balanced"


class FileParseRequest(BaseModel):
    file_url: str
    file_type: Optional[Literal["csv", "xlsx", "txt"]] = None
    topic_column: str = Field(default="topic", min_length=1, max_length=100)
    max_rows: int = Field(default=100, ge=1, le=100)


class ScheduleDraftRequest(BaseModel):
    topic_template: str = Field(min_length=3, max_length=1000)
    schedule_type: Literal["one_time", "recurring"]
    cron_expression: Optional[str] = None
    run_at: Optional[str] = None
    timezone: str = "UTC"
    user_id: int = Field(gt=0)
    tenant_id: str = Field(min_length=1)

    @field_validator("cron_expression")
    @classmethod
    def validate_cron_minimum_interval(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        parts = v.strip().split()
        if len(parts) != 5:
            raise ValueError("cron_expression must have exactly 5 fields")
        minute_field, hour_field = parts[0], parts[1]
        # Block wildcard minutes (every minute) or sub-hourly intervals
        if minute_field == "*" or _SUB_HOURLY_RE.match(minute_field):
            raise ValueError(
                "cron_expression must have a minimum interval of 1 hour. "
                "Use a fixed minute value (e.g. '0 * * * *')."
            )
        return v

    @field_validator("topic_template")
    @classmethod
    def validate_placeholders(cls, v: str) -> str:
        found = set(_PLACEHOLDER_RE.findall(v))
        unsupported = found - _ALLOWED_PLACEHOLDERS
        if unsupported:
            raise ValueError(
                f"Unsupported template placeholders: {unsupported}. "
                f"Allowed: {{{{date}}}}, {{{{day_of_week}}}}"
            )
        return v
