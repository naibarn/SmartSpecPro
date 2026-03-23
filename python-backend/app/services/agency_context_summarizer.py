"""
Agency Context Summarizer — auto-condenses old conversation turns
when approaching the context budget threshold during agency execution.

Triggered at 70% of the model's context window, keeps the most recent N
turns uncompressed, summarizes older turns into a compact block, and
preserves tool-call/response pairs as atomic units.
"""

from __future__ import annotations

from typing import Any

import structlog

from app.services.agency_trace_collector import scrub_secrets

logger = structlog.get_logger(__name__)


class AgencyContextSummarizer:
    """Monitors token usage and auto-condenses old messages."""

    TRIGGER_THRESHOLD: float = 0.70
    KEEP_RECENT_TURNS: int = 4
    CHARS_PER_TOKEN_ASCII: float = 4.0
    CHARS_PER_TOKEN_CJK: float = 1.5

    def __init__(self, gateway_client: Any = None) -> None:
        self._gateway_client = gateway_client

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count using character-based heuristic.

        CJK/Thai chars use ~1.5 chars/token, ASCII uses ~4 chars/token.
        Adds 4 tokens per-message overhead.
        """
        if not text:
            return 4  # overhead only

        ascii_chars = 0
        cjk_chars = 0
        for ch in text:
            cp = ord(ch)
            if (
                0x0E00 <= cp <= 0x0E7F  # Thai
                or 0x3000 <= cp <= 0x9FFF  # CJK
                or 0xAC00 <= cp <= 0xD7FF  # Korean
            ):
                cjk_chars += 1
            else:
                ascii_chars += 1

        tokens = ascii_chars / self.CHARS_PER_TOKEN_ASCII + cjk_chars / self.CHARS_PER_TOKEN_CJK
        return int(tokens) + 4  # +4 overhead per message

    def estimate_messages_tokens(self, messages: list[dict]) -> int:
        """Sum token estimates across all messages."""
        total = 0
        for msg in messages:
            content = msg.get("content") or ""
            total += self.estimate_tokens(content)
        return total

    def should_condense(self, messages: list[dict], budget: int) -> bool:
        """Check if messages exceed TRIGGER_THRESHOLD of budget."""
        if budget <= 0:
            return False
        total = self.estimate_messages_tokens(messages)
        return total > budget * self.TRIGGER_THRESHOLD

    async def condense(
        self,
        messages: list[dict],
        budget: int,
        model: str | None = None,
    ) -> list[dict]:
        """Summarize old messages, keep recent turns. Returns new message list."""
        if not messages:
            return messages

        if budget <= 0:
            return messages

        if not self.should_condense(messages, budget):
            return messages

        # Split: keep last KEEP_RECENT_TURNS * 2 messages (user+assistant pairs)
        keep_count = self.KEEP_RECENT_TURNS * 2
        split_idx = max(0, len(messages) - keep_count)

        # Atomic pair rule: if split lands between AI+tool_calls and its ToolMessage,
        # move backward to keep the pair together
        split_idx = self._adjust_split_for_atomic_pairs(messages, split_idx)

        if split_idx <= 0:
            return messages  # Nothing to summarize

        old_messages = messages[:split_idx]
        recent_messages = messages[split_idx:]

        # Try LLM summarization
        summary_text = await self._summarize_via_llm(old_messages, model)

        if summary_text is not None:
            summary_msg = {
                "role": "user",
                "content": f"Summary of prior conversation: {summary_text}",
            }
            return [summary_msg] + recent_messages

        # Fallback: truncation
        truncation_msg = {
            "role": "user",
            "content": "[Prior conversation history truncated due to context limits]",
        }
        return [truncation_msg] + recent_messages

    def _adjust_split_for_atomic_pairs(self, messages: list[dict], split_idx: int) -> int:
        """Move split backward if it lands inside an AI tool_calls + tool response group."""
        if split_idx <= 0 or split_idx >= len(messages):
            return split_idx

        # If split lands on a tool response, back up past all consecutive tool messages
        # to reach the owning assistant message
        while split_idx > 0 and messages[split_idx].get("role") == "tool":
            split_idx -= 1

        # Now split_idx points at the assistant message that owns the tool_calls.
        # If it has tool_calls, include it in the old segment (keep its tool responses
        # together by also including them in the recent segment won't work — we need
        # to back up further to keep the WHOLE group in one segment).
        # Actually: the assistant+tools group should stay together in recent, so
        # we need to back up to BEFORE the assistant message.
        if split_idx > 0 and messages[split_idx].get("role") == "assistant" and messages[split_idx].get("tool_calls"):
            # The current message IS the assistant with tool_calls — keep it and its
            # tool responses in the recent segment by not moving further
            pass
        elif split_idx > 0:
            prev = messages[split_idx - 1]
            if prev.get("role") == "assistant" and prev.get("tool_calls"):
                # The message before split has tool_calls whose responses start at split_idx
                # Keep the entire group in recent by backing up past the assistant message
                split_idx -= 1

        return split_idx

    async def _summarize_via_llm(
        self, old_messages: list[dict], model: str | None
    ) -> str | None:
        """Summarize old messages via LLM. Returns None on failure."""
        if not self._gateway_client or not model:
            return None

        # Format messages for summarization, scrubbing tool output secrets
        formatted_parts = []
        for msg in old_messages:
            role = msg.get("role", "unknown")
            content = msg.get("content") or ""
            tool_calls = msg.get("tool_calls")

            if role == "tool":
                content = scrub_secrets(content) or ""
                formatted_parts.append(f"[{role}]: {content[:500]}")
            elif role == "assistant" and tool_calls:
                # Serialize tool call names for meaningful summary
                names = ", ".join(
                    tc.get("function", {}).get("name", "?") for tc in tool_calls
                )
                formatted_parts.append(f"[assistant calls tools: {names}]")
                if content:
                    formatted_parts.append(f"[assistant]: {content[:300]}")
            else:
                formatted_parts.append(f"[{role}]: {content[:500]}")

        formatted_text = "\n".join(formatted_parts)

        prompt_messages = [
            {
                "role": "system",
                "content": (
                    "Summarize the following conversation history concisely.\n"
                    "Preserve: key decisions, tool results, important facts, and user preferences.\n"
                    "Omit: greetings, repetitive clarifications, and verbose tool output details.\n"
                    "Format: A single paragraph, max 500 tokens."
                ),
            },
            {
                "role": "user",
                "content": formatted_text,
            },
        ]

        try:
            response = await self._gateway_client.chat.completions.create(
                model=model,
                messages=prompt_messages,
                temperature=0.1,
                max_tokens=600,
            )
            summary = response.choices[0].message.content or ""
            return summary.strip() if summary.strip() else None
        except Exception as e:
            logger.warning("context_summarization_failed", error=str(e)[:200])
            return None
