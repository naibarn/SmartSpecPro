from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc.llm import LLMConfig, OpenAICompatibleClient, merge_llm_config  # noqa: E402


class _Response:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": "ok"}}]}


class LLMClientTests(unittest.TestCase):
    def _payload_for_style(self, style: str) -> dict:
        client = OpenAICompatibleClient(
            LLMConfig(
                base_url="https://gateway.example/v1",
                api_key="token",
                model="model-1",
                reasoning_effort="high",
                thinking_enabled=True,
                thinking_param_style=style,
            )
        )
        with patch("isc.llm.requests.post", return_value=_Response()) as post:
            client.chat([{"role": "user", "content": "hello"}])
        return post.call_args.kwargs["json"]

    def test_chat_sends_only_reasoning_param_for_responses_style_models(self) -> None:
        payload = self._payload_for_style("reasoning")

        self.assertEqual(payload["reasoning"], {"effort": "high"})
        self.assertNotIn("thinkingFlag", payload)
        self.assertNotIn("reasoning_effort", payload)

    def test_chat_sends_only_thinking_flag_for_messages_style_models(self) -> None:
        payload = self._payload_for_style("thinkingFlag")

        self.assertTrue(payload["thinkingFlag"])
        self.assertNotIn("reasoning", payload)
        self.assertNotIn("reasoning_effort", payload)

    def test_chat_sends_gemini_reasoning_effort_style(self) -> None:
        payload = self._payload_for_style("reasoning_effort")

        self.assertEqual(payload["reasoning_effort"], "high")
        self.assertTrue(payload["include_thoughts"])
        self.assertNotIn("reasoning", payload)
        self.assertNotIn("thinkingFlag", payload)

    def test_merge_llm_config_preserves_thinking_param_style(self) -> None:
        cfg = merge_llm_config(
            None,
            {
                "base_url": "https://gateway.example/v1",
                "api_key": "token",
                "model": "model-1",
                "thinking_enabled": True,
                "thinking_param_style": "messages",
            },
        )

        self.assertIsNotNone(cfg)
        self.assertEqual(cfg.thinking_param_style, "messages")


if __name__ == "__main__":
    unittest.main()
