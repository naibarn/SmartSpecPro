"""Tests for agency_few_shot module and merge_tools_deduped."""

import pytest

from app.services.agency_few_shot import prepend_examples, prepend_shared_instructions
from app.services.agency_tools import merge_tools_deduped


class TestPrependExamples:
    def test_inserts_example_messages_with_system_framing(self):
        history = [{"role": "user", "content": "Hello"}]
        examples = [
            [
                {"role": "user", "content": "What is AI?"},
                {"role": "assistant", "content": "AI is artificial intelligence."},
            ],
            [
                {"role": "user", "content": "Tell me more"},
                {"role": "assistant", "content": "It involves machine learning."},
            ],
        ]

        result = prepend_examples(history, examples)

        assert result[0]["role"] == "system"
        assert "example interactions for reference only" in result[0]["content"]
        assert result[1] == {"role": "user", "content": "What is AI?"}
        assert result[2] == {"role": "assistant", "content": "AI is artificial intelligence."}
        assert result[3] == {"role": "user", "content": "Tell me more"}
        assert result[4] == {"role": "assistant", "content": "It involves machine learning."}
        assert result[5]["role"] == "system"
        assert "End of examples" in result[5]["content"]
        assert result[6] == {"role": "user", "content": "Hello"}

    def test_does_nothing_when_examples_is_none(self):
        history = [{"role": "user", "content": "Hello"}]
        result = prepend_examples(history, None)
        assert result == history

    def test_does_nothing_when_examples_is_empty(self):
        history = [{"role": "user", "content": "Hello"}]
        result = prepend_examples(history, [])
        assert result == history

    def test_does_not_mutate_original_history(self):
        history = [{"role": "user", "content": "Hello"}]
        original = list(history)
        examples = [[{"role": "user", "content": "Ex"}, {"role": "assistant", "content": "Re"}]]

        prepend_examples(history, examples)
        assert history == original


class TestPrependSharedInstructions:
    def test_prepends_shared_instructions_with_delimiters(self):
        result = prepend_shared_instructions(
            "You are a writer.",
            "Always be polite.",
        )
        assert result.startswith("[SHARED INSTRUCTIONS]")
        assert "Always be polite." in result
        assert "[/SHARED INSTRUCTIONS]" in result
        assert result.endswith("You are a writer.")

    def test_does_nothing_when_shared_instructions_is_none(self):
        result = prepend_shared_instructions("You are a writer.", None)
        assert result == "You are a writer."

    def test_does_nothing_when_shared_instructions_is_empty(self):
        result = prepend_shared_instructions("You are a writer.", "")
        assert result == "You are a writer."


class TestMergeToolsDeduped:
    def _make_tool(self, tool_id: str) -> type:
        cls = type(f"Tool_{tool_id}", (), {})
        cls._tool_id = tool_id  # type: ignore
        return cls

    def test_merges_shared_tools_with_agent_tools_deduplicating(self):
        agent_tools = [self._make_tool("tool-a"), self._make_tool("tool-b")]
        shared_tools = [self._make_tool("tool-b"), self._make_tool("tool-c"), self._make_tool("tool-d")]

        result = merge_tools_deduped(agent_tools, shared_tools)

        result_ids = [t._tool_id for t in result]
        assert result_ids == ["tool-a", "tool-b", "tool-c", "tool-d"]
        # tool-b from agent_tools takes priority (first occurrence)
        assert result[1] is agent_tools[1]

    def test_returns_only_agent_tools_when_no_shared_tools(self):
        agent_tools = [self._make_tool("tool-a"), self._make_tool("tool-b")]

        result = merge_tools_deduped(agent_tools, [])

        assert len(result) == 2
        result_ids = [t._tool_id for t in result]
        assert result_ids == ["tool-a", "tool-b"]
