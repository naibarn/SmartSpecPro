"""Tests for agency output validator -- JSON Schema validation + retry."""

import pytest

from app.services.agency_output_validator import AgencyOutputValidator, ValidationResult
from app.services.agency_run_context import AgencyRunContext


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyOutputValidator:
    """Tests for AgencyOutputValidator."""

    def test_valid_json_passes_schema(self):
        """Valid JSON matching schema returns is_valid=True with parsed data."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        result = validator.validate('{"score": 85}')

        assert result.is_valid is True
        assert result.parsed_data == {"score": 85}
        assert result.retry_feedback is None

    def test_invalid_type_triggers_retry(self):
        """Response with wrong type triggers retry feedback."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        result = validator.validate('{"score": "high"}')

        assert result.is_valid is False
        assert result.parsed_data is None
        assert result.retry_feedback is not None
        assert "score" in result.retry_feedback.lower() or "type" in result.retry_feedback.lower()

    def test_non_json_triggers_retry(self):
        """Non-JSON response triggers retry with JSON instruction."""
        schema = {"type": "object", "properties": {"score": {"type": "number"}}}
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        result = validator.validate("The score is 85")

        assert result.is_valid is False
        assert result.parsed_data is None
        assert "json" in result.retry_feedback.lower()

    @pytest.mark.asyncio
    async def test_valid_output_stored_in_context(self):
        """Validated output is stored in context under {agentName}_output."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }
        ctx = AgencyRunContext()
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        response, was_valid = await validator.validate_and_store('{"score": 85}', context=ctx)

        assert was_valid is True
        stored = await ctx.get("Scorer_output")
        assert stored == {"score": 85}

    def test_retry_limit_respected(self):
        """Validator itself validates once; retry loop is orchestrator's concern."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        # Two consecutive failures - validator always returns feedback
        r1 = validator.validate('{"score": "bad"}')
        r2 = validator.validate('{"score": "still bad"}')
        assert r1.is_valid is False
        assert r2.is_valid is False
        assert r1.retry_feedback is not None
        assert r2.retry_feedback is not None

    def test_no_schema_skips_validation(self):
        """When outputSchema is None, validation is a no-op."""
        validator = AgencyOutputValidator(output_schema=None, agent_name="Agent")
        result = validator.validate("Any text response is fine")

        assert result.is_valid is True
        assert result.parsed_data is None
        assert result.retry_feedback is None

    def test_empty_schema_skips_validation(self):
        """When outputSchema is empty dict {}, treated as no validation."""
        validator = AgencyOutputValidator(output_schema={}, agent_name="Agent")
        result = validator.validate("Any text response")

        assert result.is_valid is True
        assert result.parsed_data is None
        assert result.retry_feedback is None

    @pytest.mark.asyncio
    async def test_invalid_output_not_stored(self):
        """Invalid output is not stored in context."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }
        ctx = AgencyRunContext()
        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
        response, was_valid = await validator.validate_and_store("not json", context=ctx)

        assert was_valid is False
        stored = await ctx.get("Scorer_output")
        assert stored is None
