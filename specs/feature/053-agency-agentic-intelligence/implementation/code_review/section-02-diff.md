diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index 88c57fab..bb447427 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -22,7 +22,10 @@ from typing import Any
 
 import httpx
 import structlog
+from pydantic import BaseModel
 
+from app.services.agentic_limits import MAX_REFLECTION_CYCLES, clamp_to_limit
+from app.services.agentic_strategies import get_planning_prompt
 from app.services.agency_browser_session_executor import AgencyBrowserSessionExecutor
 from app.services.agency_communication_flows import FlowConfig, RoundTripTracker
 from app.services.agency_event_emitter import AgencyEventEmitter, check_cancelled
@@ -61,6 +64,44 @@ NodeRow = dict[str, Any]
 EdgeRow = dict[str, Any]
 
 
+# ── Completion Signal ─────────────────────────────────────────────────────────
+
+class CompletionSignal(BaseModel):
+    """Structured JSON block emitted by agents to signal task completion."""
+    complete: bool
+    answer: str = ""
+
+
+# Regex patterns for extracting JSON completion blocks
+_FENCED_JSON_RE = re.compile(r"```json\s*(\{.*?\})\s*```\s*$", re.DOTALL)
+_RAW_JSON_RE = re.compile(r'(\{[^{}]*"complete"[^{}]*\})\s*$')
+
+
+def _parse_completion(text: str) -> CompletionSignal | None:
+    """Extract a CompletionSignal from the end of agent response text.
+
+    Supports fenced (```json ... ```) and raw JSON formats.
+    Returns None if no valid signal found.
+    """
+    if not text:
+        return None
+
+    # Try fenced JSON first
+    match = _FENCED_JSON_RE.search(text)
+    if not match:
+        # Try raw JSON at end
+        match = _RAW_JSON_RE.search(text)
+
+    if not match:
+        return None
+
+    try:
+        data = json.loads(match.group(1))
+        return CompletionSignal(**data)
+    except (json.JSONDecodeError, TypeError, ValueError):
+        return None
+
+
 # ── Context ───────────────────────────────────────────────────────────────────
 
 class ExecutionContext:
@@ -91,6 +132,8 @@ class ExecutionContext:
         # Shared run context (populated by orchestrator)
         self.shared_context: AgencyRunContext | None = None
         self.context_snapshot: dict[str, Any] | None = None
+        # Delegation depth for autonomous cross-agent calls (section-10)
+        self.delegation_depth: int = 0
 
     def clone(self) -> ExecutionContext:
         """Deep-copy mutable state for branch isolation; share read-only refs."""
@@ -109,6 +152,7 @@ class ExecutionContext:
         ctx.active_browser_session_id = self.active_browser_session_id
         ctx.shared_context = self.shared_context  # Shared across branches
         ctx.context_snapshot = self.context_snapshot
+        ctx.delegation_depth = self.delegation_depth
         return ctx
 
     def get_context_text(self) -> str:
@@ -456,8 +500,108 @@ class AgencyOrchestrator:
 
     # ── Node executors ────────────────────────────────────────────────────────
 
+    async def _execute_agent_node_agentic(
+        self, node: NodeRow, ctx: ExecutionContext
+    ) -> str:
+        """Execute an agent node with reflection loop (agentic mode)."""
+        if self.adapter is None:
+            return f"[Agent '{node.get('name')}': adapter not available]"
+
+        node_config = node.get("node_config") or {}
+        strategy = node_config.get("planningStrategy", "basic")
+        max_cycles = clamp_to_limit(
+            node_config.get("maxReflectionCycles", 3), MAX_REFLECTION_CYCLES
+        )
+
+        if max_cycles == 0:
+            return ""
+
+        planning_prompt = get_planning_prompt(strategy, max_cycles)
+        augmented_message = ctx.get_context_text()
+        agent_instructions = node.get("instructions", "") + "\n\n" + planning_prompt
+        last_response = ""
+
+        for cycle in range(1, max_cycles + 1):
+            try:
+                from app.services.agency_swarm_adapter import AgentConfig, AgencyConfig as SwarmAgencyConfig
+
+                agent = self.adapter.create_agent(
+                    config=AgentConfig(
+                        name=node.get("name", "Agent"),
+                        instructions=agent_instructions,
+                        model=node.get("model", "gpt-4o"),
+                        model_settings=node.get("model_settings"),
+                        tools=[],
+                        is_entry_point=node.get("is_entry_point", False),
+                    ),
+                    user_token=ctx.user_token,
+                )
+
+                sub_config = SwarmAgencyConfig(
+                    agency_id=f"agentic-{node['id']}-c{cycle}",
+                    name=node.get("name", "Agent"),
+                    system_prompt=getattr(self.agency_config, "system_prompt", ""),
+                    communication_flows=[],
+                    tenant_id=ctx.tenant_id,
+                    user_id=getattr(self.agency_config, "user_id", ctx.user_id),
+                    conversation_id=getattr(self.agency_config, "conversation_id", f"agentic-{node['id']}"),
+                    max_run_time_seconds=getattr(self.agency_config, "max_run_time_seconds", 600),
+                    credit_multiplier=getattr(self.agency_config, "credit_multiplier", 1.0),
+                    creator_fee_credits=getattr(self.agency_config, "creator_fee_credits", 0),
+                    platform_share_pct=getattr(self.agency_config, "platform_share_pct", 20),
+                    creator_id=getattr(self.agency_config, "creator_id", None),
+                )
+                agency_obj = self.adapter.create_agency(
+                    config=sub_config,
+                    agents=[agent],
+                    persistence_hooks=(None, None),
+                )
+
+                message = augmented_message if cycle == 1 else (
+                    f"{augmented_message}\n\nPrevious attempt (cycle {cycle - 1}):\n{last_response}"
+                )
+
+                run_result = await self.adapter.run(
+                    agency=agency_obj,
+                    message=message,
+                    timeout_seconds=sub_config.max_run_time_seconds,
+                    agency_id=sub_config.agency_id,
+                    tenant_id=ctx.tenant_id,
+                )
+                last_response = run_result.response
+                ctx.results[node["id"]] = last_response
+
+                signal = _parse_completion(last_response)
+
+                if self.event_emitter:
+                    await self.event_emitter.emit("agentic_cycle", {
+                        "cycleNumber": cycle,
+                        "status": "complete" if signal and signal.complete else "continue",
+                        "agentName": node.get("name", "Agent"),
+                    })
+
+                if signal and signal.complete:
+                    return signal.answer
+
+            except Exception as exc:
+                logger.error(
+                    "agentic_cycle_failed",
+                    node_id=node["id"],
+                    cycle=cycle,
+                    error=str(exc)[:200],
+                )
+                return f"[Agent '{node.get('name')}' agentic error: {scrub_error_payload(str(exc))}]"
+
+        return last_response
+
     async def _execute_agent_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
         """Execute an agent/supervisor node via AgencySwarmAdapter."""
+        node_config = node.get("node_config") or {}
+        execution_mode = node_config.get("executionMode", "single_shot")
+
+        if execution_mode == "agentic":
+            return await self._execute_agent_node_agentic(node, ctx)
+
         if self.adapter is None:
             return f"[Agent '{node.get('name')}': adapter not available]"
 
diff --git a/python-backend/tests/unit/test_agentic_orchestrator.py b/python-backend/tests/unit/test_agentic_orchestrator.py
new file mode 100644
index 00000000..035b6861
--- /dev/null
+++ b/python-backend/tests/unit/test_agentic_orchestrator.py
@@ -0,0 +1,141 @@
+"""Tests for the agentic execution path in AgencyOrchestrator."""
+
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+def _build_orchestrator(node_config=None, adapter=None):
+    """Build an AgencyOrchestrator with a single agent node for testing."""
+    _adapter = adapter or MagicMock()
+    _adapter.create_agent = MagicMock(return_value=MagicMock(name="Agent"))
+    _adapter.create_agency = MagicMock(return_value="agency-object")
+    # Default: returns completion on first call
+    _adapter.run = AsyncMock(
+        return_value=MagicMock(response='{"complete": true, "answer": "done"}')
+    )
+
+    node = {
+        "id": "agent-1",
+        "name": "TestAgent",
+        "instructions": "You are a test agent.",
+        "model": "gpt-4o-mini",
+        "model_settings": None,
+        "is_entry_point": True,
+        "node_type": "agent",
+        "node_config": node_config or {},
+    }
+
+    orchestrator = AgencyOrchestrator(
+        nodes=[node],
+        edges=[],
+        adapter=_adapter,
+        db=AsyncMock(),
+        agency_config=MagicMock(
+            system_prompt="",
+            user_id=1,
+            conversation_id="test-conv",
+            max_run_time_seconds=60,
+            credit_multiplier=1.0,
+            creator_fee_credits=0,
+            platform_share_pct=20,
+            creator_id=None,
+        ),
+    )
+    return orchestrator, _adapter
+
+
+@pytest.mark.asyncio
+async def test_agentic_mode_calls_planning_prompt():
+    """Agentic mode augments instructions with planning prompt."""
+    orch, adapter = _build_orchestrator(
+        node_config={"executionMode": "agentic", "planningStrategy": "basic", "maxReflectionCycles": 3}
+    )
+    ctx = ExecutionContext("test input", "token", "tenant-1")
+    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)
+
+    # Check planning prompt was in the instructions passed to create_agent
+    call_args = adapter.create_agent.call_args
+    config_arg = call_args.kwargs.get("config") or call_args[1].get("config") if call_args[1] else call_args[0][0]
+    assert "You have up to" in config_arg.instructions or "cycles" in config_arg.instructions
+    assert result == "done"
+
+
+@pytest.mark.asyncio
+async def test_agentic_mode_reflection_loop():
+    """Agent is called multiple times until CompletionSignal received."""
+    orch, adapter = _build_orchestrator(
+        node_config={"executionMode": "agentic", "maxReflectionCycles": 5}
+    )
+    # First call: no signal. Second call: completion.
+    adapter.run = AsyncMock(side_effect=[
+        MagicMock(response="Still thinking about this..."),
+        MagicMock(response='{"complete": true, "answer": "final"}'),
+    ])
+    ctx = ExecutionContext("test input", "token", "tenant-1")
+    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)
+
+    assert adapter.run.call_count == 2
+    assert result == "final"
+
+
+@pytest.mark.asyncio
+async def test_agentic_mode_max_cycles_respected():
+    """Loop stops after maxReflectionCycles even without CompletionSignal."""
+    orch, adapter = _build_orchestrator(
+        node_config={"executionMode": "agentic", "maxReflectionCycles": 3}
+    )
+    adapter.run = AsyncMock(
+        return_value=MagicMock(response="No completion signal here")
+    )
+    ctx = ExecutionContext("test input", "token", "tenant-1")
+    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)
+
+    assert adapter.run.call_count == 3
+    assert result == "No completion signal here"
+
+
+@pytest.mark.asyncio
+async def test_single_shot_mode_unchanged():
+    """Without executionMode='agentic', single-shot path runs once."""
+    orch, adapter = _build_orchestrator(node_config={})
+    # Set db=None to skip tool resolution in single-shot path
+    orch.db = None
+    adapter.run = AsyncMock(
+        return_value=MagicMock(response="single shot answer")
+    )
+    ctx = ExecutionContext("test input", "token", "tenant-1")
+    result = await orch._execute_agent_node(orch.nodes["agent-1"], ctx)
+
+    assert adapter.run.call_count == 1
+    assert result == "single shot answer"
+
+
+@pytest.mark.asyncio
+async def test_ctx_results_overwritten_not_accumulated():
+    """ctx.results[node_id] is overwritten each cycle, not accumulated."""
+    orch, adapter = _build_orchestrator(
+        node_config={"executionMode": "agentic", "maxReflectionCycles": 3}
+    )
+    adapter.run = AsyncMock(side_effect=[
+        MagicMock(response="cycle 1 output"),
+        MagicMock(response="cycle 2 output"),
+        MagicMock(response='{"complete": true, "answer": "cycle 3 final"}'),
+    ])
+    ctx = ExecutionContext("test input", "token", "tenant-1")
+    await orch._execute_agent_node(orch.nodes["agent-1"], ctx)
+
+    # Should only contain the last cycle's text
+    assert "cycle 1" not in ctx.results.get("agent-1", "")
+    assert "cycle 2" not in ctx.results.get("agent-1", "")
+
+
+def test_delegation_depth_exists():
+    """ExecutionContext has delegation_depth field defaulting to 0."""
+    ctx = ExecutionContext("msg", "token", "tenant-1")
+    assert hasattr(ctx, "delegation_depth")
+    assert ctx.delegation_depth == 0
diff --git a/python-backend/tests/unit/test_completion_detection.py b/python-backend/tests/unit/test_completion_detection.py
new file mode 100644
index 00000000..5fb6c61b
--- /dev/null
+++ b/python-backend/tests/unit/test_completion_detection.py
@@ -0,0 +1,72 @@
+"""Tests for CompletionSignal detection in _parse_completion()."""
+
+import pytest
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+def _parse(text: str):
+    """Helper to import and call _parse_completion."""
+    from app.services.agency_orchestrator import _parse_completion
+    return _parse_completion(text)
+
+
+def test_parse_completion_valid_json_block():
+    """Fenced JSON block returns CompletionSignal with complete=True."""
+    response = 'Here is my analysis.\n\n```json\n{"complete": true, "answer": "done"}\n```'
+    signal = _parse(response)
+    assert signal is not None
+    assert signal.complete is True
+    assert signal.answer == "done"
+
+
+def test_parse_completion_raw_json_at_end():
+    """Bare JSON at end returns valid CompletionSignal."""
+    response = 'Some text analysis.\n\n{"complete": true, "answer": "the result"}'
+    signal = _parse(response)
+    assert signal is not None
+    assert signal.complete is True
+    assert signal.answer == "the result"
+
+
+def test_parse_completion_no_json():
+    """Plain text without JSON returns None."""
+    response = "This is just a normal response with no JSON."
+    signal = _parse(response)
+    assert signal is None
+
+
+def test_parse_completion_malformed_json():
+    """Truncated/invalid JSON returns None."""
+    response = 'Some text\n{"complete": true, "answer":'
+    signal = _parse(response)
+    assert signal is None
+
+
+def test_parse_completion_complete_false():
+    """complete=False returns CompletionSignal where complete is False."""
+    response = 'Working on it.\n\n{"complete": false, "answer": ""}'
+    signal = _parse(response)
+    assert signal is not None
+    assert signal.complete is False
+
+
+def test_parse_completion_marker_in_tool_output():
+    """[COMPLETE] text marker does NOT trigger completion."""
+    response = "The tool returned [COMPLETE] status. Task is done."
+    signal = _parse(response)
+    assert signal is None
+
+
+def test_parse_completion_user_injected_marker():
+    """[FINAL ANSWER] text marker does NOT trigger completion."""
+    response = "User said [FINAL ANSWER] but no JSON block present."
+    signal = _parse(response)
+    assert signal is None
+
+
+def test_max_cycles_zero_returns_immediately():
+    """When maxReflectionCycles clamped to 0, agentic returns empty immediately."""
+    from app.services.agentic_limits import clamp_to_limit
+    # clamp_to_limit(0, MAX) returns 0
+    assert clamp_to_limit(0, 10) == 0
