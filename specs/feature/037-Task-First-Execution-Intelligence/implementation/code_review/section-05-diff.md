diff --git a/apps/web/server/services/agencyBridge.test.ts b/apps/web/server/services/agencyBridge.test.ts
new file mode 100644
index 00000000..8716f015
--- /dev/null
+++ b/apps/web/server/services/agencyBridge.test.ts
@@ -0,0 +1,124 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { AgencyBridge, type RunResult } from "./agencyBridge";
+import type { AgencyTaskMetadata } from "./agencyEscalation";
+
+// Mock global fetch
+const mockFetch = vi.fn();
+vi.stubGlobal("fetch", mockFetch);
+
+describe("AgencyBridge", () => {
+  let bridge: AgencyBridge;
+
+  beforeEach(() => {
+    bridge = new AgencyBridge();
+    mockFetch.mockReset();
+  });
+
+  describe("executeRun with task metadata", () => {
+    const baseParams = {
+      agencyId: "agency-1",
+      conversationId: "conv-1",
+      message: "test message",
+      userToken: "tok-123",
+      tenantId: "tenant-1",
+      userId: 42,
+    };
+
+    const taskMetadata: AgencyTaskMetadata = {
+      task_run_id: 99,
+      task_type: "agency",
+      execution_strategy: "cheapest",
+      capability_requirements: { supportsResponses: true },
+      budget_class: "standard",
+      route_reason: "agency task type",
+      plan_version: 1,
+    };
+
+    it("sends task metadata when provided", async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({
+          run_id: "run-1",
+          status: "completed",
+          response: "done",
+          credits_used: 5,
+          duration_ms: 1000,
+        }),
+      });
+
+      await bridge.executeRun({ ...baseParams, taskMetadata });
+
+      expect(mockFetch).toHaveBeenCalledTimes(1);
+      const [, options] = mockFetch.mock.calls[0];
+      const body = JSON.parse(options.body);
+      expect(body.task_metadata).toEqual(taskMetadata);
+    });
+
+    it("omits task_metadata when not provided", async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({
+          run_id: "run-1",
+          status: "completed",
+          response: "done",
+          credits_used: 0,
+          duration_ms: 500,
+        }),
+      });
+
+      await bridge.executeRun(baseParams);
+
+      const [, options] = mockFetch.mock.calls[0];
+      const body = JSON.parse(options.body);
+      expect(body.task_metadata).toBeUndefined();
+    });
+
+    it("returns step attempt snapshots when present in response", async () => {
+      const snapshots = [
+        {
+          model_id: "gpt-4o",
+          provider: "openai",
+          input_tokens: 100,
+          output_tokens: 50,
+          credits_used: 3,
+        },
+      ];
+
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({
+          run_id: "run-1",
+          status: "completed",
+          response: "done",
+          credits_used: 3,
+          duration_ms: 800,
+          step_attempt_snapshots: snapshots,
+        }),
+      });
+
+      const result = await bridge.executeRun({
+        ...baseParams,
+        taskMetadata,
+      });
+
+      expect(result.runId).toBe("run-1");
+      expect(result.stepAttemptSnapshots).toEqual(snapshots);
+    });
+
+    it("returns empty snapshots array when not in response", async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: async () => ({
+          run_id: "run-1",
+          status: "completed",
+          response: "done",
+          credits_used: 0,
+          duration_ms: 500,
+        }),
+      });
+
+      const result = await bridge.executeRun(baseParams);
+      expect(result.stepAttemptSnapshots).toEqual([]);
+    });
+  });
+});
diff --git a/apps/web/server/services/agencyBridge.ts b/apps/web/server/services/agencyBridge.ts
index 20993508..b83ef8cb 100644
--- a/apps/web/server/services/agencyBridge.ts
+++ b/apps/web/server/services/agencyBridge.ts
@@ -7,6 +7,7 @@
  */
 
 import { ENV } from "../_core/env";
+import type { AgencyTaskMetadata } from "./agencyEscalation";
 
 const PYTHON_BACKEND_URL = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
 const GATEWAY_TOKEN = ENV.webGatewayToken;
@@ -19,6 +20,16 @@ interface RunParams {
   userToken: string;
   tenantId: string;
   userId: number;
+  /** Task metadata from the planner — propagated to Python agency service */
+  taskMetadata?: AgencyTaskMetadata;
+}
+
+export interface StepAttemptSnapshot {
+  model_id: string;
+  provider: string;
+  input_tokens: number;
+  output_tokens: number;
+  credits_used: number;
 }
 
 export interface RunResult {
@@ -27,6 +38,8 @@ export interface RunResult {
   response: string;
   creditsUsed: number;
   durationMs: number;
+  /** Step-attempt snapshots from agency execution (for billing reconciliation) */
+  stepAttemptSnapshots: StepAttemptSnapshot[];
 }
 
 interface RunFilters {
@@ -105,15 +118,20 @@ export class AgencyBridge {
   async executeRun(params: RunParams): Promise<RunResult> {
     const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${params.agencyId}/run`;
 
+    const body: Record<string, unknown> = {
+      conversation_id: params.conversationId,
+      message: params.message,
+    };
+    if (params.taskMetadata) {
+      body.task_metadata = params.taskMetadata;
+    }
+
     let response: Response;
     try {
       response = await fetch(url, {
         method: "POST",
         headers: makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
-        body: JSON.stringify({
-          conversation_id: params.conversationId,
-          message: params.message,
-        }),
+        body: JSON.stringify(body),
         signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
       });
     } catch (err: any) {
@@ -131,6 +149,7 @@ export class AgencyBridge {
       response: data.response,
       creditsUsed: data.credits_used ?? 0,
       durationMs: data.duration_ms ?? 0,
+      stepAttemptSnapshots: data.step_attempt_snapshots ?? [],
     };
   }
 
@@ -186,6 +205,7 @@ export class AgencyBridge {
       response: data.response ?? "",
       creditsUsed: data.credits_used ?? data.totalCreditsUsed ?? 0,
       durationMs: data.duration_ms ?? data.durationMs ?? 0,
+      stepAttemptSnapshots: data.step_attempt_snapshots ?? [],
     };
   }
 }
diff --git a/apps/web/server/services/agencyEscalation.test.ts b/apps/web/server/services/agencyEscalation.test.ts
new file mode 100644
index 00000000..7710d767
--- /dev/null
+++ b/apps/web/server/services/agencyEscalation.test.ts
@@ -0,0 +1,169 @@
+import { describe, it, expect } from "vitest";
+import {
+  shouldEscalateToAgency,
+  PLANNER_AGENCY_ESCALATION_FLAG,
+  buildAgencyTaskMetadata,
+  type AgencyEscalationInput,
+  type AgencyTaskMetadata,
+} from "./agencyEscalation";
+import { buildExecutionPlan } from "./taskExecutionPlanner";
+import type { TaskExecutionPlan } from "./taskExecutionPlanner";
+
+describe("agencyEscalation", () => {
+  describe("shouldEscalateToAgency", () => {
+    it("returns true for agency task type", () => {
+      const result = shouldEscalateToAgency({
+        taskType: "agency",
+        complexity: "complex",
+        hasMultipleAgents: true,
+      });
+      expect(result.escalate).toBe(true);
+      expect(result.reason).toContain("agency");
+    });
+
+    it("returns false for simple chat tasks", () => {
+      const result = shouldEscalateToAgency({
+        taskType: "chat",
+        complexity: "simple",
+        hasMultipleAgents: false,
+      });
+      expect(result.escalate).toBe(false);
+    });
+
+    it("returns true for complex tasks with multiple agents", () => {
+      const result = shouldEscalateToAgency({
+        taskType: "skill",
+        complexity: "complex",
+        hasMultipleAgents: true,
+      });
+      expect(result.escalate).toBe(true);
+      expect(result.reason).toContain("complex");
+    });
+
+    it("returns false for complex tasks without agents", () => {
+      const result = shouldEscalateToAgency({
+        taskType: "skill",
+        complexity: "complex",
+        hasMultipleAgents: false,
+      });
+      expect(result.escalate).toBe(false);
+    });
+
+    it("returns false for moderate tasks even with agents", () => {
+      const result = shouldEscalateToAgency({
+        taskType: "skill",
+        complexity: "moderate",
+        hasMultipleAgents: true,
+      });
+      expect(result.escalate).toBe(false);
+    });
+
+    it("includes reason for all decisions", () => {
+      const yes = shouldEscalateToAgency({
+        taskType: "agency",
+        complexity: "complex",
+        hasMultipleAgents: true,
+      });
+      expect(typeof yes.reason).toBe("string");
+      expect(yes.reason.length).toBeGreaterThan(0);
+
+      const no = shouldEscalateToAgency({
+        taskType: "chat",
+        complexity: "simple",
+        hasMultipleAgents: false,
+      });
+      expect(typeof no.reason).toBe("string");
+      expect(no.reason.length).toBeGreaterThan(0);
+    });
+  });
+
+  describe("PLANNER_AGENCY_ESCALATION_FLAG", () => {
+    it("is a well-known string constant", () => {
+      expect(PLANNER_AGENCY_ESCALATION_FLAG).toBe(
+        "PLANNER_AGENCY_ESCALATION_ENABLED",
+      );
+    });
+  });
+
+  describe("buildAgencyTaskMetadata", () => {
+    const makePlan = (): TaskExecutionPlan =>
+      buildExecutionPlan({
+        sourceType: "agency",
+        userId: 1,
+        tenantId: "t1",
+        hasMultipleSteps: true,
+      });
+
+    it("builds metadata from plan and task run id", () => {
+      const plan = makePlan();
+      const meta = buildAgencyTaskMetadata({
+        taskRunId: 42,
+        plan,
+        routeReason: "agency task type",
+      });
+      expect(meta.task_run_id).toBe(42);
+      expect(meta.execution_strategy).toBe(plan.strategy);
+      expect(meta.task_type).toBe(plan.taskType);
+      expect(meta.route_reason).toBe("agency task type");
+    });
+
+    it("includes capability requirements from plan", () => {
+      const plan = buildExecutionPlan({
+        sourceType: "browser_automation",
+        userId: 1,
+        executionPolicy: {
+          mode: "requirements",
+          requirements: { supportsResponses: true },
+        },
+      });
+      const meta = buildAgencyTaskMetadata({
+        taskRunId: 1,
+        plan,
+        routeReason: "test",
+      });
+      expect(meta.capability_requirements).toEqual(
+        expect.objectContaining({ supportsResponses: true }),
+      );
+    });
+
+    it("serializes to JSON for API transport", () => {
+      const plan = makePlan();
+      const meta = buildAgencyTaskMetadata({
+        taskRunId: 99,
+        plan,
+        routeReason: "test",
+      });
+      const json = JSON.stringify(meta);
+      const parsed = JSON.parse(json) as AgencyTaskMetadata;
+      expect(parsed.task_run_id).toBe(99);
+      expect(parsed.execution_strategy).toBe(plan.strategy);
+    });
+
+    it("includes budget class when present in plan", () => {
+      const plan = buildExecutionPlan({
+        sourceType: "skill",
+        userId: 1,
+        executionPolicy: {
+          mode: "requirements",
+          budgetClass: "premium",
+        },
+      });
+      const meta = buildAgencyTaskMetadata({
+        taskRunId: 1,
+        plan,
+        routeReason: "test",
+      });
+      expect(meta.budget_class).toBe("premium");
+    });
+
+    it("omits budget class when not present in plan", () => {
+      const plan = makePlan();
+      const meta = buildAgencyTaskMetadata({
+        taskRunId: 1,
+        plan,
+        routeReason: "test",
+      });
+      expect(meta.budget_class).toBeUndefined();
+    });
+  });
+});
diff --git a/apps/web/server/services/agencyEscalation.ts b/apps/web/server/services/agencyEscalation.ts
new file mode 100644
index 00000000..9040c2c3
--- /dev/null
+++ b/apps/web/server/services/agencyEscalation.ts
@@ -0,0 +1,130 @@
+/**
+ * Agency Escalation
+ *
+ * Decides when the planner should escalate a task into AgencySwarm execution,
+ * builds metadata for the agency bridge, and defines rollout feature flags.
+ *
+ * Built on top of:
+ *   - Section 03: TaskExecutionPlanner (plan classification)
+ *   - Section 04: ArtifactRouter (execution routing)
+ *   - Section 02: CapabilityRegistry (requirements propagation)
+ */
+
+import type { CapabilityRequirements } from "./capabilityRegistry";
+import type {
+  TaskExecutionPlan,
+  TaskType,
+  TaskComplexity,
+  ExecutionStrategy,
+  BudgetClass,
+} from "./taskExecutionPlanner";
+
+// ── Feature flag constants ──────────────────────────────────────
+
+/** Global flag: enables planner-driven agency escalation */
+export const PLANNER_AGENCY_ESCALATION_FLAG =
+  "PLANNER_AGENCY_ESCALATION_ENABLED";
+
+/** Per-task-type flag prefix: e.g. PLANNER_AGENCY_ESCALATION:skill */
+export const PLANNER_AGENCY_ESCALATION_TASK_PREFIX =
+  "PLANNER_AGENCY_ESCALATION";
+
+// ── Escalation decision ─────────────────────────────────────────
+
+export interface AgencyEscalationInput {
+  taskType: TaskType;
+  complexity: TaskComplexity;
+  hasMultipleAgents: boolean;
+}
+
+export interface AgencyEscalationResult {
+  escalate: boolean;
+  reason: string;
+}
+
+/**
+ * Determine whether a task should be escalated to agency execution.
+ *
+ * Escalation triggers:
+ * 1. Task type is explicitly "agency" (direct agency source)
+ * 2. Complex tasks that have multiple agents available
+ *
+ * This is a pure function — feature flag checks happen at the call site.
+ */
+export function shouldEscalateToAgency(
+  input: AgencyEscalationInput,
+): AgencyEscalationResult {
+  // Direct agency source type always escalates
+  if (input.taskType === "agency") {
+    return {
+      escalate: true,
+      reason: "agency task type — direct agency source",
+    };
+  }
+
+  // Complex tasks with multiple agents available escalate
+  if (input.complexity === "complex" && input.hasMultipleAgents) {
+    return {
+      escalate: true,
+      reason: "complex task with multiple agents available",
+    };
+  }
+
+  // All other cases: no escalation
+  return {
+    escalate: false,
+    reason: `no escalation: ${input.taskType}/${input.complexity} (agents=${input.hasMultipleAgents})`,
+  };
+}
+
+// ── Agency task metadata ────────────────────────────────────────
+
+/**
+ * Metadata passed from Node.js planner to Python agency service.
+ * Uses snake_case to match Python API conventions.
+ */
+export interface AgencyTaskMetadata {
+  task_run_id: number;
+  task_type: TaskType;
+  execution_strategy: ExecutionStrategy;
+  capability_requirements?: CapabilityRequirements;
+  budget_class?: BudgetClass;
+  route_reason: string;
+  plan_version: number;
+}
+
+export interface BuildAgencyTaskMetadataInput {
+  taskRunId: number;
+  plan: TaskExecutionPlan;
+  routeReason: string;
+}
+
+/**
+ * Build metadata to propagate from the planner into the agency run request.
+ * This ensures the Python agency service has full context for model selection,
+ * budget alignment, and step-attempt tracking.
+ */
+export function buildAgencyTaskMetadata(
+  input: BuildAgencyTaskMetadataInput,
+): AgencyTaskMetadata {
+  const { taskRunId, plan, routeReason } = input;
+
+  const meta: AgencyTaskMetadata = {
+    task_run_id: taskRunId,
+    task_type: plan.taskType,
+    execution_strategy: plan.strategy,
+    route_reason: routeReason,
+    plan_version: plan.version,
+  };
+
+  // Only include requirements if they have content
+  if (plan.requirements && Object.keys(plan.requirements).length > 0) {
+    meta.capability_requirements = { ...plan.requirements };
+  }
+
+  if (plan.budgetClass) {
+    meta.budget_class = plan.budgetClass;
+  }
+
+  return meta;
+}
diff --git a/apps/web/server/services/skillFrontmatter.test.ts b/apps/web/server/services/skillFrontmatter.test.ts
new file mode 100644
index 00000000..f7ece94d
--- /dev/null
+++ b/apps/web/server/services/skillFrontmatter.test.ts
@@ -0,0 +1,258 @@
+import { describe, it, expect } from "vitest";
+import { parseSkillFile, parseExecutionPolicyContentFields, parseContentQuality } from "@smartspec/skills";
+
+describe("parseSkillFile — Spec 038 frontmatter fields", () => {
+  it("parses frontmatter with all Spec 038 execution_policy fields", () => {
+    const content = `---
+name: test-skill
+category: product_review
+execution_policy:
+  requires_web_search: true
+  requires_citations: true
+  requires_structured_output: true
+  thinking_level_hint: high
+  output_format: cms_review
+  max_tokens_hint: 8000
+---
+# Test Skill`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.name).toBe("test-skill");
+    const ep = result.metadata.execution_policy!;
+    expect(ep.requires_web_search).toBe(true);
+    expect(ep.requires_citations).toBe(true);
+    expect(ep.requires_structured_output).toBe(true);
+    expect(ep.thinking_level_hint).toBe("high");
+    expect(ep.output_format).toBe("cms_review");
+    expect(ep.max_tokens_hint).toBe(8000);
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("parses frontmatter with content_quality fields", () => {
+    const content = `---
+name: review-skill
+content_quality:
+  citation_required_for:
+    - critical
+    - major
+  min_citation_coverage: 0.7
+  disclosure_required: true
+  refresh_cadence_days: 30
+---
+# Review Skill`;
+
+    const result = parseSkillFile(content);
+    const cq = result.metadata.content_quality!;
+    expect(cq.citation_required_for).toEqual(["critical", "major"]);
+    expect(cq.min_citation_coverage).toBe(0.7);
+    expect(cq.disclosure_required).toBe(true);
+    expect(cq.refresh_cadence_days).toBe(30);
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("parses frontmatter with partial Spec 038 fields", () => {
+    const content = `---
+name: partial-skill
+execution_policy:
+  requires_web_search: true
+content_quality:
+  min_citation_coverage: 0.5
+---
+# Partial`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.execution_policy!.requires_web_search).toBe(true);
+    expect(result.metadata.execution_policy!.requires_citations).toBeUndefined();
+    expect(result.metadata.content_quality!.min_citation_coverage).toBe(0.5);
+    expect(result.metadata.content_quality!.citation_required_for).toBeUndefined();
+  });
+
+  it("parses legacy frontmatter without new fields (backward compatible)", () => {
+    const content = `---
+name: legacy-skill
+category: chat_assistant
+priority: 50
+---
+# Legacy Skill`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.name).toBe("legacy-skill");
+    expect(result.metadata.execution_policy).toBeUndefined();
+    expect(result.metadata.content_quality).toBeUndefined();
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("produces warnings for invalid thinking_level_hint", () => {
+    const content = `---
+name: bad-hint
+execution_policy:
+  thinking_level_hint: extreme
+---
+# Bad Hint`;
+
+    const result = parseSkillFile(content);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid thinking_level_hint");
+  });
+
+  it("produces warnings for invalid output_format", () => {
+    const content = `---
+name: bad-format
+execution_policy:
+  output_format: html
+---
+# Bad Format`;
+
+    const result = parseSkillFile(content);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid output_format");
+  });
+
+  it("produces warnings for invalid citation_required_for values", () => {
+    const content = `---
+name: bad-citation
+content_quality:
+  citation_required_for:
+    - critical
+    - trivial
+---
+# Bad Citation`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.content_quality!.citation_required_for).toEqual(["critical"]);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid citation_required_for");
+  });
+
+  it("produces warnings for out-of-range min_citation_coverage", () => {
+    const content = `---
+name: bad-coverage
+content_quality:
+  min_citation_coverage: 1.5
+---
+# Bad Coverage`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.content_quality).toBeUndefined();
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("min_citation_coverage");
+  });
+
+  it("handles both execution_policy and content_quality together", () => {
+    const content = `---
+name: full-skill
+execution_policy:
+  mode: requirements
+  requires_web_search: true
+  requires_citations: true
+  thinking_level_hint: medium
+  output_format: cms_article
+  requirements:
+    supportsWebSearch: true
+content_quality:
+  citation_required_for:
+    - critical
+    - major
+  min_citation_coverage: 0.6
+  disclosure_required: false
+  refresh_cadence_days: 30
+---
+# Full Skill`;
+
+    const result = parseSkillFile(content);
+    const ep = result.metadata.execution_policy!;
+    expect(ep.mode).toBe("requirements");
+    expect(ep.requires_web_search).toBe(true);
+    expect(ep.requirements?.supportsWebSearch).toBe(true);
+
+    const cq = result.metadata.content_quality!;
+    expect(cq.citation_required_for).toEqual(["critical", "major"]);
+    expect(cq.min_citation_coverage).toBe(0.6);
+    expect(cq.disclosure_required).toBe(false);
+    expect(result.warnings).toBeUndefined();
+  });
+});
+
+describe("parseExecutionPolicyContentFields", () => {
+  it("returns undefined for undefined input", () => {
+    expect(parseExecutionPolicyContentFields(undefined)).toBeUndefined();
+  });
+
+  it("returns undefined for empty object", () => {
+    expect(parseExecutionPolicyContentFields({})).toBeUndefined();
+  });
+
+  it("parses valid fields", () => {
+    const result = parseExecutionPolicyContentFields({
+      requires_web_search: true,
+      thinking_level_hint: "low",
+      output_format: "markdown",
+    });
+    expect(result).toEqual({
+      requires_web_search: true,
+      thinking_level_hint: "low",
+      output_format: "markdown",
+    });
+  });
+
+  it("coerces booleans", () => {
+    const result = parseExecutionPolicyContentFields({
+      requires_web_search: 1,
+      requires_citations: 0,
+    });
+    expect(result!.requires_web_search).toBe(true);
+    expect(result!.requires_citations).toBe(false);
+  });
+});
+
+describe("parseContentQuality", () => {
+  it("returns undefined quality for undefined input", () => {
+    const { quality } = parseContentQuality(undefined);
+    expect(quality).toBeUndefined();
+  });
+
+  it("returns undefined quality for empty object", () => {
+    const { quality } = parseContentQuality({});
+    expect(quality).toBeUndefined();
+  });
+
+  it("parses all valid fields", () => {
+    const { quality, warnings } = parseContentQuality({
+      citation_required_for: ["critical", "minor"],
+      min_citation_coverage: 0.8,
+      disclosure_required: true,
+      refresh_cadence_days: 60,
+    });
+    expect(quality).toEqual({
+      citation_required_for: ["critical", "minor"],
+      min_citation_coverage: 0.8,
+      disclosure_required: true,
+      refresh_cadence_days: 60,
+    });
+    expect(warnings).toHaveLength(0);
+  });
+
+  it("filters invalid citation levels with warning", () => {
+    const { quality, warnings } = parseContentQuality({
+      citation_required_for: ["critical", "unknown"],
+    });
+    expect(quality!.citation_required_for).toEqual(["critical"]);
+    expect(warnings).toHaveLength(1);
+  });
+
+  it("rejects min_citation_coverage > 1", () => {
+    const { quality, warnings } = parseContentQuality({
+      min_citation_coverage: 2.0,
+    });
+    expect(quality).toBeUndefined();
+    expect(warnings).toHaveLength(1);
+  });
+
+  it("rejects negative min_citation_coverage", () => {
+    const { quality, warnings } = parseContentQuality({
+      min_citation_coverage: -0.1,
+    });
+    expect(quality).toBeUndefined();
+    expect(warnings).toHaveLength(1);
+  });
+});
diff --git a/packages/skills/src/parser.ts b/packages/skills/src/parser.ts
index 5b6e7a2d..5145d277 100644
--- a/packages/skills/src/parser.ts
+++ b/packages/skills/src/parser.ts
@@ -6,19 +6,45 @@
  */
 
 import yaml from "js-yaml";
-import type { SkillMetadata, TriggerRule, PatternRule } from "./types";
+import type { SkillMetadata, TriggerRule, PatternRule, SkillExecutionPolicyConfig, SkillContentQuality } from "./types";
 
 /**
  * Parse a skill.md file — extract YAML frontmatter and markdown content
  */
-export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
+export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string; warnings?: string[] } {
   if (content.startsWith("---")) {
     const parts = content.split("---");
     if (parts.length >= 3) {
       try {
         const frontmatter = yaml.load(parts[1], { schema: yaml.JSON_SCHEMA }) as SkillMetadata;
         const body = parts.slice(2).join("---").trim();
-        return { metadata: frontmatter || {}, content: body };
+        const metadata = frontmatter || {} as SkillMetadata;
+        const warnings: string[] = [];
+
+        // Validate and merge Spec 038 execution_policy content fields
+        const execPolicy = metadata.execution_policy ?? metadata.executionPolicy;
+        if (execPolicy && typeof execPolicy === "object") {
+          const contentFields = parseExecutionPolicyContentFields(execPolicy as Record<string, unknown>);
+          if (contentFields) {
+            const w = (contentFields as any).__warnings as string[] | undefined;
+            if (w) {
+              warnings.push(...w);
+              delete (contentFields as any).__warnings;
+            }
+          }
+        }
+
+        // Validate content_quality
+        const rawCQ = metadata.content_quality ?? metadata.contentQuality;
+        if (rawCQ && typeof rawCQ === "object") {
+          const { quality, warnings: cqWarnings } = parseContentQuality(rawCQ as Record<string, unknown>);
+          warnings.push(...cqWarnings);
+          // Replace raw YAML with validated version (or clear if invalid)
+          metadata.content_quality = quality;
+          metadata.contentQuality = quality;
+        }
+
+        return { metadata, content: body, warnings: warnings.length > 0 ? warnings : undefined };
       } catch {
         return { metadata: {} as SkillMetadata, content };
       }
@@ -176,6 +202,101 @@ export function parseTriggerPatternsLegacy(patterns: string[] | null | undefined
     .filter((r): r is RegExp => r !== null);
 }
 
+const VALID_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
+const VALID_OUTPUT_FORMATS = ["cms_article", "cms_review", "markdown", "json"] as const;
+const VALID_CITATION_LEVELS = ["critical", "major", "minor"] as const;
+
+/**
+ * Parse and validate execution_policy fields from Spec 038 (content quality).
+ * Invalid enum values are silently dropped (warning-level, not error).
+ */
+export function parseExecutionPolicyContentFields(
+  raw: Record<string, unknown> | undefined
+): Pick<SkillExecutionPolicyConfig, "requires_web_search" | "requires_citations" | "requires_structured_output" | "thinking_level_hint" | "output_format" | "max_tokens_hint"> | undefined {
+  if (!raw || typeof raw !== "object") return undefined;
+
+  const result: Record<string, unknown> = {};
+  const warnings: string[] = [];
+
+  if ("requires_web_search" in raw) result.requires_web_search = Boolean(raw.requires_web_search);
+  if ("requires_citations" in raw) result.requires_citations = Boolean(raw.requires_citations);
+  if ("requires_structured_output" in raw) result.requires_structured_output = Boolean(raw.requires_structured_output);
+
+  if ("thinking_level_hint" in raw) {
+    const val = String(raw.thinking_level_hint);
+    if ((VALID_THINKING_LEVELS as readonly string[]).includes(val)) {
+      result.thinking_level_hint = val;
+    } else {
+      warnings.push(`Invalid thinking_level_hint: "${val}"`);
+    }
+  }
+
+  if ("output_format" in raw) {
+    const val = String(raw.output_format);
+    if ((VALID_OUTPUT_FORMATS as readonly string[]).includes(val)) {
+      result.output_format = val;
+    } else {
+      warnings.push(`Invalid output_format: "${val}"`);
+    }
+  }
+
+  if ("max_tokens_hint" in raw) {
+    const num = Number(raw.max_tokens_hint);
+    if (!isNaN(num) && num > 0) result.max_tokens_hint = num;
+  }
+
+  if (warnings.length > 0) {
+    (result as Record<string, unknown>).__warnings = warnings;
+  }
+
+  return Object.keys(result).length > 0 ? result as any : undefined;
+}
+
+/**
+ * Parse and validate content_quality fields from Spec 038.
+ */
+export function parseContentQuality(
+  raw: Record<string, unknown> | undefined
+): { quality: SkillContentQuality | undefined; warnings: string[] } {
+  if (!raw || typeof raw !== "object") return { quality: undefined, warnings: [] };
+
+  const result: SkillContentQuality = {};
+  const warnings: string[] = [];
+
+  if ("citation_required_for" in raw && Array.isArray(raw.citation_required_for)) {
+    const valid = raw.citation_required_for.filter((v: unknown) =>
+      (VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
+    );
+    const invalid = raw.citation_required_for.filter((v: unknown) =>
+      !(VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
+    );
+    if (invalid.length > 0) {
+      warnings.push(`Invalid citation_required_for values: ${invalid.join(", ")}`);
+    }
+    if (valid.length > 0) result.citation_required_for = valid as ("critical" | "major" | "minor")[];
+  }
+
+  if ("min_citation_coverage" in raw) {
+    const num = Number(raw.min_citation_coverage);
+    if (!isNaN(num) && num >= 0 && num <= 1) {
+      result.min_citation_coverage = num;
+    } else {
+      warnings.push(`Invalid min_citation_coverage: "${raw.min_citation_coverage}" (must be 0.0-1.0)`);
+    }
+  }
+
+  if ("disclosure_required" in raw) result.disclosure_required = Boolean(raw.disclosure_required);
+  if ("refresh_cadence_days" in raw) {
+    const num = Number(raw.refresh_cadence_days);
+    if (!isNaN(num) && num > 0) result.refresh_cadence_days = num;
+  }
+
+  return {
+    quality: Object.keys(result).length > 0 ? result : undefined,
+    warnings,
+  };
+}
+
 /**
  * Normalize skill metadata from frontmatter (handles snake_case / camelCase variants)
  */
diff --git a/packages/skills/src/types.ts b/packages/skills/src/types.ts
index 61820bc9..a8ad8a79 100644
--- a/packages/skills/src/types.ts
+++ b/packages/skills/src/types.ts
@@ -132,6 +132,9 @@ export interface SkillDefinition {
    * instead of relying solely on llmModelId/defaultModel.
    */
   executionPolicy?: SkillExecutionPolicyConfig;
+
+  /** Content quality constraints for citation-gated publishing */
+  contentQuality?: SkillContentQuality;
 }
 
 /**
@@ -183,6 +186,44 @@ export interface SkillExecutionPolicyConfig {
 
   /** Fallback behavior: "error" | "use_default" */
   fallbackPolicy?: "error" | "use_default";
+
+  // --- Spec 038: Citation-gated content quality fields ---
+
+  /** Whether this skill requires web search grounding for citations */
+  requires_web_search?: boolean;
+
+  /** Whether this skill requires citations on claims */
+  requires_citations?: boolean;
+
+  /** Whether this skill requires structured (JSON) output */
+  requires_structured_output?: boolean;
+
+  /** Hint for provider thinking/reasoning level */
+  thinking_level_hint?: "minimal" | "low" | "medium" | "high";
+
+  /** Output format hint for CMS integration */
+  output_format?: "cms_article" | "cms_review" | "markdown" | "json";
+
+  /** Hint for max tokens to request from the model */
+  max_tokens_hint?: number;
+}
+
+/**
+ * Content quality constraints for citation-gated publishing.
+ * Declared in skill.md frontmatter under `content_quality:`.
+ */
+export interface SkillContentQuality {
+  /** Claim severity levels that require citations */
+  citation_required_for?: ("critical" | "major" | "minor")[];
+
+  /** Minimum fraction of claims that must have citations (0.0 - 1.0) */
+  min_citation_coverage?: number;
+
+  /** Whether the output must include a disclosure statement */
+  disclosure_required?: boolean;
+
+  /** How often (days) this content should be refreshed. null = never */
+  refresh_cadence_days?: number;
 }
 
 /**
@@ -228,6 +269,9 @@ export interface SkillMetadata {
   requires_browser?: boolean;
   max_runtime_seconds?: number;
   max_input_mb?: number;
+  // Content quality constraints (Spec 038)
+  content_quality?: SkillContentQuality;
+  contentQuality?: SkillContentQuality;
 }
 
 export interface SkillDetectionResult {
diff --git a/python-backend/app/api/agencies.py b/python-backend/app/api/agencies.py
index 10ac1085..316a3df1 100644
--- a/python-backend/app/api/agencies.py
+++ b/python-backend/app/api/agencies.py
@@ -39,6 +39,18 @@ logger = structlog.get_logger(__name__)
 _PERSONA_BLOCKED_PATTERNS = ["[SYSTEM]", "[INST]", "<<SYS>>", "</s>", "[/INST]"]
 
 
+class TaskMetadata(BaseModel):
+    """Planner metadata propagated from Node.js into agency runs."""
+
+    task_run_id: Optional[int] = Field(None, description="Task run ID for linking")
+    task_type: Optional[str] = Field(None, description="Planner task type")
+    execution_strategy: Optional[str] = Field(None, description="cheapest|fastest|best")
+    capability_requirements: Optional[dict] = Field(None, description="Required model capabilities")
+    budget_class: Optional[str] = Field(None, description="economy|standard|premium")
+    route_reason: Optional[str] = Field(None, description="Why this task was routed to agency")
+    plan_version: Optional[int] = Field(None, description="Plan schema version")
+
+
 class AgencyRunRequest(BaseModel):
     """Request body for POST /run and POST /stream."""
 
@@ -52,6 +64,9 @@ class AgencyRunRequest(BaseModel):
     persona_prefix: Optional[str] = Field(
         None, max_length=3000, description="Persona prompt prefix to prepend to agent instructions"
     )
+    task_metadata: Optional[TaskMetadata] = Field(
+        None, description="Planner metadata from Node.js task execution system"
+    )
 
     @property
     def safe_persona_prefix(self) -> Optional[str]:
@@ -231,6 +246,18 @@ async def run_agency(
         user_token=credentials.credentials,
     )
 
+    # Log planner metadata for telemetry (if provided)
+    if request.task_metadata:
+        logger.info(
+            "agency_run_with_planner_metadata",
+            agency_id=agency_id,
+            task_run_id=request.task_metadata.task_run_id,
+            task_type=request.task_metadata.task_type,
+            execution_strategy=request.task_metadata.execution_strategy,
+            route_reason=request.task_metadata.route_reason,
+            budget_class=request.task_metadata.budget_class,
+        )
+
     try:
         result = await with_retry(
             lambda: service.execute_run(agency_id, request.message, context)
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index 5e12030c..29eb74fc 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -39,7 +39,14 @@ EdgeRow = dict[str, Any]
 class ExecutionContext:
     """Mutable context passed between nodes during execution."""
 
-    def __init__(self, input_message: str, user_token: str, tenant_id: str, user_id: int = 0):
+    def __init__(
+        self,
+        input_message: str,
+        user_token: str,
+        tenant_id: str,
+        user_id: int = 0,
+        task_metadata: dict[str, Any] | None = None,
+    ):
         self.input = input_message
         self.user_token = user_token
         self.tenant_id = tenant_id
@@ -47,6 +54,10 @@ class ExecutionContext:
         self.results: dict[str, str] = {}   # node_id → result text
         self.knowledge: list[dict] = []     # populated by knowledge_base nodes
         self.history: list[dict] = []       # conversation history
+        # Planner metadata from Node.js (task_run_id, strategy, requirements, etc.)
+        self.task_metadata: dict[str, Any] = task_metadata or {}
+        # Step-attempt snapshots collected during execution (for billing reconciliation)
+        self.step_attempts: list[dict[str, Any]] = []
 
     def get_context_text(self) -> str:
         """Build a context string from accumulated knowledge and results."""
@@ -95,12 +106,31 @@ class AgencyOrchestrator:
             for n in self.nodes.values()
         )
 
-    async def run(self, message: str, user_token: str, tenant_id: str, user_id: int = 0) -> str:
+    async def run(
+        self,
+        message: str,
+        user_token: str,
+        tenant_id: str,
+        user_id: int = 0,
+        task_metadata: dict[str, Any] | None = None,
+    ) -> str:
         """Execute the agency graph starting from the entry node.
 
         Returns final response text.
         """
-        ctx = ExecutionContext(message, user_token, tenant_id, user_id=user_id)
+        ctx = ExecutionContext(
+            message, user_token, tenant_id,
+            user_id=user_id, task_metadata=task_metadata,
+        )
+
+        if task_metadata:
+            logger.info(
+                "agency_orchestrator_with_planner_context",
+                task_run_id=task_metadata.get("task_run_id"),
+                execution_strategy=task_metadata.get("execution_strategy"),
+                budget_class=task_metadata.get("budget_class"),
+            )
+
         result = await self._execute_node(self.entry_node, ctx)
         return result or ""
 
diff --git a/python-backend/tests/test_agency_escalation.py b/python-backend/tests/test_agency_escalation.py
new file mode 100644
index 00000000..de285918
--- /dev/null
+++ b/python-backend/tests/test_agency_escalation.py
@@ -0,0 +1,76 @@
+"""Tests for agency escalation planner metadata propagation."""
+
+import pytest
+
+from app.api.agencies import TaskMetadata
+from app.services.agency_orchestrator import ExecutionContext
+
+
+class TestTaskMetadataModel:
+    """TaskMetadata Pydantic model validation."""
+
+    def test_full_metadata(self):
+        meta = TaskMetadata(
+            task_run_id=42,
+            task_type="agency",
+            execution_strategy="cheapest",
+            capability_requirements={"supportsResponses": True},
+            budget_class="standard",
+            route_reason="agency task type",
+            plan_version=1,
+        )
+        assert meta.task_run_id == 42
+        assert meta.task_type == "agency"
+        assert meta.execution_strategy == "cheapest"
+        assert meta.budget_class == "standard"
+        assert meta.plan_version == 1
+
+    def test_minimal_metadata(self):
+        meta = TaskMetadata()
+        assert meta.task_run_id is None
+        assert meta.task_type is None
+        assert meta.execution_strategy is None
+
+    def test_serialization(self):
+        meta = TaskMetadata(
+            task_run_id=1,
+            task_type="skill",
+            execution_strategy="best",
+        )
+        data = meta.model_dump(exclude_none=True)
+        assert data == {
+            "task_run_id": 1,
+            "task_type": "skill",
+            "execution_strategy": "best",
+        }
+
+
+class TestExecutionContextMetadata:
+    """ExecutionContext carries task metadata and step attempts."""
+
+    def test_default_empty_metadata(self):
+        ctx = ExecutionContext("hello", "token", "tenant-1")
+        assert ctx.task_metadata == {}
+        assert ctx.step_attempts == []
+
+    def test_with_task_metadata(self):
+        meta = {
+            "task_run_id": 99,
+            "task_type": "agency",
+            "execution_strategy": "fastest",
+        }
+        ctx = ExecutionContext("hello", "token", "tenant-1", task_metadata=meta)
+        assert ctx.task_metadata["task_run_id"] == 99
+        assert ctx.task_metadata["execution_strategy"] == "fastest"
+
+    def test_step_attempts_accumulate(self):
+        ctx = ExecutionContext("hello", "token", "tenant-1")
+        ctx.step_attempts.append({
+            "model_id": "gpt-4o",
+            "provider": "openai",
+            "input_tokens": 100,
+            "output_tokens": 50,
+            "credits_used": 3.0,
+        })
+        assert len(ctx.step_attempts) == 1
+        assert ctx.step_attempts[0]["model_id"] == "gpt-4o"
