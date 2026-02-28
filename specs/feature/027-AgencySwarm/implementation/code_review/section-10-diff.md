diff --git a/apps/web/server/services/__tests__/agencySkillTrigger.test.ts b/apps/web/server/services/__tests__/agencySkillTrigger.test.ts
new file mode 100644
index 0000000..c2ccf4c
--- /dev/null
+++ b/apps/web/server/services/__tests__/agencySkillTrigger.test.ts
@@ -0,0 +1,100 @@
+import { describe, it, expect } from "vitest";
+
+/**
+ * Tests for agency auto-trigger in skill detection pipeline.
+ *
+ * Run: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/agencySkillTrigger.test.ts
+ */
+
+import {
+  detectAgencyFromList,
+  type AgencyTriggerDefinition,
+  type AgencyDetectionResult,
+} from "@smartspec/skills";
+
+function makeTrigger(pattern: string): { regex: RegExp; pattern: string } {
+  return { regex: new RegExp(pattern, "i"), pattern };
+}
+
+function makeAgency(overrides: Partial<AgencyTriggerDefinition> = {}): AgencyTriggerDefinition {
+  return {
+    agencyId: "agency-1",
+    name: "Research Agency",
+    description: "Multi-agent research team",
+    triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
+    priority: 50,
+    ...overrides,
+  };
+}
+
+describe("Agency Skill Auto-Trigger", () => {
+  it("should detect agency trigger from message matching agency pattern", () => {
+    const agency = makeAgency();
+    const result = detectAgencyFromList("Use the research agency to find data", [agency]);
+
+    expect(result.detected).toBe(true);
+    expect(result.agency).not.toBeNull();
+    expect(result.agency?.agencyId).toBe("agency-1");
+    expect(result.confidence).toBeGreaterThan(0);
+  });
+
+  it("should include agency_id in detection result", () => {
+    const agency = makeAgency({ agencyId: "custom-agency-42" });
+    const result = detectAgencyFromList("research agency please", [agency]);
+
+    expect(result.detected).toBe(true);
+    expect(result.agency?.agencyId).toBe("custom-agency-42");
+  });
+
+  it("should not detect agency when message does not match any trigger", () => {
+    const agency = makeAgency();
+    const result = detectAgencyFromList("hello world, how are you?", [agency]);
+
+    expect(result.detected).toBe(false);
+    expect(result.agency).toBeNull();
+    expect(result.confidence).toBe(0);
+  });
+
+  it("should calculate confidence based on match position", () => {
+    const agency = makeAgency();
+
+    // Match at start should have higher confidence
+    const startResult = detectAgencyFromList("research agency find me data", [agency]);
+    const midResult = detectAgencyFromList("please use research agency now", [agency]);
+
+    expect(startResult.confidence).toBeGreaterThan(midResult.confidence);
+  });
+
+  it("should return best match when multiple agencies match", () => {
+    const agencies: AgencyTriggerDefinition[] = [
+      makeAgency({
+        agencyId: "low-priority",
+        name: "Generic",
+        triggers: [makeTrigger("\\bagency\\b")],
+        priority: 10,
+      }),
+      makeAgency({
+        agencyId: "high-priority",
+        name: "Research",
+        triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
+        priority: 90,
+      }),
+    ];
+
+    // Higher priority agency is checked first (sorted)
+    const result = detectAgencyFromList("ask the research agency", agencies);
+    expect(result.detected).toBe(true);
+    expect(result.agency?.agencyId).toBe("high-priority");
+  });
+
+  it("should extract suggested prompt from message after trigger", () => {
+    const agency = makeAgency({
+      triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
+    });
+    const result = detectAgencyFromList("research agency find papers on AI safety", [agency]);
+
+    expect(result.detected).toBe(true);
+    expect(result.suggestedPrompt).toBeTruthy();
+    expect(result.suggestedPrompt).toContain("papers on AI safety");
+  });
+});
diff --git a/apps/web/server/services/skillDetector.ts b/apps/web/server/services/skillDetector.ts
index b903e09..f976f60 100644
--- a/apps/web/server/services/skillDetector.ts
+++ b/apps/web/server/services/skillDetector.ts
@@ -21,14 +21,31 @@ import {
 import {
   type SkillDetectionResult,
   type SkillSettings,
+  type AgencyTriggerDefinition,
+  type AgencyDetectionResult,
   calculateConfidence as sharedCalculateConfidence,
   extractPrompt as sharedExtractPrompt,
   isExplicitSkillRequest as sharedIsExplicitSkillRequest,
   extractMediaParams,
   formatSkillDetection as sharedFormatSkillDetection,
+  detectAgencyFromList,
 } from "@smartspec/skills";
 
 export type { SkillDetectionResult, SkillSettings } from "@smartspec/skills";
+export type { AgencyTriggerDefinition, AgencyDetectionResult } from "@smartspec/skills";
+
+/**
+ * Extended detection result that may include an agency match.
+ */
+export interface ExtendedSkillDetectionResult extends SkillDetectionResult {
+  agencyMatch?: {
+    agencyId: string;
+    agencyName: string;
+    confidence: number;
+    matchedTrigger: string | null;
+    suggestedPrompt: string | null;
+  };
+}
 
 interface SkillPreference {
   skillId: string;
@@ -142,6 +159,45 @@ const calculateConfidence = sharedCalculateConfidence;
 const extractPrompt = (message: string, matchedTrigger: string, _skill: SkillDefinition) =>
   sharedExtractPrompt(message, matchedTrigger);
 
+/**
+ * Detect skill with optional agency matching.
+ * Extends detectSkill() with agency trigger detection when enabled.
+ * Non-breaking: consumers that don't check agencyMatch continue to work.
+ */
+export async function detectSkillWithAgency(
+  message: string,
+  conversationId?: number,
+  skillSettings?: SkillSettings | null,
+  userId?: number,
+  agencyTriggers?: AgencyTriggerDefinition[]
+): Promise<ExtendedSkillDetectionResult> {
+  // Run standard skill detection
+  const skillResult = await detectSkill(message, conversationId, skillSettings, userId);
+
+  // If no agency triggers provided or empty, return skill-only result
+  if (!agencyTriggers || agencyTriggers.length === 0) {
+    return skillResult;
+  }
+
+  // Run agency detection
+  const agencyResult = detectAgencyFromList(message, agencyTriggers);
+
+  if (agencyResult.detected && agencyResult.agency) {
+    return {
+      ...skillResult,
+      agencyMatch: {
+        agencyId: agencyResult.agency.agencyId,
+        agencyName: agencyResult.agency.name,
+        confidence: agencyResult.confidence,
+        matchedTrigger: agencyResult.matchedTrigger,
+        suggestedPrompt: agencyResult.suggestedPrompt,
+      },
+    };
+  }
+
+  return skillResult;
+}
+
 /**
  * Check if message explicitly requests a skill
  * Delegates to shared logic with current available skills
diff --git a/packages/skills/src/detector.ts b/packages/skills/src/detector.ts
index 24ebc3b..e50250a 100644
--- a/packages/skills/src/detector.ts
+++ b/packages/skills/src/detector.ts
@@ -198,3 +198,67 @@ export function formatSkillDetection(result: SkillDetectionResult): string {
   const pct = Math.round(result.confidence * 100);
   return `[Detected: ${result.skill.name} (${pct}% confidence)]`;
 }
+
+// ---- Agency Detection ----
+
+import type { AgencyTriggerDefinition, AgencyDetectionResult } from "./types";
+
+/**
+ * Detect if a message triggers any agency from a given list.
+ * Structurally identical to detectSkillFromList but for agencies.
+ * Agencies are sorted by priority (higher first) before matching.
+ */
+export function detectAgencyFromList(
+  message: string,
+  agencies: AgencyTriggerDefinition[]
+): AgencyDetectionResult {
+  const noMatch: AgencyDetectionResult = {
+    detected: false,
+    agency: null,
+    confidence: 0,
+    matchedTrigger: null,
+    suggestedPrompt: null,
+  };
+
+  // Sort by priority descending (higher priority checked first)
+  const sorted = [...agencies].sort((a, b) => b.priority - a.priority);
+
+  for (const agency of sorted) {
+    for (const trigger of agency.triggers) {
+      const match = message.match(trigger.regex);
+      if (match) {
+        const confidence = calculateAgencyConfidence(message, match[0]);
+        const suggestedPrompt = extractPrompt(message, match[0]);
+
+        return {
+          detected: true,
+          agency,
+          confidence,
+          matchedTrigger: match[0],
+          suggestedPrompt,
+        };
+      }
+    }
+  }
+
+  return noMatch;
+}
+
+/**
+ * Calculate detection confidence for agency triggers.
+ */
+function calculateAgencyConfidence(message: string, matchedText: string): number {
+  let confidence = 0.7;
+
+  // Higher confidence if match is at the start
+  if (message.toLowerCase().startsWith(matchedText.toLowerCase())) {
+    confidence += 0.15;
+  }
+
+  // Higher confidence for longer, more specific matches
+  if (matchedText.length > 10) {
+    confidence += 0.05;
+  }
+
+  return Math.min(Math.max(confidence, 0), 1);
+}
diff --git a/packages/skills/src/types.ts b/packages/skills/src/types.ts
index e4a490e..036e6ca 100644
--- a/packages/skills/src/types.ts
+++ b/packages/skills/src/types.ts
@@ -166,3 +166,31 @@ export interface SkillSettings {
   enabledSkills: string[];
   detectionMode: "ask" | "auto" | "explicit";
 }
+
+/**
+ * Minimal agency definition for trigger detection.
+ * Not the full agency config -- just enough for matching.
+ */
+export interface AgencyTriggerDefinition {
+  /** Agency ID (UUID) */
+  agencyId: string;
+  /** Agency display name */
+  name: string;
+  /** Agency description */
+  description: string;
+  /** Trigger rules (same format as skill triggers) */
+  triggers: TriggerRule[];
+  /** Priority for detection ordering */
+  priority: number;
+}
+
+/**
+ * Result of agency trigger detection.
+ */
+export interface AgencyDetectionResult {
+  detected: boolean;
+  agency: AgencyTriggerDefinition | null;
+  confidence: number;
+  matchedTrigger: string | null;
+  suggestedPrompt: string | null;
+}
diff --git a/python-backend/app/api/workflows.py b/python-backend/app/api/workflows.py
index ac5e396..f111d74 100644
--- a/python-backend/app/api/workflows.py
+++ b/python-backend/app/api/workflows.py
@@ -2108,3 +2108,44 @@ async def get_available_skills(
             for skill in skills
         ]
     }
+
+
+@router.get("/agencies")
+async def list_agencies_for_workflow(
+    current_user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+):
+    """List published agencies for workflow node dropdown.
+
+    Returns list of {value: agency_id, label: agency_name} for the select input.
+    """
+    from sqlalchemy import text as sa_text
+    from app.core.config import settings as app_settings
+
+    if not getattr(app_settings, "AGENCY_SWARM_ENABLED", False):
+        return {"agencies": []}
+
+    tenant_id = getattr(current_user, "tenantId", None) or getattr(
+        current_user, "tenant_id", None
+    )
+
+    query = sa_text("""
+        SELECT id, name, description
+        FROM agencies
+        WHERE status = 'published'
+          AND (:tenant_id IS NULL OR "tenantId" = :tenant_id)
+        ORDER BY name ASC
+    """)
+    result = await db.execute(query, {"tenant_id": tenant_id})
+    rows = result.mappings().all()
+
+    return {
+        "agencies": [
+            {
+                "value": str(row["id"]),
+                "label": row["name"],
+                "description": row.get("description", ""),
+            }
+            for row in rows
+        ]
+    }
diff --git a/python-backend/app/orchestrator/node_executors/agency_executor.py b/python-backend/app/orchestrator/node_executors/agency_executor.py
new file mode 100644
index 0000000..ffb0b72
--- /dev/null
+++ b/python-backend/app/orchestrator/node_executors/agency_executor.py
@@ -0,0 +1,136 @@
+"""Agency run node executor for workflow integration.
+
+Executes a multi-agent agency as a workflow node step.
+Delegates to AgencyService for the actual run.
+"""
+import asyncio
+import os
+from typing import Any
+
+import structlog
+
+from app.core.config import settings
+from app.core.database import AsyncSessionLocal
+from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
+from app.services.agency_service import AgencyService, RunContext
+
+logger = structlog.get_logger(__name__)
+
+DEFAULT_TIMEOUT_SECONDS = 600
+
+
+async def _get_agency_service() -> AgencyService:
+    """Create an AgencyService with a fresh DB session."""
+    session = AsyncSessionLocal()
+    return AgencyService(session)
+
+
+class AgencyExecutor:
+    """Executor for 'agency_run' workflow nodes.
+
+    Loads an agency by ID, executes it with the provided message input,
+    and returns the agency's final response as the node output.
+    """
+
+    async def execute(
+        self,
+        data: NodeExecutionData,
+        context: ExecutionContext,
+    ) -> dict[str, Any]:
+        """Execute an agency run within a workflow."""
+        # Feature flag check
+        if not getattr(settings, "AGENCY_SWARM_ENABLED", False):
+            return {
+                "outputs": {"result": "", "status": "error"},
+                "error": "Agency workflow node is not enabled",
+            }
+
+        inputs = data.inputs or {}
+        config = data.config or {}
+
+        # Resolve agency_id from inputs or config
+        agency_id = (
+            inputs.get("agency_id")
+            or config.get("agency_id")
+            or inputs.get("agencyId")
+            or config.get("agencyId")
+        )
+        if not agency_id:
+            return {
+                "outputs": {"result": "", "status": "error"},
+                "error": "Agency node requires agency_id in inputs or config",
+            }
+
+        message = inputs.get("message", "")
+        if not message:
+            return {
+                "outputs": {"result": "", "status": "error"},
+                "error": "Agency node requires a message input",
+            }
+
+        # Build RunContext from ExecutionContext
+        user_token = context.extra_data.get("user_token", "")
+        run_context = RunContext(
+            user_id=context.user_id,
+            tenant_id=context.tenant_id or "",
+            conversation_id=context.execution_id,
+            user_token=user_token,
+        )
+
+        # Determine timeout
+        timeout = float(
+            config.get("timeout_seconds")
+            or context.extra_data.get("timeout_seconds")
+            or DEFAULT_TIMEOUT_SECONDS
+        )
+
+        service = await _get_agency_service()
+        try:
+            run_result = await asyncio.wait_for(
+                service.execute_run(
+                    agency_id=str(agency_id),
+                    message=str(message),
+                    context=run_context,
+                ),
+                timeout=timeout,
+            )
+
+            return {
+                "outputs": {
+                    "result": run_result.response,
+                    "status": "success",
+                    "run_metadata": {
+                        "run_id": run_result.run_id,
+                        "agent_steps": run_result.step_count,
+                        "duration_ms": run_result.duration_ms,
+                        "agent_name": run_result.agent_name,
+                        "total_tokens": run_result.total_tokens,
+                    },
+                },
+                "agency_id": str(agency_id),
+                "cost": run_result.total_tokens,
+            }
+
+        except asyncio.TimeoutError:
+            logger.warning(
+                "agency_executor_timeout",
+                agency_id=agency_id,
+                timeout=timeout,
+            )
+            return {
+                "outputs": {"result": "", "status": "error"},
+                "error": f"Agency run timed out after {timeout}s",
+                "agency_id": str(agency_id),
+            }
+        except Exception as exc:
+            logger.error(
+                "agency_executor_failed",
+                agency_id=agency_id,
+                error=str(exc),
+                exc_info=True,
+            )
+            return {
+                "outputs": {"result": "", "status": "error"},
+                "error": f"Agency execution failed: {exc}",
+                "agency_id": str(agency_id),
+            }
diff --git a/python-backend/app/orchestrator/node_registry.py b/python-backend/app/orchestrator/node_registry.py
index 1d1c054..6bd14c2 100644
--- a/python-backend/app/orchestrator/node_registry.py
+++ b/python-backend/app/orchestrator/node_registry.py
@@ -3814,6 +3814,61 @@ class NodeRegistry:
             )
         )
 
+        # Agency Run node
+        self.register_node_type(
+            NodeTypeSpec(
+                type="agency_run",
+                display_name="Agency Run",
+                description="Execute a multi-agent agency",
+                icon="Users",
+                color="purple",
+                category="ai",
+                inputs=[
+                    InputSpec(
+                        name="agency_id",
+                        display_name="Agency",
+                        data_type="text",
+                        ui_type="select",
+                        required=True,
+                        accepts_connection=False,
+                        options_endpoint="/api/v1/workflows/agencies",
+                        placeholder="Select an agency...",
+                    ),
+                    InputSpec(
+                        name="message",
+                        display_name="Message",
+                        data_type="text",
+                        ui_type="textarea",
+                        required=True,
+                        accepts_connection=True,
+                        placeholder="Enter message or connect from previous node...",
+                    ),
+                    InputSpec(
+                        name="timeout_seconds",
+                        display_name="Timeout (seconds)",
+                        data_type="number",
+                        ui_type="number",
+                        required=False,
+                        accepts_connection=False,
+                        default=600,
+                        validation={"min": 10, "max": 3600},
+                    ),
+                ],
+                outputs=[
+                    OutputSpec(
+                        name="result",
+                        display_name="Agency Result",
+                        data_type="text",
+                    ),
+                    OutputSpec(
+                        name="run_metadata",
+                        display_name="Run Metadata",
+                        data_type="json",
+                    ),
+                ],
+                executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
+            )
+        )
 
 
 # Helper function to get executor class by node type
diff --git a/python-backend/tests/unit/test_agency_executor.py b/python-backend/tests/unit/test_agency_executor.py
new file mode 100644
index 0000000..bf59d78
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_executor.py
@@ -0,0 +1,271 @@
+"""Tests for AgencyExecutor workflow node executor.
+
+Run: cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_executor.py -v
+"""
+import asyncio
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
+from app.orchestrator.node_registry import NodeRegistry
+
+
+# ---- Registration Tests ----
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_agency_executor_registered_in_node_registry():
+    """AgencyExecutor is registered as 'agency_run' in NodeRegistry."""
+    registry = NodeRegistry.get_instance()
+    spec = registry.get_node_type("agency_run")
+    assert spec is not None
+    assert spec.type == "agency_run"
+    assert spec.display_name == "Agency Run"
+    assert spec.category == "ai"
+    assert spec.executor == "app.orchestrator.node_executors.agency_executor.AgencyExecutor"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_agency_run_node_has_correct_inputs():
+    """agency_run node has agency_id (required) and message (required, connectable) inputs."""
+    registry = NodeRegistry.get_instance()
+    spec = registry.get_node_type("agency_run")
+    assert spec is not None
+    input_names = [i.name for i in spec.inputs]
+    assert "agency_id" in input_names
+    assert "message" in input_names
+    # agency_id is required, not connectable (user selects from dropdown)
+    agency_id_input = next(i for i in spec.inputs if i.name == "agency_id")
+    assert agency_id_input.required is True
+    assert agency_id_input.accepts_connection is False
+    # message is required and connectable (can receive from upstream node)
+    message_input = next(i for i in spec.inputs if i.name == "message")
+    assert message_input.required is True
+    assert message_input.accepts_connection is True
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_agency_run_node_has_correct_outputs():
+    """agency_run node outputs result (text) and run_metadata (json)."""
+    registry = NodeRegistry.get_instance()
+    spec = registry.get_node_type("agency_run")
+    assert spec is not None
+    output_names = [o.name for o in spec.outputs]
+    assert "result" in output_names
+    assert "run_metadata" in output_names
+
+
+# ---- Execution Tests ----
+
+
+def _make_context(**overrides) -> ExecutionContext:
+    """Create an ExecutionContext with defaults."""
+    defaults = {
+        "user_id": 42,
+        "tenant_id": "tenant-1",
+        "workflow_id": "wf-1",
+        "execution_id": "exec-1",
+        "credits_available": 1000,
+        "extra_data": {"user_token": "tok-abc"},
+    }
+    defaults.update(overrides)
+    return ExecutionContext(**defaults)
+
+
+def _make_data(**overrides) -> NodeExecutionData:
+    """Create NodeExecutionData with defaults."""
+    defaults = {
+        "node_id": "node-1",
+        "node_type": "agency_run",
+        "config": {},
+        "inputs": {"agency_id": "agency-uuid-1", "message": "Hello agents"},
+        "state": {},
+    }
+    defaults.update(overrides)
+    return NodeExecutionData(**defaults)
+
+
+def _make_run_result(**overrides):
+    """Create a mock RunResult."""
+    from pydantic import BaseModel
+
+    class MockRunResult(BaseModel):
+        run_id: str = "run-123"
+        response: str = "Agent response here"
+        agent_name: str = "ceo"
+        total_tokens: int = 500
+        step_count: int = 3
+        duration_ms: int = 2500
+
+    return MockRunResult(**overrides)
+
+
+def _enable_agency_flag():
+    """Patch context manager to enable AGENCY_SWARM_ENABLED."""
+    return patch(
+        "app.orchestrator.node_executors.agency_executor.settings",
+        AGENCY_SWARM_ENABLED=True,
+    )
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_receives_workflow_input_and_returns_output():
+    """AgencyExecutor calls AgencyService.execute_run with correct params and returns result."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    mock_run_result = _make_run_result()
+    mock_service = AsyncMock()
+    mock_service.execute_run = AsyncMock(return_value=mock_run_result)
+
+    with _enable_agency_flag(), patch(
+        "app.orchestrator.node_executors.agency_executor._get_agency_service",
+        return_value=mock_service,
+    ):
+        executor = AgencyExecutor()
+        result = await executor.execute(_make_data(), _make_context())
+
+    assert result["outputs"]["result"] == "Agent response here"
+    assert result["outputs"]["run_metadata"]["run_id"] == "run-123"
+    assert result["outputs"]["run_metadata"]["agent_steps"] == 3
+    assert result["outputs"]["run_metadata"]["duration_ms"] == 2500
+    assert result["agency_id"] == "agency-uuid-1"
+    assert result["cost"] == 500  # total_tokens as proxy for cost
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_respects_workflow_timeout():
+    """AgencyExecutor wraps execute_run in asyncio.wait_for with timeout."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    async def slow_run(*args, **kwargs):
+        await asyncio.sleep(10)
+        return _make_run_result()
+
+    mock_service = AsyncMock()
+    mock_service.execute_run = slow_run
+
+    data = _make_data(inputs={"agency_id": "agency-uuid-1", "message": "Hi"})
+    data.config["timeout_seconds"] = 0.1  # Very short timeout
+
+    with _enable_agency_flag(), patch(
+        "app.orchestrator.node_executors.agency_executor._get_agency_service",
+        return_value=mock_service,
+    ):
+        executor = AgencyExecutor()
+        result = await executor.execute(data, _make_context())
+
+    assert result["outputs"]["status"] == "error"
+    assert "timeout" in result["error"].lower() or "timed out" in result["error"].lower()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_handles_agency_failure_gracefully():
+    """AgencyExecutor returns error output dict (not exception) when agency run fails."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    mock_service = AsyncMock()
+    mock_service.execute_run = AsyncMock(side_effect=RuntimeError("LLM provider down"))
+
+    with _enable_agency_flag(), patch(
+        "app.orchestrator.node_executors.agency_executor._get_agency_service",
+        return_value=mock_service,
+    ):
+        executor = AgencyExecutor()
+        result = await executor.execute(_make_data(), _make_context())
+
+    assert result["outputs"]["result"] == ""
+    assert result["outputs"]["status"] == "error"
+    assert "LLM provider down" in result["error"]
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_missing_agency_id_returns_error():
+    """AgencyExecutor returns error when agency_id is not in inputs or config."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    data = _make_data(inputs={"message": "Hello"}, config={})
+
+    with _enable_agency_flag():
+        executor = AgencyExecutor()
+        result = await executor.execute(data, _make_context())
+
+    assert result["outputs"]["status"] == "error"
+    assert "agency_id" in result["error"].lower()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_passes_user_token_to_agency_service():
+    """AgencyExecutor extracts user_token from context.extra_data and passes to AgencyService."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    mock_service = AsyncMock()
+    mock_service.execute_run = AsyncMock(return_value=_make_run_result())
+
+    ctx = _make_context(extra_data={"user_token": "my-secret-token"})
+
+    with _enable_agency_flag(), patch(
+        "app.orchestrator.node_executors.agency_executor._get_agency_service",
+        return_value=mock_service,
+    ):
+        executor = AgencyExecutor()
+        await executor.execute(_make_data(), ctx)
+
+    call_args = mock_service.execute_run.call_args
+    run_context = call_args[1].get("context") or call_args[0][2]
+    assert run_context.user_token == "my-secret-token"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_passes_tenant_id_from_context():
+    """AgencyExecutor uses context.tenant_id for tenant isolation in agency lookup."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    mock_service = AsyncMock()
+    mock_service.execute_run = AsyncMock(return_value=_make_run_result())
+
+    ctx = _make_context(tenant_id="tenant-xyz")
+
+    with _enable_agency_flag(), patch(
+        "app.orchestrator.node_executors.agency_executor._get_agency_service",
+        return_value=mock_service,
+    ):
+        executor = AgencyExecutor()
+        await executor.execute(_make_data(), ctx)
+
+    call_args = mock_service.execute_run.call_args
+    run_context = call_args[1].get("context") or call_args[0][2]
+    assert run_context.tenant_id == "tenant-xyz"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_agency_executor_checks_feature_flag():
+    """AgencyExecutor returns error when AGENCY_SWARM_ENABLED is false."""
+    from app.orchestrator.node_executors.agency_executor import AgencyExecutor
+
+    with patch(
+        "app.orchestrator.node_executors.agency_executor.settings"
+    ) as mock_settings:
+        mock_settings.AGENCY_SWARM_ENABLED = False
+        executor = AgencyExecutor()
+        result = await executor.execute(_make_data(), _make_context())
+
+    assert result["outputs"]["status"] == "error"
+    assert "disabled" in result["error"].lower() or "not enabled" in result["error"].lower()
