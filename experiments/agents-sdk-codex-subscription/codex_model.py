"""Experimental OpenAI Agents SDK Model backed by the official Codex SDK.

Model decisions use the user's existing Codex/ChatGPT login. The Codex turn is
read-only and has approvals denied; Python Agents SDK tools own workspace edits
and checks. This module never creates an API client or reads auth files.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import uuid
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from durable_store import DurableRunStore, canonical_json, digest

from agents.agent_output import AgentOutputSchemaBase
from agents.handoffs import Handoff
from agents.items import ModelResponse, TResponseInputItem
from agents.models.interface import Model, ModelTracing
from agents.tool import FunctionTool, Tool
from agents.usage import Usage
from openai.types.responses import Response, ResponseCompletedEvent, ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText
from openai.types.responses.response_usage import InputTokensDetails, OutputTokensDetails, ResponseUsage

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


def _maybe_crash(store: DurableRunStore, boundary: str, payload: dict[str, Any]) -> None:
    requested = {part.strip() for part in os.getenv("AUTONOMY_CRASH_AT", "").split(",") if part.strip()}
    if boundary not in requested:
        return
    consumed = store.state.setdefault("crashConsumed", [])
    if boundary in consumed or any(str(item).startswith(f"{boundary}:") for item in consumed):
        return
    consumed.append(boundary)
    store.event("fault.injected", {"boundary": boundary, **payload}, stable_key=f"fault:{boundary}")
    os.kill(os.getpid(), signal.SIGKILL)


def _select_thread_turn(turns: list[Any], turn_id: str | None, *, recover_latest: bool = False) -> Any | None:
    """Keep resume bound to the persisted turn, or recover only the newest unbound turn."""
    if turn_id is not None:
        return next((item for item in reversed(turns) if item.id == turn_id), None)
    return turns[-1] if recover_latest and turns else None


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
        store: DurableRunStore,
        phase_id: str,
    ) -> None:
        self.codex_cwd = codex_cwd.resolve()
        self.role = role
        self.on_receipt = on_receipt
        self.store = store
        self.phase_id = phase_id

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
            "the Agents SDK will execute any returned function call. Use only the listed tools. "
            "The tools in Request JSON are host-executed application functions. The Codex shell sandbox may be read-only, but that restriction does not apply to a listed host tool whose description explicitly grants a scoped write or patch. Use those host tools when implementation is requested; never write through the Codex shell. Do not try to invoke or discuss tools from this Codex session, "
            "including functions.exec, and never claim the listed application tools are unavailable. When an action is needed, return its JSON dispatch. "
            "Return only the structured JSON decision; do not add prose outside it.\n"
            "Request JSON:\n" + json.dumps(request, ensure_ascii=False, separators=(",", ":"))
        )
        request_hash = digest(instruction)
        call_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"model:{self.phase_id}:{self.role}:{request_hash}"))
        call = self.store.reserve_model_call(call_id, self.phase_id, self.role, {"instruction": instruction, "schema": DISPATCH_SCHEMA})
        if call["status"] == "completed" and call.get("response_text"):
            raw_text = call["response_text"]
            receipt = json.loads(call["receipt_json"] or "{}")
        else:
            raw_text, receipt = self._run_codex_turn(instruction, DISPATCH_SCHEMA, call_id, call)
            self.store.update_model_call(
                call_id, event="model.call.completed", stable_suffix="completed",
                status="completed", response_text=raw_text,
                usage_json=canonical_json(receipt.get("usage")), receipt_json=canonical_json(receipt),
            )
            _maybe_crash(self.store, "model.after_receipt", {"callId": call_id})
        parsed = self._parse_dispatch(raw_text, tools, handoffs, identity=call_id)
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

    async def stream_response(
        self, system_instructions: str | None, input: str | list[TResponseInputItem],
        model_settings: Any, tools: list[Tool], output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff], tracing: ModelTracing, *, previous_response_id: str | None,
        conversation_id: str | None, prompt: Any | None,
    ) -> AsyncIterator[Any]:
        result = await self.get_response(
            system_instructions, input, model_settings, tools, output_schema, handoffs,
            tracing, previous_response_id=previous_response_id, conversation_id=conversation_id,
            prompt=prompt,
        )
        usage = result.usage
        response = Response(
            id=result.response_id or result.request_id or "codex-subscription-response",
            created_at=int(__import__("time").time()), model="codex-subscription-sdk", object="response",
            output=result.output, status="completed", tool_choice="auto", tools=[],
            parallel_tool_calls=False, top_p=None,
            usage=ResponseUsage(
                input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
                total_tokens=usage.total_tokens,
                input_tokens_details=InputTokensDetails(cache_write_tokens=0, cached_tokens=0),
                output_tokens_details=OutputTokensDetails(reasoning_tokens=0),
            ),
        )
        yield ResponseCompletedEvent(type="response.completed", response=response, sequence_number=0)

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
    def _parse_dispatch(raw_text: str, tools: list[Tool], handoffs: list[Handoff], *, identity: str | None = None) -> Any:
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
            arguments_text = result.get("arguments_json") or "{}"
            try:
                arguments = json.loads(arguments_text)
            except json.JSONDecodeError:
                arguments = CodexSubscriptionModel._recover_write_file_arguments(name, arguments_text)
            if not isinstance(arguments, dict):
                raise ValueError("Codex tool arguments must be a JSON object")
            stable = hashlib.sha256((identity or raw_text).encode()).hexdigest()[:32]
            call_id = f"call_{stable}"
            return ResponseFunctionToolCall(
                id=f"fc_{stable}",
                call_id=call_id,
                type="function_call",
                name=name,
                arguments=json.dumps(arguments, ensure_ascii=False),
                status="completed",
            )
        if action != "final" or not isinstance(result.get("text"), str):
            raise ValueError("Codex response did not satisfy the Agents SDK dispatch contract")
        return ResponseOutputMessage(
            id=f"msg_{hashlib.sha256((identity or raw_text).encode()).hexdigest()[:32]}",
            type="message",
            role="assistant",
            status="completed",
            content=[ResponseOutputText(type="output_text", text=result["text"], annotations=[])],
        )

    @staticmethod
    def _recover_write_file_arguments(name: str, raw: str) -> dict[str, Any]:
        """Recover only the known two-field write schema from unescaped code quotes.

        Codex structured output can return a valid outer object whose nested
        `arguments_json` contains source code with bare double quotes. Keep this
        repair narrow and fail closed for every other tool/schema.
        """
        if name != "write_file":
            raise ValueError("Codex tool arguments are not valid JSON")
        match = re.fullmatch(r'\s*\{"relative_path":("(?:\\.|[^"\\])*"),"content":"(.*)"\}\s*', raw, re.DOTALL)
        if not match:
            raise ValueError("Malformed write_file arguments do not match the registered schema")
        relative_path = json.loads(match.group(1))
        source = match.group(2)
        escaped: list[str] = []
        index = 0
        valid_escape_chars = set('"\\/bfnrtu')
        while index < len(source):
            char = source[index]
            if char == "\\":
                following = source[index + 1] if index + 1 < len(source) else ""
                if following in valid_escape_chars:
                    escaped.extend((char, following))
                    index += 2
                    continue
                escaped.append("\\\\")
            elif char == '"':
                escaped.append('\\"')
            elif char == "\n":
                escaped.append("\\n")
            elif char == "\r":
                escaped.append("\\r")
            elif char == "\t":
                escaped.append("\\t")
            else:
                escaped.append(char)
            index += 1
        repaired = json.loads(
            '{"relative_path":' + json.dumps(relative_path) + ',"content":"' + "".join(escaped) + '"}'
        )
        if set(repaired) != {"relative_path", "content"} or not all(isinstance(v, str) for v in repaired.values()):
            raise ValueError("Recovered write_file arguments failed schema validation")
        return repaired

    def _run_codex_turn(
        self, instruction: str, output_schema: dict[str, Any], call_id: str, call: dict[str, Any]
    ) -> tuple[str, dict[str, Any]]:
        from openai_codex import ApprovalMode, Codex, CodexConfig, Sandbox

        with Codex(CodexConfig(cwd=str(self.codex_cwd))) as codex:
            if call.get("thread_id"):
                thread = codex.thread_resume(
                    call["thread_id"], cwd=str(self.codex_cwd), approval_mode=ApprovalMode.deny_all,
                    sandbox=Sandbox.read_only, include_turns=True,
                )
                existing = thread.read(include_turns=True).thread
                turns = getattr(existing, "turns", []) or []
                turn_id = call.get("turn_id")
                prior = _select_thread_turn(turns, turn_id)
                if prior is None and turn_id is None and call.get("status") in {"thread_started", "turn_completed"}:
                    # Reconcile the narrow crash window after server turn creation but before local turn ID persistence.
                    prior = _select_thread_turn(turns, None, recover_latest=True)
                    turn_id = prior.id
                    self.store.update_model_call(
                        call_id, event="model.turn.reconciled", stable_suffix=f"turn-reconciled:{prior.id}",
                        turn_id=turn_id, status="turn_reconciling",
                    )
                    call["turn_id"] = turn_id
                    call["status"] = "turn_reconciling"
                if prior is not None and str(getattr(prior.status, "value", prior.status)) == "completed":
                    final = next((item.text for item in reversed(prior.items) if getattr(item, "type", None) == "agentMessage" and getattr(getattr(item, "phase", None), "value", getattr(item, "phase", None)) == "finalAnswer"), None)
                    if final is None:
                        raise RuntimeError("Completed Codex turn has no recoverable final answer")
                    usage = json.loads(call.get("usage_json") or "null")
                    receipt = json.loads(call.get("receipt_json") or "{}")
                    receipt.update({"status": "completed_reconciled", "threadId": thread.id, "turnId": prior.id, "usage": usage, "usageRecovery": "UNVERIFIED" if usage is None else "persisted"})
                    return final, receipt
                if prior is not None and str(getattr(prior.status, "value", prior.status)) in {"inProgress", "in_progress"}:
                    # The public SDK has no attach-to-existing-turn API. Wait for server-side reconciliation;
                    # never start a duplicate turn while the original may still be running.
                    import time
                    deadline = time.monotonic() + 120
                    while time.monotonic() < deadline:
                        time.sleep(2)
                        existing = thread.read(include_turns=True).thread
                        turns = getattr(existing, "turns", []) or []
                        prior = _select_thread_turn(turns, turn_id)
                        if prior is not None and str(getattr(prior.status, "value", prior.status)) not in {"inProgress", "in_progress"}:
                            break
                    if prior is not None and str(getattr(prior.status, "value", prior.status)) in {"inProgress", "in_progress"}:
                        raise RuntimeError("Prior Codex turn remains active; refusing unsafe concurrent retry")
                    if prior is not None and str(getattr(prior.status, "value", prior.status)) == "completed":
                        final = next((item.text for item in reversed(prior.items) if getattr(item, "type", None) == "agentMessage" and getattr(getattr(item, "phase", None), "value", getattr(item, "phase", None)) == "finalAnswer"), None)
                        if final is None:
                            raise RuntimeError("Completed Codex turn has no recoverable final answer")
                        usage = json.loads(call.get("usage_json") or "null")
                        receipt = json.loads(call.get("receipt_json") or "{}")
                        receipt.update({"status": "completed_reconciled", "threadId": thread.id, "turnId": prior.id, "usage": usage, "usageRecovery": "UNVERIFIED" if usage is None else "persisted"})
                        return final, receipt
            else:
                thread = codex.thread_start(
                    cwd=str(self.codex_cwd), approval_mode=ApprovalMode.deny_all,
                    sandbox=Sandbox.read_only, ephemeral=False,
                )
                self.store.update_model_call(call_id, event="model.thread.persisted", stable_suffix="thread", status="thread_started", thread_id=thread.id)
            handle = thread.turn(
                instruction,
                cwd=str(self.codex_cwd),
                approval_mode=ApprovalMode.deny_all,
                sandbox=Sandbox.read_only,
                output_schema=output_schema,
            )
            _maybe_crash(self.store, "model.after_turn_created_before_receipt", {"callId": call_id, "threadId": thread.id, "turnId": handle.id})
            self.store.update_model_call(
                call_id, event="model.turn.started", stable_suffix=f"turn-started:{handle.id}",
                status="turn_running", turn_id=handle.id,
                turn_attempt=int(call.get("turn_attempt", 0)) + 1,
            )
            result = handle.run()
        status = getattr(result.status, "value", result.status)
        if status != "completed":
            raise RuntimeError(f"Codex subscription turn did not complete: {status}")
        usage = result.usage.model_dump(mode="json", by_alias=True) if result.usage else None
        self.store.update_model_call(
            call_id, event="model.turn.persisted", stable_suffix=f"turn:{result.id}",
            status="turn_completed", turn_id=result.id, turn_attempt=int(call.get("turn_attempt", 0)) + 1,
            usage_json=canonical_json(usage),
        )
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
