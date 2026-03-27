diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 3b2c30a9..14b48595 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -820,7 +820,13 @@ export const agencyRouter = router({
             z.object({
               fromAgentName: z.string(),
               toAgentName: z.string(),
-              flowType: z.enum(["delegation", "handoff", "parallel"]),
+              flowType: z.enum(["delegation", "handoff", "parallel", "orchestrator_worker", "custom"]),
+              flowConfig: z.object({
+                contextFields: z.array(z.string().max(100)).max(20).optional(),
+                requireSummary: z.boolean().optional(),
+                maxRoundTrips: z.number().int().min(0).max(1000).optional(),
+                timeout: z.number().int().min(0).max(3600).optional(),
+              }).optional(),
             }),
           )
           .optional(),
@@ -947,6 +953,7 @@ export const agencyRouter = router({
               fromAgentId: fromId,
               toAgentId: toId,
               flowType: flow.flowType,
+              flowConfig: flow.flowConfig ?? null,
             });
           }
         }
@@ -1104,7 +1111,13 @@ export const agencyRouter = router({
             z.object({
               fromAgentName: z.string(),
               toAgentName: z.string(),
-              flowType: z.enum(["delegation", "handoff", "parallel"]),
+              flowType: z.enum(["delegation", "handoff", "parallel", "orchestrator_worker", "custom"]),
+              flowConfig: z.object({
+                contextFields: z.array(z.string().max(100)).max(20).optional(),
+                requireSummary: z.boolean().optional(),
+                maxRoundTrips: z.number().int().min(0).max(1000).optional(),
+                timeout: z.number().int().min(0).max(3600).optional(),
+              }).optional(),
             }),
           )
           .optional(),
@@ -1246,6 +1259,7 @@ export const agencyRouter = router({
               fromAgentId: fromId,
               toAgentId: toId,
               flowType: flow.flowType,
+              flowConfig: flow.flowConfig ?? null,
             });
           }
         }
@@ -2061,6 +2075,7 @@ export const agencyRouter = router({
               fromAgentId: fromId,
               toAgentId: toId,
               flowType: edge.flowType ?? "delegation",
+              flowConfig: edge.flowConfig ?? null,
             });
           }
         }
@@ -2633,6 +2648,7 @@ export const agencyRouter = router({
               fromAgentId: newFromId,
               toAgentId: newToId,
               flowType: flow.flowType,
+              flowConfig: flow.flowConfig ?? null,
             });
           }
         }
diff --git a/python-backend/app/services/agency_communication_flows.py b/python-backend/app/services/agency_communication_flows.py
new file mode 100644
index 00000000..286e9356
--- /dev/null
+++ b/python-backend/app/services/agency_communication_flows.py
@@ -0,0 +1,94 @@
+"""Communication flow configuration and round-trip tracking."""
+
+from __future__ import annotations
+
+from dataclasses import dataclass, field
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+
+@dataclass
+class FlowConfig:
+    """Parsed flowConfig from agencyCommunicationFlows."""
+
+    context_fields: list[str] | None = None
+    require_summary: bool = False
+    max_round_trips: int = 0  # 0 = unlimited
+    timeout: int = 0  # 0 = no timeout
+
+    @classmethod
+    def from_dict(cls, data: dict[str, Any] | None) -> FlowConfig | None:
+        """Parse a flowConfig dict from the database."""
+        if not data:
+            return None
+        return cls(
+            context_fields=data.get("contextFields"),
+            require_summary=data.get("requireSummary", False),
+            max_round_trips=data.get("maxRoundTrips", 0),
+            timeout=data.get("timeout", 0),
+        )
+
+
+class RoundTripTracker:
+    """Tracks round-trip counts per (fromAgent, toAgent) pair."""
+
+    def __init__(self) -> None:
+        self._counts: dict[tuple[str, str], int] = {}
+
+    def increment(self, from_agent: str, to_agent: str) -> None:
+        """Increment counter for agent pair."""
+        key = (from_agent, to_agent)
+        self._counts[key] = self._counts.get(key, 0) + 1
+
+    def get_count(self, from_agent: str, to_agent: str) -> int:
+        """Get current count for agent pair."""
+        return self._counts.get((from_agent, to_agent), 0)
+
+    def is_limit_reached(
+        self, from_agent: str, to_agent: str, config: FlowConfig | None
+    ) -> bool:
+        """Check if round-trip limit is reached for this pair.
+
+        Returns False if config is None or maxRoundTrips is 0 (unlimited).
+        """
+        if config is None or config.max_round_trips <= 0:
+            return False
+
+        count = self.get_count(from_agent, to_agent)
+        if count >= config.max_round_trips:
+            logger.info(
+                "round_trip_limit_reached",
+                from_agent=from_agent,
+                to_agent=to_agent,
+                count=count,
+                limit=config.max_round_trips,
+            )
+            return True
+        return False
+
+
+async def build_context_injection(
+    context: Any,  # AgencyRunContext
+    config: FlowConfig | None,
+) -> str:
+    """Build context injection string for handoff based on flowConfig.contextFields.
+
+    Extracts specified keys from AgencyRunContext and formats them
+    as a readable context block to prepend to the receiving agent's prompt.
+    """
+    if config is None or not config.context_fields:
+        return ""
+
+    parts: list[str] = []
+    for field_name in config.context_fields:
+        value = await context.get(field_name)
+        if value is not None:
+            parts.append(f"- {field_name}: {value}")
+
+    if not parts:
+        return ""
+
+    return "Shared context:\n" + "\n".join(parts)
diff --git a/python-backend/app/services/agency_instruction_resolver.py b/python-backend/app/services/agency_instruction_resolver.py
new file mode 100644
index 00000000..e763a44f
--- /dev/null
+++ b/python-backend/app/services/agency_instruction_resolver.py
@@ -0,0 +1,81 @@
+"""Resolve template variables in agent instructions at runtime."""
+
+from __future__ import annotations
+
+import re
+from datetime import datetime
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+# Pattern matches {variable} or {context.key} or {user.key}
+_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_.]*)\}")
+
+
+def resolve_instructions(
+    raw_instructions: str,
+    *,
+    agent_name: str,
+    tool_names: list[str] | None = None,
+    context: Any | None = None,  # AgencyRunContext
+    user_context: dict[str, Any] | None = None,
+) -> str:
+    """Resolve all template variables in agent instructions.
+
+    Supported variables:
+    - {agent_name} -> agent's display name
+    - {current_date} -> YYYY-MM-DD
+    - {current_time} -> HH:MM
+    - {tool_names} -> comma-separated tool list
+    - {context.KEY} -> value from AgencyRunContext
+    - {user.KEY} -> value from user_context dict
+
+    Missing variables are left as literal '{variable}'.
+    """
+    if not raw_instructions:
+        return raw_instructions
+
+    now = datetime.now()
+
+    # Build flat variable dict with dotted keys
+    variables: dict[str, str] = {
+        "agent_name": agent_name,
+        "current_date": now.strftime("%Y-%m-%d"),
+        "current_time": now.strftime("%H:%M"),
+        "tool_names": ", ".join(tool_names) if tool_names else "",
+    }
+
+    # Add context.KEY entries from AgencyRunContext snapshot
+    if context is not None:
+        try:
+            snapshot = context.snapshot() if hasattr(context, "snapshot") else {}
+            for key, value in snapshot.items():
+                if isinstance(key, str) and "." not in key:
+                    variables[f"context.{key}"] = str(value)
+        except Exception:
+            logger.warning("instruction_resolver_context_error", agent=agent_name)
+
+    # Add user.KEY entries
+    if user_context:
+        for key, value in user_context.items():
+            if isinstance(key, str):
+                variables[f"user.{key}"] = str(value)
+
+    # Resolve using regex to handle dotted keys properly
+    def _replace(match: re.Match) -> str:
+        key = match.group(1)
+        if key in variables:
+            return variables[key]
+        # Missing key - return literal
+        return match.group(0)
+
+    try:
+        resolved = _TEMPLATE_RE.sub(_replace, raw_instructions)
+    except Exception as e:
+        logger.warning("instruction_resolver_format_error", agent=agent_name, error=str(e))
+        return raw_instructions
+
+    logger.debug("instructions_resolved", agent=agent_name, had_variables=resolved != raw_instructions)
+    return resolved
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index 6cb7f866..8daceea5 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -22,7 +22,10 @@ import httpx
 import structlog
 
 from app.services.agency_browser_session_executor import AgencyBrowserSessionExecutor
+from app.services.agency_communication_flows import FlowConfig, RoundTripTracker
 from app.services.agency_event_emitter import AgencyEventEmitter, check_cancelled
+from app.services.agency_instruction_resolver import resolve_instructions
+from app.services.agency_output_validator import AgencyOutputValidator
 from app.services.agency_run_context import AgencyRunContext
 
 logger = structlog.get_logger(__name__)
@@ -118,6 +121,8 @@ class AgencyOrchestrator:
         self.event_emitter = event_emitter
         self.redis_client = redis_client
         self.browser_session_executor = AgencyBrowserSessionExecutor()
+        self._round_trip_tracker = RoundTripTracker()
+        self._flow_configs: dict[tuple[str, str], FlowConfig] = {}
 
         # Find entry node
         entry_candidates = [n for n in nodes if n.get("is_entry_point")]
@@ -368,6 +373,15 @@ class AgencyOrchestrator:
             if kb_context:
                 agent_instructions = agent_instructions + kb_context
 
+        # ── Dynamic instruction resolution ───────────────────────────────
+        agent_instructions = resolve_instructions(
+            raw_instructions=agent_instructions,
+            agent_name=node.get("name", "Agent"),
+            tool_names=None,  # Will be populated after tools are resolved
+            context=ctx.shared_context,
+            user_context=self.user_context,
+        )
+
         try:
             from app.services.agency_swarm_adapter import AgentConfig
 
@@ -432,6 +446,37 @@ class AgencyOrchestrator:
             )
             response = run_result.response
 
+            # ── Structured output validation ─────────────────────────────
+            output_schema = node.get("output_schema") or node_config.get("outputSchema")
+            if output_schema and ctx.shared_context:
+                validator = AgencyOutputValidator(output_schema, node.get("name", "Agent"))
+                validation_attempts = node_config.get("validationAttempts", 1)
+                for attempt in range(validation_attempts):
+                    result_obj = validator.validate(response)
+                    if result_obj.is_valid:
+                        if result_obj.parsed_data is not None:
+                            await ctx.shared_context.set(
+                                f"{node.get('name', 'Agent')}_output",
+                                result_obj.parsed_data,
+                            )
+                        break
+                    if attempt < validation_attempts - 1 and result_obj.retry_feedback:
+                        # Retry with feedback
+                        retry_result = await self.adapter.run(
+                            agency=agency_obj,
+                            message=result_obj.retry_feedback,
+                            timeout_seconds=sub_config.max_run_time_seconds,
+                            agency_id=sub_config.agency_id,
+                            tenant_id=ctx.tenant_id,
+                        )
+                        response = retry_result.response
+                    else:
+                        logger.warning(
+                            "structured_output_validation_failed",
+                            agent=node.get("name"),
+                            attempts=validation_attempts,
+                        )
+
             # Emit text_delta with full response (non-streaming path)
             if self.event_emitter and response:
                 await self.event_emitter.emit("text_delta", {
diff --git a/python-backend/app/services/agency_output_validator.py b/python-backend/app/services/agency_output_validator.py
new file mode 100644
index 00000000..ebf370a7
--- /dev/null
+++ b/python-backend/app/services/agency_output_validator.py
@@ -0,0 +1,104 @@
+"""Validate agent structured output against JSON Schema."""
+
+from __future__ import annotations
+
+import json
+from dataclasses import dataclass
+from typing import Any
+
+import jsonschema
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+
+@dataclass
+class ValidationResult:
+    """Result of schema validation attempt."""
+
+    is_valid: bool
+    parsed_data: dict[str, Any] | None = None
+    retry_feedback: str | None = None
+
+
+class AgencyOutputValidator:
+    """Validates agent responses against an outputSchema.
+
+    If validation fails, produces a feedback message for the agent
+    to retry with corrected output.
+    """
+
+    def __init__(self, output_schema: dict[str, Any] | None, agent_name: str) -> None:
+        """Store schema and agent name. If schema is None or empty, validation is a no-op."""
+        self._schema = output_schema if output_schema else None
+        self._agent_name = agent_name
+
+    @property
+    def has_schema(self) -> bool:
+        """Whether a non-empty schema is configured."""
+        return self._schema is not None and len(self._schema) > 0
+
+    def validate(self, response_text: str) -> ValidationResult:
+        """Parse response as JSON, validate against schema.
+
+        Returns ValidationResult with is_valid, parsed_data, and retry_feedback.
+        """
+        if not self.has_schema:
+            return ValidationResult(is_valid=True)
+
+        # Step 1: Parse JSON
+        try:
+            parsed = json.loads(response_text)
+        except (json.JSONDecodeError, TypeError) as e:
+            logger.debug(
+                "output_validation_json_parse_failed",
+                agent=self._agent_name,
+                error=str(e),
+            )
+            return ValidationResult(
+                is_valid=False,
+                retry_feedback=(
+                    "Your response must be valid JSON matching the required schema. "
+                    "Please respond with only the JSON object, no additional text."
+                ),
+            )
+
+        # Step 2: Validate against schema
+        try:
+            jsonschema.validate(instance=parsed, schema=self._schema)
+        except jsonschema.ValidationError as e:
+            logger.debug(
+                "output_validation_schema_failed",
+                agent=self._agent_name,
+                error=e.message,
+            )
+            return ValidationResult(
+                is_valid=False,
+                retry_feedback=(
+                    f"Your JSON response did not match the required schema: {e.message}. "
+                    "Please fix the response and return valid JSON."
+                ),
+            )
+
+        logger.debug(
+            "output_validation_passed",
+            agent=self._agent_name,
+        )
+        return ValidationResult(is_valid=True, parsed_data=parsed)
+
+    async def validate_and_store(
+        self,
+        response_text: str,
+        context: Any,  # AgencyRunContext
+    ) -> tuple[str, bool]:
+        """Validate response and store in context if valid.
+
+        Stores under key '{agent_name}_output' in AgencyRunContext.
+        Returns (response_text, was_valid).
+        """
+        result = self.validate(response_text)
+
+        if result.is_valid and result.parsed_data is not None:
+            await context.set(f"{self._agent_name}_output", result.parsed_data)
+
+        return response_text, result.is_valid
diff --git a/python-backend/tests/unit/test_agency_communication_flows.py b/python-backend/tests/unit/test_agency_communication_flows.py
new file mode 100644
index 00000000..e4827142
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_communication_flows.py
@@ -0,0 +1,115 @@
+"""Tests for communication flow config enforcement (maxRoundTrips, contextFields)."""
+
+import pytest
+
+from app.services.agency_communication_flows import (
+    FlowConfig,
+    RoundTripTracker,
+    build_context_injection,
+)
+from app.services.agency_run_context import AgencyRunContext
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestRoundTripTracker:
+    """Tests for round-trip counter enforcement."""
+
+    def test_max_round_trips_enforced(self):
+        """After maxRoundTrips, tracker reports limit reached."""
+        config = FlowConfig(max_round_trips=3)
+        tracker = RoundTripTracker()
+
+        for i in range(3):
+            assert not tracker.is_limit_reached("A", "B", config)
+            tracker.increment("A", "B")
+
+        assert tracker.is_limit_reached("A", "B", config)
+
+    def test_tracks_per_agent_pair(self):
+        """Counters are independent per (from, to) pair."""
+        config = FlowConfig(max_round_trips=2)
+        tracker = RoundTripTracker()
+
+        tracker.increment("A", "B")
+        tracker.increment("A", "B")
+        tracker.increment("A", "C")
+
+        assert tracker.is_limit_reached("A", "B", config)
+        assert not tracker.is_limit_reached("A", "C", config)
+
+    def test_zero_max_round_trips_is_unlimited(self):
+        """maxRoundTrips=0 means no limit."""
+        config = FlowConfig(max_round_trips=0)
+        tracker = RoundTripTracker()
+
+        for _ in range(100):
+            tracker.increment("A", "B")
+
+        assert not tracker.is_limit_reached("A", "B", config)
+
+    def test_missing_config_is_unlimited(self):
+        """No FlowConfig means unlimited round trips."""
+        tracker = RoundTripTracker()
+
+        for _ in range(100):
+            tracker.increment("A", "B")
+
+        assert not tracker.is_limit_reached("A", "B", None)
+
+    def test_get_count(self):
+        """Counter returns correct count for pair."""
+        tracker = RoundTripTracker()
+        assert tracker.get_count("A", "B") == 0
+
+        tracker.increment("A", "B")
+        tracker.increment("A", "B")
+        assert tracker.get_count("A", "B") == 2
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestContextInjection:
+    """Tests for contextFields injection into agent prompts."""
+
+    @pytest.mark.asyncio
+    async def test_context_fields_extracted(self):
+        """contextFields keys are extracted from AgencyRunContext."""
+        ctx = AgencyRunContext({"summary": "Phase 1 done", "priority": "high", "other": "ignored"})
+        config = FlowConfig(context_fields=["summary", "priority"])
+
+        injection = await build_context_injection(ctx, config)
+
+        assert "summary" in injection
+        assert "Phase 1 done" in injection
+        assert "priority" in injection
+        assert "high" in injection
+        assert "other" not in injection
+        assert "ignored" not in injection
+
+    @pytest.mark.asyncio
+    async def test_missing_context_field_skipped(self):
+        """Missing context fields are silently skipped."""
+        ctx = AgencyRunContext({"summary": "Done"})
+        config = FlowConfig(context_fields=["summary", "nonexistent"])
+
+        injection = await build_context_injection(ctx, config)
+
+        assert "summary" in injection
+        assert "nonexistent" not in injection
+
+    @pytest.mark.asyncio
+    async def test_no_context_fields_returns_empty(self):
+        """No contextFields config returns empty string."""
+        ctx = AgencyRunContext({"data": "value"})
+        config = FlowConfig()
+
+        injection = await build_context_injection(ctx, config)
+        assert injection == ""
+
+    @pytest.mark.asyncio
+    async def test_none_config_returns_empty(self):
+        """None FlowConfig returns empty string."""
+        ctx = AgencyRunContext({"data": "value"})
+        injection = await build_context_injection(ctx, None)
+        assert injection == ""
diff --git a/python-backend/tests/unit/test_agency_instruction_resolver.py b/python-backend/tests/unit/test_agency_instruction_resolver.py
new file mode 100644
index 00000000..383a108d
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_instruction_resolver.py
@@ -0,0 +1,123 @@
+"""Tests for dynamic instruction template resolution."""
+
+from datetime import datetime
+from unittest.mock import AsyncMock, MagicMock
+
+import pytest
+
+from app.services.agency_instruction_resolver import resolve_instructions
+from app.services.agency_run_context import AgencyRunContext
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestInstructionResolver:
+    """Tests for resolve_instructions."""
+
+    def test_agent_name_resolved(self):
+        """'{agent_name}' replaced with actual agent name."""
+        result = resolve_instructions(
+            "You are {agent_name}",
+            agent_name="ResearchBot",
+        )
+        assert result == "You are ResearchBot"
+
+    def test_current_date_resolved(self):
+        """{current_date} resolved to today's date."""
+        result = resolve_instructions(
+            "Today is {current_date}",
+            agent_name="Agent",
+        )
+        today = datetime.now().strftime("%Y-%m-%d")
+        assert result == f"Today is {today}"
+
+    def test_current_time_resolved(self):
+        """{current_time} resolved to current time HH:MM."""
+        result = resolve_instructions(
+            "Time: {current_time}",
+            agent_name="Agent",
+        )
+        # Just check format - time may have changed
+        parts = result.replace("Time: ", "").split(":")
+        assert len(parts) == 2
+        assert parts[0].isdigit() and parts[1].isdigit()
+
+    def test_tool_names_resolved(self):
+        """{tool_names} resolved to comma-separated tool list."""
+        result = resolve_instructions(
+            "Tools: {tool_names}",
+            agent_name="Agent",
+            tool_names=["search", "calculator", "browser"],
+        )
+        assert result == "Tools: search, calculator, browser"
+
+    @pytest.mark.asyncio
+    async def test_context_key_resolved(self):
+        """{context.KEY} resolved from AgencyRunContext."""
+        ctx = AgencyRunContext({"project": "Alpha"})
+        result = resolve_instructions(
+            "Working on {context.project}",
+            agent_name="Agent",
+            context=ctx,
+        )
+        assert result == "Working on Alpha"
+
+    def test_user_key_resolved(self):
+        """{user.KEY} resolved from user_context dict."""
+        result = resolve_instructions(
+            "Respond in {user.language}",
+            agent_name="Agent",
+            user_context={"language": "Thai"},
+        )
+        assert result == "Respond in Thai"
+
+    def test_missing_variable_returns_literal(self):
+        """Missing template variable left as literal {key}."""
+        result = resolve_instructions(
+            "Hello {unknown_var}",
+            agent_name="Agent",
+        )
+        assert result == "Hello {unknown_var}"
+
+    def test_nested_context_key_returns_literal(self):
+        """{context.nested.key} treated as single key, not deep access."""
+        ctx = AgencyRunContext({"nested": {"key": "value"}})
+        result = resolve_instructions(
+            "Value: {context.nested.key}",
+            agent_name="Agent",
+            context=ctx,
+        )
+        # "context.nested.key" is not a flat key, so it stays literal
+        assert result == "Value: {context.nested.key}"
+
+    @pytest.mark.asyncio
+    async def test_multiple_variables_resolved(self):
+        """Multiple variables in one instruction all resolved."""
+        ctx = AgencyRunContext({"task": "analysis"})
+        result = resolve_instructions(
+            "I am {agent_name}. Date: {current_date}. Task: {context.task}",
+            agent_name="Analyst",
+            context=ctx,
+        )
+        today = datetime.now().strftime("%Y-%m-%d")
+        assert result == f"I am Analyst. Date: {today}. Task: analysis"
+
+    def test_empty_instructions_returns_empty(self):
+        """Empty string input returns empty string."""
+        result = resolve_instructions("", agent_name="Agent")
+        assert result == ""
+
+    def test_no_variables_returns_unchanged(self):
+        """Instructions with no template variables returned as-is."""
+        text = "You are a helpful assistant. Follow the rules."
+        result = resolve_instructions(text, agent_name="Agent")
+        assert result == text
+
+    def test_tool_names_none_returns_empty_string(self):
+        """{tool_names} with no tools resolves to empty string."""
+        result = resolve_instructions(
+            "Tools: {tool_names}",
+            agent_name="Agent",
+            tool_names=None,
+        )
+        assert result == "Tools: "
diff --git a/python-backend/tests/unit/test_agency_output_validator.py b/python-backend/tests/unit/test_agency_output_validator.py
new file mode 100644
index 00000000..002c480d
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_output_validator.py
@@ -0,0 +1,117 @@
+"""Tests for agency output validator -- JSON Schema validation + retry."""
+
+import pytest
+
+from app.services.agency_output_validator import AgencyOutputValidator, ValidationResult
+from app.services.agency_run_context import AgencyRunContext
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestAgencyOutputValidator:
+    """Tests for AgencyOutputValidator."""
+
+    def test_valid_json_passes_schema(self):
+        """Valid JSON matching schema returns is_valid=True with parsed data."""
+        schema = {
+            "type": "object",
+            "properties": {"score": {"type": "number"}},
+            "required": ["score"],
+        }
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        result = validator.validate('{"score": 85}')
+
+        assert result.is_valid is True
+        assert result.parsed_data == {"score": 85}
+        assert result.retry_feedback is None
+
+    def test_invalid_type_triggers_retry(self):
+        """Response with wrong type triggers retry feedback."""
+        schema = {
+            "type": "object",
+            "properties": {"score": {"type": "number"}},
+            "required": ["score"],
+        }
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        result = validator.validate('{"score": "high"}')
+
+        assert result.is_valid is False
+        assert result.parsed_data is None
+        assert result.retry_feedback is not None
+        assert "score" in result.retry_feedback.lower() or "type" in result.retry_feedback.lower()
+
+    def test_non_json_triggers_retry(self):
+        """Non-JSON response triggers retry with JSON instruction."""
+        schema = {"type": "object", "properties": {"score": {"type": "number"}}}
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        result = validator.validate("The score is 85")
+
+        assert result.is_valid is False
+        assert result.parsed_data is None
+        assert "json" in result.retry_feedback.lower()
+
+    @pytest.mark.asyncio
+    async def test_valid_output_stored_in_context(self):
+        """Validated output is stored in context under {agentName}_output."""
+        schema = {
+            "type": "object",
+            "properties": {"score": {"type": "number"}},
+            "required": ["score"],
+        }
+        ctx = AgencyRunContext()
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        response, was_valid = await validator.validate_and_store('{"score": 85}', context=ctx)
+
+        assert was_valid is True
+        stored = await ctx.get("Scorer_output")
+        assert stored == {"score": 85}
+
+    def test_retry_limit_respected(self):
+        """Validator itself validates once; retry loop is orchestrator's concern."""
+        schema = {
+            "type": "object",
+            "properties": {"score": {"type": "number"}},
+            "required": ["score"],
+        }
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        # Two consecutive failures - validator always returns feedback
+        r1 = validator.validate('{"score": "bad"}')
+        r2 = validator.validate('{"score": "still bad"}')
+        assert r1.is_valid is False
+        assert r2.is_valid is False
+        assert r1.retry_feedback is not None
+        assert r2.retry_feedback is not None
+
+    def test_no_schema_skips_validation(self):
+        """When outputSchema is None, validation is a no-op."""
+        validator = AgencyOutputValidator(output_schema=None, agent_name="Agent")
+        result = validator.validate("Any text response is fine")
+
+        assert result.is_valid is True
+        assert result.parsed_data is None
+        assert result.retry_feedback is None
+
+    def test_empty_schema_skips_validation(self):
+        """When outputSchema is empty dict {}, treated as no validation."""
+        validator = AgencyOutputValidator(output_schema={}, agent_name="Agent")
+        result = validator.validate("Any text response")
+
+        assert result.is_valid is True
+        assert result.parsed_data is None
+        assert result.retry_feedback is None
+
+    @pytest.mark.asyncio
+    async def test_invalid_output_not_stored(self):
+        """Invalid output is not stored in context."""
+        schema = {
+            "type": "object",
+            "properties": {"score": {"type": "number"}},
+            "required": ["score"],
+        }
+        ctx = AgencyRunContext()
+        validator = AgencyOutputValidator(output_schema=schema, agent_name="Scorer")
+        response, was_valid = await validator.validate_and_store("not json", context=ctx)
+
+        assert was_valid is False
+        stored = await ctx.get("Scorer_output")
+        assert stored is None
