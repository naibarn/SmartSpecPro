"""Tests for dynamic instruction template resolution."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.agency_instruction_resolver import resolve_instructions
from app.services.agency_run_context import AgencyRunContext


@pytest.mark.unit
@pytest.mark.agency
class TestInstructionResolver:
    """Tests for resolve_instructions."""

    def test_agent_name_resolved(self):
        """'{agent_name}' replaced with actual agent name."""
        result = resolve_instructions(
            "You are {agent_name}",
            agent_name="ResearchBot",
        )
        assert result == "You are ResearchBot"

    def test_current_date_resolved(self):
        """{current_date} resolved to today's date."""
        result = resolve_instructions(
            "Today is {current_date}",
            agent_name="Agent",
        )
        today = datetime.now().strftime("%Y-%m-%d")
        assert result == f"Today is {today}"

    def test_current_time_resolved(self):
        """{current_time} resolved to current time HH:MM."""
        result = resolve_instructions(
            "Time: {current_time}",
            agent_name="Agent",
        )
        # Just check format - time may have changed
        parts = result.replace("Time: ", "").split(":")
        assert len(parts) == 2
        assert parts[0].isdigit() and parts[1].isdigit()

    def test_tool_names_resolved(self):
        """{tool_names} resolved to comma-separated tool list."""
        result = resolve_instructions(
            "Tools: {tool_names}",
            agent_name="Agent",
            tool_names=["search", "calculator", "browser"],
        )
        assert result == "Tools: search, calculator, browser"

    @pytest.mark.asyncio
    async def test_context_key_resolved(self):
        """{context.KEY} resolved from AgencyRunContext."""
        ctx = AgencyRunContext({"project": "Alpha"})
        result = resolve_instructions(
            "Working on {context.project}",
            agent_name="Agent",
            context=ctx,
        )
        assert result == "Working on Alpha"

    def test_user_key_resolved(self):
        """{user.KEY} resolved from user_context dict."""
        result = resolve_instructions(
            "Respond in {user.language}",
            agent_name="Agent",
            user_context={"language": "Thai"},
        )
        assert result == "Respond in Thai"

    def test_missing_variable_returns_literal(self):
        """Missing template variable left as literal {key}."""
        result = resolve_instructions(
            "Hello {unknown_var}",
            agent_name="Agent",
        )
        assert result == "Hello {unknown_var}"

    def test_nested_context_key_returns_literal(self):
        """{context.nested.key} treated as single key, not deep access."""
        ctx = AgencyRunContext({"nested": {"key": "value"}})
        result = resolve_instructions(
            "Value: {context.nested.key}",
            agent_name="Agent",
            context=ctx,
        )
        # "context.nested.key" is not a flat key, so it stays literal
        assert result == "Value: {context.nested.key}"

    @pytest.mark.asyncio
    async def test_multiple_variables_resolved(self):
        """Multiple variables in one instruction all resolved."""
        ctx = AgencyRunContext({"task": "analysis"})
        result = resolve_instructions(
            "I am {agent_name}. Date: {current_date}. Task: {context.task}",
            agent_name="Analyst",
            context=ctx,
        )
        today = datetime.now().strftime("%Y-%m-%d")
        assert result == f"I am Analyst. Date: {today}. Task: analysis"

    def test_empty_instructions_returns_empty(self):
        """Empty string input returns empty string."""
        result = resolve_instructions("", agent_name="Agent")
        assert result == ""

    def test_no_variables_returns_unchanged(self):
        """Instructions with no template variables returned as-is."""
        text = "You are a helpful assistant. Follow the rules."
        result = resolve_instructions(text, agent_name="Agent")
        assert result == text

    def test_tool_names_none_returns_empty_string(self):
        """{tool_names} with no tools resolves to empty string."""
        result = resolve_instructions(
            "Tools: {tool_names}",
            agent_name="Agent",
            tool_names=None,
        )
        assert result == "Tools: "
