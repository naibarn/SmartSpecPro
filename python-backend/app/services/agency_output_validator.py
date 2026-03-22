"""Validate agent structured output against JSON Schema."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import jsonschema
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ValidationResult:
    """Result of schema validation attempt."""

    is_valid: bool
    parsed_data: dict[str, Any] | None = None
    retry_feedback: str | None = None


class AgencyOutputValidator:
    """Validates agent responses against an outputSchema.

    If validation fails, produces a feedback message for the agent
    to retry with corrected output.
    """

    def __init__(self, output_schema: dict[str, Any] | None, agent_name: str) -> None:
        """Store schema and agent name. If schema is None or empty, validation is a no-op."""
        self._schema = output_schema if output_schema else None
        self._agent_name = agent_name

    @property
    def has_schema(self) -> bool:
        """Whether a non-empty schema is configured."""
        return self._schema is not None and len(self._schema) > 0

    def validate(self, response_text: str) -> ValidationResult:
        """Parse response as JSON, validate against schema.

        Returns ValidationResult with is_valid, parsed_data, and retry_feedback.
        """
        if not self.has_schema:
            return ValidationResult(is_valid=True)

        # Step 1: Parse JSON
        try:
            parsed = json.loads(response_text)
        except (json.JSONDecodeError, TypeError) as e:
            logger.debug(
                "output_validation_json_parse_failed",
                agent=self._agent_name,
                error=str(e),
            )
            return ValidationResult(
                is_valid=False,
                retry_feedback=(
                    "Your response must be valid JSON matching the required schema. "
                    "Please respond with only the JSON object, no additional text."
                ),
            )

        # Step 2: Validate against schema
        try:
            jsonschema.validate(instance=parsed, schema=self._schema)
        except jsonschema.ValidationError as e:
            logger.debug(
                "output_validation_schema_failed",
                agent=self._agent_name,
                error=e.message,
            )
            return ValidationResult(
                is_valid=False,
                retry_feedback=(
                    f"Your JSON response did not match the required schema: {e.message}. "
                    "Please fix the response and return valid JSON."
                ),
            )

        logger.debug(
            "output_validation_passed",
            agent=self._agent_name,
        )
        return ValidationResult(is_valid=True, parsed_data=parsed)

    async def validate_and_store(
        self,
        response_text: str,
        context: Any,  # AgencyRunContext
    ) -> tuple[str, bool]:
        """Validate response and store in context if valid.

        Stores under key '{agent_name}_output' in AgencyRunContext.
        Returns (response_text, was_valid).
        """
        result = self.validate(response_text)

        if result.is_valid and result.parsed_data is not None:
            await context.set(f"{self._agent_name}_output", result.parsed_data)

        return response_text, result.is_valid
