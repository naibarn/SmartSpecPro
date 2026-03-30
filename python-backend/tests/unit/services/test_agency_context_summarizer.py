"""Tests for AgencyContextSummarizer — token estimation, condensation, and LLM integration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_context_summarizer import AgencyContextSummarizer


@pytest.mark.unit
class TestEstimateTokens:
    def setup_method(self):
        self.summarizer = AgencyContextSummarizer()

    def test_ascii_text(self):
        # "Hello world" = 11 chars ASCII => 11/4.0 = 2.75 + 4 overhead = ~6
        tokens = self.summarizer.estimate_tokens("Hello world")
        assert 5 <= tokens <= 8

    def test_thai_cjk_text(self):
        # "สวัสดีครับ" = 9 chars, all in Thai range => 9/1.5 = 6.0 + 4 overhead ≈ 10
        tokens = self.summarizer.estimate_tokens("สวัสดีครับ")
        assert 8 <= tokens <= 12

    def test_mixed_ascii_and_thai(self):
        text = "Hello สวัสดี World"
        tokens = self.summarizer.estimate_tokens(text)
        # "Hello " + " World" = 12 ASCII chars, "สวัสดี" = 6 Thai chars
        # ASCII: 12/4 = 3, Thai: 6/1.5 = 4, overhead = 4 => ~11
        assert 8 <= tokens <= 15

    def test_empty_string(self):
        tokens = self.summarizer.estimate_tokens("")
        # Just overhead
        assert tokens == 4

    def test_empty_returns_overhead(self):
        tokens = self.summarizer.estimate_tokens("")
        assert tokens >= 0


@pytest.mark.unit
class TestEstimateMessagesTokens:
    def setup_method(self):
        self.summarizer = AgencyContextSummarizer()

    def test_sums_across_messages(self):
        messages = [
            {"role": "user", "content": "Hello world"},
            {"role": "assistant", "content": "Hi there"},
        ]
        total = self.summarizer.estimate_messages_tokens(messages)
        # Each message gets estimate_tokens called
        assert total > 0

    def test_empty_list(self):
        assert self.summarizer.estimate_messages_tokens([]) == 0


@pytest.mark.unit
class TestShouldCondense:
    def setup_method(self):
        self.summarizer = AgencyContextSummarizer()

    def test_under_threshold_returns_false(self):
        # Messages with ~50 tokens, budget = 100000 => 0.05% => False
        messages = [{"role": "user", "content": "Hi"}]
        assert self.summarizer.should_condense(messages, 100000) is False

    def test_over_threshold_returns_true(self):
        # Create messages that total > 70% of budget
        budget = 100
        # Each char ≈ 0.25 tokens (ASCII), need >70 tokens => need ~280 chars
        big_msg = "x" * 400
        messages = [{"role": "user", "content": big_msg}]
        assert self.summarizer.should_condense(messages, budget) is True

    def test_zero_budget_returns_false(self):
        messages = [{"role": "user", "content": "Hello"}]
        assert self.summarizer.should_condense(messages, 0) is False

    def test_negative_budget_returns_false(self):
        messages = [{"role": "user", "content": "Hello"}]
        assert self.summarizer.should_condense(messages, -100) is False


@pytest.mark.unit
class TestCondense:
    def setup_method(self):
        self.summarizer = AgencyContextSummarizer()

    @pytest.mark.asyncio
    async def test_under_threshold_returns_unchanged(self):
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
        ]
        result = await self.summarizer.condense(messages, 200000)
        assert result == messages

    @pytest.mark.asyncio
    async def test_empty_messages_returns_unchanged(self):
        result = await self.summarizer.condense([], 100)
        assert result == []

    @pytest.mark.asyncio
    async def test_keeps_recent_turns_intact(self):
        # Build 20 messages
        messages = []
        for i in range(20):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": f"Message {i} " + "x" * 200})

        # Mock LLM for summarization
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary of prior conversation: key decisions made"
        mock_response.usage = MagicMock(total_tokens=50)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        self.summarizer._gateway_client = mock_client

        result = await self.summarizer.condense(messages, 100, model="test-model")
        # First message should be summary
        assert "Summary of prior conversation:" in result[0]["content"]
        # Last KEEP_RECENT_TURNS * 2 messages preserved
        keep = self.summarizer.KEEP_RECENT_TURNS * 2
        assert len(result) >= keep

    @pytest.mark.asyncio
    async def test_preserves_tool_call_pairs(self):
        """AI message with tool_calls and its tool response must stay together."""
        messages = [
            {"role": "user", "content": "do something " + "x" * 300},
            {
                "role": "assistant",
                "content": "Let me call a tool",
                "tool_calls": [{"id": "tc1", "type": "function", "function": {"name": "search", "arguments": "{}"}}],
            },
            {"role": "tool", "tool_call_id": "tc1", "content": "Tool result here " + "x" * 300},
            {"role": "assistant", "content": "Based on the result " + "x" * 300},
            {"role": "user", "content": "Thanks " + "x" * 200},
            {"role": "assistant", "content": "You're welcome " + "x" * 200},
            {"role": "user", "content": "Another question " + "x" * 200},
            {"role": "assistant", "content": "Here's the answer " + "x" * 200},
        ]

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary of prior conversation: tool was used"
        mock_response.usage = MagicMock(total_tokens=50)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        self.summarizer._gateway_client = mock_client

        result = await self.summarizer.condense(messages, 50, model="test-model")

        # Check no tool message is orphaned from its AI message
        for i, msg in enumerate(result):
            if msg.get("role") == "tool":
                # Previous message must be assistant with tool_calls
                assert i > 0
                assert result[i - 1].get("role") == "assistant"

    @pytest.mark.asyncio
    async def test_summary_message_format(self):
        messages = []
        for i in range(12):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": f"Message {i} " + "x" * 200})

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary of prior conversation: decisions were made"
        mock_response.usage = MagicMock(total_tokens=50)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        self.summarizer._gateway_client = mock_client

        result = await self.summarizer.condense(messages, 50, model="test-model")
        summary = result[0]
        assert summary["role"] == "user"
        assert summary["content"].startswith("Summary of prior conversation:")

    @pytest.mark.asyncio
    async def test_uses_llm_gateway(self):
        messages = []
        for i in range(12):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": f"Message {i} " + "x" * 200})

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary of prior conversation: stuff happened"
        mock_response.usage = MagicMock(total_tokens=50)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        self.summarizer._gateway_client = mock_client

        await self.summarizer.condense(messages, 50, model="test-model")
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs.kwargs["model"] == "test-model"
        assert call_kwargs.kwargs["temperature"] == 0.1
        assert call_kwargs.kwargs["max_tokens"] == 600

    @pytest.mark.asyncio
    async def test_llm_failure_fallback_to_truncation(self):
        messages = []
        for i in range(12):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": f"Message {i} " + "x" * 200})

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("LLM down"))
        self.summarizer._gateway_client = mock_client

        result = await self.summarizer.condense(messages, 50, model="test-model")
        # Should fallback: keep recent turns + truncation notice
        assert len(result) > 0
        assert result[0]["content"].startswith("[Prior conversation history truncated")
        keep = self.summarizer.KEEP_RECENT_TURNS * 2
        # Recent messages preserved
        assert len(result) <= keep + 1  # truncation msg + recent turns


@pytest.mark.unit
class TestSecretScrubbing:
    def setup_method(self):
        self.summarizer = AgencyContextSummarizer()

    @pytest.mark.asyncio
    async def test_tool_output_scrubbed_before_summarization(self):
        """Tool message contents must be scrubbed before sending to summarizer LLM."""
        # Build enough messages to trigger condensation (budget=50 tokens)
        messages = [
            {"role": "user", "content": "Check auth " + "x" * 500},
            {
                "role": "assistant",
                "content": "Calling tool " + "x" * 500,
                "tool_calls": [{"id": "tc1", "type": "function", "function": {"name": "check", "arguments": "{}"}}],
            },
            {"role": "tool", "tool_call_id": "tc1", "content": "API key: sk-abcdefghij0123456789abcdef " + "x" * 500},
            {"role": "assistant", "content": "Got the result " + "x" * 500},
            {"role": "user", "content": "Next step " + "x" * 500},
            {"role": "assistant", "content": "Done " + "x" * 500},
            {"role": "user", "content": "Another " + "x" * 500},
            {"role": "assistant", "content": "More " + "x" * 500},
            {"role": "user", "content": "Yet another " + "x" * 500},
            {"role": "assistant", "content": "Still going " + "x" * 500},
            {"role": "user", "content": "Final " + "x" * 500},
            {"role": "assistant", "content": "Complete " + "x" * 500},
        ]

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary of prior conversation: auth checked"
        mock_response.usage = MagicMock(total_tokens=50)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        self.summarizer._gateway_client = mock_client

        await self.summarizer.condense(messages, 50, model="test-model")

        # Check that the prompt sent to LLM does NOT contain the raw API key
        call_args = mock_client.chat.completions.create.call_args
        prompt_messages = call_args.kwargs["messages"]
        for msg in prompt_messages:
            assert "sk-abcdefghij" not in msg.get("content", "")
