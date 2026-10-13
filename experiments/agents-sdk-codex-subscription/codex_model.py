"""Experimental OpenAI Agents SDK Model backed by the official Codex SDK.

Model decisions use the user's existing Codex/ChatGPT login. The Codex turn is
read-only and has approvals denied; Python Agents SDK tools own workspace edits
and checks. This module never creates an API client or reads auth files.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from agents.agent_output import AgentOutputSchemaBase
from agents.handoffs import Handoff
from agents.items import ModelResponse, TResponseInputItem
from agents.models.interface import Model, ModelTracing
from agents.tool import FunctionTool, Tool
from agents.usage import Usage
from openai.types.responses import ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText

DISPATCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["call_tool", "final"]},
        "name": {"type": ["string", "null"]},
        "arguments_json": {"type": "string"},
        "text": {"type": ["string", "null"]},
    },
    "required": ["action", "name", "arguments_json", "text"],
    "additionalProperties": False,
}


class CodexSubscriptionModel(Model):
    """A deliberately narrow model adapter for Agents SDK `Runner.run()`.

    Codex sees only the current instruction and serialized Agents SDK inputs.
    It runs with no approvals and a read-only sandbox outside the app workspace.
    Tool calls are returned to Agents SDK, which executes its registered tools.
    """

    def __init__(
        self,
        *,
        codex_cwd: Path,
        role: str,
        on_receipt: Callable[[dict[str, Any]], None],
    ) -> None:
        self.codex_cwd = codex_cwd.resolve()
        self.role = role
        self.on_receipt = on_receipt

    async def get_response(
        self,
        system_instructions: str | None,
        input: str | list[TResponseInputItem],
        model_settings: Any,
        tools: list[Tool],
        output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: Any | None,
    ) -> ModelResponse:
        tool_contracts = self._tool_contracts(tools, handoffs)
        request = {
            "instructions": system_instructions or "",
            "input": self._jsonable(input),
            "tools": tool_contracts,
            "final_output_schema": (
                output_schema.json_schema() if output_schema is not None else None
            ),
        }
        instruction = (
            "You are the model for an OpenAI Agents SDK run. Follow the required structured output schema. "
            "For one available tool call, set action=call_tool, name to that tool, and arguments_json to a JSON-encoded "
            "arguments object. Otherwise set action=final, name=null, arguments_json to an empty string, and text to "
            "your answer. Do not claim that a tool ran; "
            "the Agents SDK will execute any returned function call. Use only the listed tools.\n"
            "Request JSON:\n" + json.dumps(request, ensure_ascii=False, separators=(",", ":"))
        )
        raw_text, receipt = await asyncio.to_thread(self._run_codex_turn, instruction, DISPATCH_SCHEMA)
        parsed = self._parse_dispatch(raw_text, tools, handoffs)
        receipt["agentAction"] = "tool_call" if isinstance(parsed, ResponseFunctionToolCall) else "final"
        if isinstance(parsed, ResponseFunctionToolCall):
            receipt["toolName"] = parsed.name
        self.on_receipt(receipt)
        usage = receipt["usage"] or {}
        last = usage.get("last") or {}
        return ModelResponse(
            output=[parsed],
            usage=Usage(
                requests=1,
                input_tokens=int(last.get("inputTokens", 0)),
                output_tokens=int(last.get("outputTokens", 0)),
                total_tokens=int(last.get("totalTokens", 0)),
            ),
            response_id=receipt["turnId"],
            request_id=receipt["turnId"],
        )

    async def stream_response(self, *args: Any, **kwargs: Any) -> AsyncIterator[Any]:
        raise NotImplementedError("This experimental adapter supports Runner.run(), not streaming.")
        yield  # pragma: no cover - preserves the AsyncIterator protocol

    @staticmethod
    def _jsonable(value: Any) -> Any:
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, dict):
            return {str(key): CodexSubscriptionModel._jsonable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [CodexSubscriptionModel._jsonable(item) for item in value]
        if hasattr(value, "model_dump"):
            return CodexSubscriptionModel._jsonable(value.model_dump(mode="json", by_alias=True, exclude_none=True))
        return str(value)

    @staticmethod
    def _tool_contracts(tools: list[Tool], handoffs: list[Handoff]) -> list[dict[str, Any]]:
        contracts = []
        for tool in tools:
            if not isinstance(tool, FunctionTool):
                raise TypeError(f"Unsupported Agents SDK tool type: {type(tool).__name__}")
            contracts.append(
                {
                    "kind": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.params_json_schema,
                }
            )
        for handoff in handoffs:
            contracts.append(
                {
                    "kind": "handoff",
                    "name": handoff.tool_name,
                    "description": handoff.tool_description,
                    "parameters": handoff.input_json_schema,
                }
            )
        return contracts

    @staticmethod
    def _parse_dispatch(raw_text: str, tools: list[Tool], handoffs: list[Handoff]) -> Any:
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(text)
        action = result.get("action")
        if action == "call_tool":
            name = result.get("name")
            allowed = {tool.name for tool in tools if isinstance(tool, FunctionTool)}
            allowed.update(handoff.tool_name for handoff in handoffs)
            if name not in allowed:
                raise ValueError("Codex requested an unregistered Agents SDK tool")
            arguments = json.loads(result.get("arguments_json") or "{}")
            if not isinstance(arguments, dict):
                raise ValueError("Codex tool arguments must be a JSON object")
            call_id = f"call_{uuid.uuid4().hex}"
            return ResponseFunctionToolCall(
                id=f"fc_{uuid.uuid4().hex}",
                call_id=call_id,
                type="function_call",
                name=name,
                arguments=json.dumps(arguments, ensure_ascii=False),
                status="completed",
            )
        if action != "final" or not isinstance(result.get("text"), str):
            raise ValueError("Codex response did not satisfy the Agents SDK dispatch contract")
        return ResponseOutputMessage(
            id=f"msg_{uuid.uuid4().hex}",
            type="message",
            role="assistant",
            status="completed",
            content=[ResponseOutputText(type="output_text", text=result["text"], annotations=[])],
        )

    def _run_codex_turn(
        self, instruction: str, output_schema: dict[str, Any]
    ) -> tuple[str, dict[str, Any]]:
        from openai_codex import ApprovalMode, Codex, CodexConfig, Sandbox

        with Codex(CodexConfig(cwd=str(self.codex_cwd))) as codex:
            thread = codex.thread_start(
                cwd=str(self.codex_cwd),
                approval_mode=ApprovalMode.deny_all,
                sandbox=Sandbox.read_only,
                ephemeral=True,
            )
            result = thread.run(
                instruction,
                cwd=str(self.codex_cwd),
                approval_mode=ApprovalMode.deny_all,
                sandbox=Sandbox.read_only,
                output_schema=output_schema,
            )
        status = getattr(result.status, "value", result.status)
        if status != "completed":
            raise RuntimeError(f"Codex subscription turn did not complete: {status}")
        usage = result.usage.model_dump(mode="json", by_alias=True) if result.usage else None
        receipt = {
            "role": self.role,
            "provider": "openai-codex-sdk",
            "authRoute": "existing ChatGPT/Codex login through Codex app-server",
            "threadId": thread.id,
            "turnId": result.id,
            "status": status,
            "durationMs": result.duration_ms,
            "itemCount": len(result.items),
            "usage": usage,
        }
        return result.final_response or "", receipt
