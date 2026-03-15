diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index ad423182..2ea0bf54 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -28,6 +28,8 @@ import {
 import { eq, and, desc, asc, inArray, sql, getTableColumns, count } from "drizzle-orm";
 import { agencyBridge } from "../services/agencyBridge";
 import type { RunResult } from "../services/agencyBridge";
+import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
+import { buildAgencyTaskMetadata } from "../services/agencyEscalation";
 import {
   AgencyPreviewCommitError,
   commitLibraryBackedPreview,
@@ -692,6 +694,7 @@ export const agencyRouter = router({
       await db.insert(agencies).values({
         id: newAgencyId,
         tenantId,
+        sourceTemplateId: template.id,
         name: template.name,
         slug,
         description: template.description,
@@ -1403,6 +1406,22 @@ export const agencyRouter = router({
         dbClient: db,
       });
 
+      // Wire task planner for agency execution tracking
+      const plannerResult = await runPlanner({
+        sourceType: "agency",
+        userId,
+        tenantId,
+      }).catch(() => null);
+
+      const taskMetadata = plannerResult
+        ? buildAgencyTaskMetadata({
+            taskRunId: plannerResult.taskRunId,
+            plan: plannerResult.plan,
+            routeReason: "agency:direct_request",
+          })
+        : undefined;
+
+      const agencyStartTime = Date.now();
       const result = await agencyBridge.executeRun({
         agencyId: input.agencyId,
         conversationId: input.conversationId,
@@ -1411,8 +1430,20 @@ export const agencyRouter = router({
         userToken,
         tenantId,
         userId,
+        taskMetadata,
       });
 
+      if (plannerResult) {
+        recordStepAttempt({
+          taskRunId: plannerResult.taskRunId,
+          plan: plannerResult.plan,
+          model: "agency",
+          inputTokens: 0,
+          outputTokens: 0,
+          durationMs: Date.now() - agencyStartTime,
+        }).catch(() => {});
+      }
+
       // --- Channel bridge fan-out (section-08) ---
       try {
         const { channelGateway } = await import("../services/channelGateway");
diff --git a/apps/web/server/routers/webhookTriggers.ts b/apps/web/server/routers/webhookTriggers.ts
index d98814b1..2fd222ca 100644
--- a/apps/web/server/routers/webhookTriggers.ts
+++ b/apps/web/server/routers/webhookTriggers.ts
@@ -28,6 +28,8 @@ import {
 import { getTenantFeatureFlag } from "../services/featureFlags";
 import { channelGateway } from "../services/channelGateway";
 import { agencyBridge } from "../services/agencyBridge";
+import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
+import { buildAgencyTaskMetadata } from "../services/agencyEscalation";
 import { ENV } from "../_core/env";
 
 const WEBHOOK_BASE_URL = "https://smartaihub.app/api/webhooks/trigger";
@@ -323,6 +325,19 @@ export const webhookTriggersRouter = router({
 
       try {
         if (trigger.targetType === "agency" && trigger.targetAgencyId) {
+          const testPlannerResult = await runPlanner({
+            sourceType: "webhook",
+            userId,
+            tenantId,
+          }).catch(() => null);
+          const testTaskMetadata = testPlannerResult
+            ? buildAgencyTaskMetadata({
+                taskRunId: testPlannerResult.taskRunId,
+                plan: testPlannerResult.plan,
+                routeReason: "agency:webhook_test",
+              })
+            : undefined;
+
           const result = await agencyBridge.executeRun({
             agencyId: trigger.targetAgencyId,
             conversationId: trigger.targetAgencyId,
@@ -330,6 +345,7 @@ export const webhookTriggersRouter = router({
             userToken: "",
             tenantId,
             userId,
+            taskMetadata: testTaskMetadata,
           });
           dispatchResult = { ok: true, executionId: result.runId };
 
diff --git a/apps/web/server/services/channelGateway.ts b/apps/web/server/services/channelGateway.ts
index 37063386..ff5799f2 100644
--- a/apps/web/server/services/channelGateway.ts
+++ b/apps/web/server/services/channelGateway.ts
@@ -42,6 +42,7 @@ import {
 } from "./creditService";
 import { resolveEnabledLlmModelId } from "./enabledLlmModels";
 import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
+import { buildAgencyTaskMetadata } from "./agencyEscalation";
 import { agencyBridge } from "./agencyBridge";
 import {
   agencies,
@@ -173,6 +174,19 @@ async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
         if (routeResult.targetType === "agency" && routeResult.targetId) {
           // Override: route to the specified agency regardless of channel binding
           try {
+            const routePlannerResult = await runPlanner({
+              sourceType: "channel",
+              userId: connection.userId,
+              tenantId: connection.tenantId,
+            }).catch(() => null);
+            const routeTaskMetadata = routePlannerResult
+              ? buildAgencyTaskMetadata({
+                  taskRunId: routePlannerResult.taskRunId,
+                  plan: routePlannerResult.plan,
+                  routeReason: "agency:channel_router_override",
+                })
+              : undefined;
+
             const result = await agencyBridge.executeRun({
               agencyId: routeResult.targetId,
               conversationId: channel.agencyConversationId ?? routeResult.targetId,
@@ -180,6 +194,7 @@ async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
               userToken: "",
               tenantId: connection.tenantId,
               userId: connection.userId,
+              taskMetadata: routeTaskMetadata,
             });
             if (result.response) {
               await emitEgress({
@@ -238,6 +253,19 @@ async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
           return { ok: false, error: "Agency conversation not found", errorCode: "pipeline_error" };
         }
 
+        const agencyPlannerResult = await runPlanner({
+          sourceType: "channel",
+          userId: connection.userId,
+          tenantId: connection.tenantId,
+        }).catch(() => null);
+        const agencyTaskMetadata = agencyPlannerResult
+          ? buildAgencyTaskMetadata({
+              taskRunId: agencyPlannerResult.taskRunId,
+              plan: agencyPlannerResult.plan,
+              routeReason: "agency:channel_gateway",
+            })
+          : undefined;
+
         const result = await agencyBridge.executeRun({
           agencyId: agencyConv.agencyId,
           conversationId: channel.agencyConversationId,
@@ -245,6 +273,7 @@ async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
           userToken: "", // Server-side call — no user token needed
           tenantId: connection.tenantId,
           userId: connection.userId,
+          taskMetadata: agencyTaskMetadata,
         });
 
         // Emit the agency response to Telegram
diff --git a/apps/web/server/services/plannerTelemetry.test.ts b/apps/web/server/services/plannerTelemetry.test.ts
new file mode 100644
index 00000000..5ac03433
--- /dev/null
+++ b/apps/web/server/services/plannerTelemetry.test.ts
@@ -0,0 +1,79 @@
+/**
+ * Tests for plannerTelemetry.ts — shadow mode validation queries
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const mockSelect = vi.fn();
+const mockDb = {
+  select: mockSelect,
+};
+
+vi.mock("../db", () => ({
+  getDb: vi.fn().mockResolvedValue(null),
+}));
+
+vi.mock("../../drizzle/schema", () => ({
+  taskRuns: { id: "id", taskType: "taskType", planJson: "planJson", totalCreditsUsed: "totalCreditsUsed", createdAt: "createdAt" },
+  taskStepAttempts: { taskRunId: "taskRunId", effectiveModel: "effectiveModel", creditsUsed: "creditsUsed", durationMs: "durationMs" },
+}));
+
+import {
+  getPlannerAccuracyReport,
+  getCostComparisonReport,
+  getPlannerLatencyReport,
+} from "./plannerTelemetry";
+import { getDb } from "../db";
+
+describe("plannerTelemetry", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("getPlannerAccuracyReport", () => {
+    it("returns empty report when db is null", async () => {
+      vi.mocked(getDb).mockResolvedValueOnce(null as any);
+      const report = await getPlannerAccuracyReport();
+      expect(report.totalRuns).toBe(0);
+      expect(report.accuracyPercent).toBe(0);
+      expect(report.byTaskType).toEqual({});
+    });
+
+    it("returns empty report when no data", async () => {
+      mockSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          innerJoin: vi.fn().mockReturnValue({
+            where: vi.fn().mockReturnValue({
+              orderBy: vi.fn().mockResolvedValue([]),
+            }),
+          }),
+        }),
+      });
+      vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
+      const report = await getPlannerAccuracyReport(24);
+      expect(report.totalRuns).toBe(0);
+      expect(report.accuracyPercent).toBe(0);
+    });
+  });
+
+  describe("getCostComparisonReport", () => {
+    it("returns empty report when db is null", async () => {
+      vi.mocked(getDb).mockResolvedValueOnce(null as any);
+      const report = await getCostComparisonReport();
+      expect(report.totalPlannerCredits).toBe(0);
+      expect(report.totalActualCredits).toBe(0);
+      expect(report.deltaPercent).toBe(0);
+      expect(report.outliers).toEqual([]);
+    });
+  });
+
+  describe("getPlannerLatencyReport", () => {
+    it("returns empty report when db is null", async () => {
+      vi.mocked(getDb).mockResolvedValueOnce(null as any);
+      const report = await getPlannerLatencyReport();
+      expect(report.avgPlannerMs).toBe(0);
+      expect(report.p95PlannerMs).toBe(0);
+      expect(report.p99PlannerMs).toBe(0);
+      expect(report.totalRequests).toBe(0);
+    });
+  });
+});
diff --git a/apps/web/server/services/plannerTelemetry.ts b/apps/web/server/services/plannerTelemetry.ts
new file mode 100644
index 00000000..222b6af3
--- /dev/null
+++ b/apps/web/server/services/plannerTelemetry.ts
@@ -0,0 +1,241 @@
+/**
+ * Planner Telemetry — Shadow mode validation queries.
+ *
+ * Read-only queries that compare planner-recommended models vs actual models used,
+ * track cost deltas, and measure planner latency overhead. Used for validating
+ * shadow mode accuracy before switching to active mode.
+ */
+
+import { getDb } from "../db";
+import { taskRuns, taskStepAttempts } from "../../drizzle/schema";
+import { sql, desc, gte } from "drizzle-orm";
+
+// ── Types ────────────────────────────────────────────────────────────
+
+export interface PlannerAccuracyReport {
+  totalRuns: number;
+  modelMatches: number;
+  modelMismatches: number;
+  accuracyPercent: number;
+  avgLatencyMs: number;
+  byTaskType: Record<
+    string,
+    {
+      runs: number;
+      matches: number;
+      avgCostDelta: number;
+    }
+  >;
+}
+
+export interface CostComparisonReport {
+  totalPlannerCredits: number;
+  totalActualCredits: number;
+  deltaPercent: number;
+  outliers: Array<{
+    taskRunId: number;
+    plannerCredits: number;
+    actualCredits: number;
+  }>;
+}
+
+export interface LatencyReport {
+  avgPlannerMs: number;
+  p95PlannerMs: number;
+  p99PlannerMs: number;
+  totalRequests: number;
+}
+
+// ── Accuracy Report ──────────────────────────────────────────────────
+
+/**
+ * Compare planner-recommended model vs actual model used (shadow mode).
+ */
+export async function getPlannerAccuracyReport(
+  hoursBack: number = 24,
+): Promise<PlannerAccuracyReport> {
+  const db = await getDb();
+  if (!db) {
+    return {
+      totalRuns: 0,
+      modelMatches: 0,
+      modelMismatches: 0,
+      accuracyPercent: 0,
+      avgLatencyMs: 0,
+      byTaskType: {},
+    };
+  }
+
+  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
+
+  const rows = await db
+    .select({
+      taskType: taskRuns.taskType,
+      planJson: taskRuns.planJson,
+      effectiveModel: taskStepAttempts.effectiveModel,
+      creditsUsed: taskStepAttempts.creditsUsed,
+      durationMs: taskStepAttempts.durationMs,
+    })
+    .from(taskRuns)
+    .innerJoin(
+      taskStepAttempts,
+      sql`${taskStepAttempts.taskRunId} = ${taskRuns.id}`,
+    )
+    .where(gte(taskRuns.createdAt, since))
+    .orderBy(desc(taskRuns.createdAt));
+
+  const byTaskType: PlannerAccuracyReport["byTaskType"] = {};
+  let totalMatches = 0;
+  let totalMismatches = 0;
+  let totalLatencyMs = 0;
+  let latencyCount = 0;
+
+  for (const row of rows) {
+    const plan = row.planJson as Record<string, unknown> | null;
+    const recommendedModel = (plan as any)?.recommendedModel ?? null;
+    const isMatch =
+      !recommendedModel || recommendedModel === row.effectiveModel;
+
+    if (isMatch) totalMatches++;
+    else totalMismatches++;
+
+    if (row.durationMs != null) {
+      totalLatencyMs += row.durationMs;
+      latencyCount++;
+    }
+
+    const tt = row.taskType ?? "unknown";
+    if (!byTaskType[tt]) {
+      byTaskType[tt] = { runs: 0, matches: 0, avgCostDelta: 0 };
+    }
+    byTaskType[tt].runs++;
+    if (isMatch) byTaskType[tt].matches++;
+  }
+
+  const totalRuns = totalMatches + totalMismatches;
+  return {
+    totalRuns,
+    modelMatches: totalMatches,
+    modelMismatches: totalMismatches,
+    accuracyPercent: totalRuns > 0 ? (totalMatches / totalRuns) * 100 : 0,
+    avgLatencyMs: latencyCount > 0 ? totalLatencyMs / latencyCount : 0,
+    byTaskType,
+  };
+}
+
+// ── Cost Comparison ──────────────────────────────────────────────────
+
+/**
+ * Shadow mode cost comparison: planner-tracked vs actual credits used.
+ * Identifies outliers where planner estimate differs by >10%.
+ */
+export async function getCostComparisonReport(
+  hoursBack: number = 24,
+): Promise<CostComparisonReport> {
+  const db = await getDb();
+  if (!db) {
+    return {
+      totalPlannerCredits: 0,
+      totalActualCredits: 0,
+      deltaPercent: 0,
+      outliers: [],
+    };
+  }
+
+  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
+
+  const rows = await db
+    .select({
+      taskRunId: taskRuns.id,
+      totalCreditsUsed: taskRuns.totalCreditsUsed,
+      stepCredits: sql<number>`COALESCE(SUM(${taskStepAttempts.creditsUsed}), 0)`,
+    })
+    .from(taskRuns)
+    .leftJoin(
+      taskStepAttempts,
+      sql`${taskStepAttempts.taskRunId} = ${taskRuns.id}`,
+    )
+    .where(gte(taskRuns.createdAt, since))
+    .groupBy(taskRuns.id)
+    .orderBy(desc(taskRuns.createdAt));
+
+  let totalPlannerCredits = 0;
+  let totalActualCredits = 0;
+  const outliers: CostComparisonReport["outliers"] = [];
+
+  for (const row of rows) {
+    const plannerCredits = Number(row.totalCreditsUsed ?? 0);
+    const actualCredits = Number(row.stepCredits ?? 0);
+    totalPlannerCredits += plannerCredits;
+    totalActualCredits += actualCredits;
+
+    if (actualCredits > 0) {
+      const delta = Math.abs(plannerCredits - actualCredits) / actualCredits;
+      if (delta > 0.1) {
+        outliers.push({
+          taskRunId: row.taskRunId,
+          plannerCredits,
+          actualCredits,
+        });
+      }
+    }
+  }
+
+  const deltaPercent =
+    totalActualCredits > 0
+      ? ((totalPlannerCredits - totalActualCredits) / totalActualCredits) * 100
+      : 0;
+
+  return {
+    totalPlannerCredits,
+    totalActualCredits,
+    deltaPercent,
+    outliers,
+  };
+}
+
+// ── Latency Report ───────────────────────────────────────────────────
+
+/**
+ * Planner latency overhead: time spent in planner per request.
+ * Approximated via step attempt durationMs.
+ */
+export async function getPlannerLatencyReport(
+  hoursBack: number = 24,
+): Promise<LatencyReport> {
+  const db = await getDb();
+  if (!db) {
+    return { avgPlannerMs: 0, p95PlannerMs: 0, p99PlannerMs: 0, totalRequests: 0 };
+  }
+
+  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
+
+  const rows = await db
+    .select({
+      durationMs: taskStepAttempts.durationMs,
+    })
+    .from(taskStepAttempts)
+    .innerJoin(taskRuns, sql`${taskRuns.id} = ${taskStepAttempts.taskRunId}`)
+    .where(gte(taskRuns.createdAt, since))
+    .orderBy(taskStepAttempts.durationMs);
+
+  const durations = rows
+    .map((r) => r.durationMs)
+    .filter((d): d is number => d != null && d > 0);
+
+  if (durations.length === 0) {
+    return { avgPlannerMs: 0, p95PlannerMs: 0, p99PlannerMs: 0, totalRequests: 0 };
+  }
+
+  const sorted = durations.sort((a, b) => a - b);
+  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
+  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
+  const p99Idx = Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1);
+
+  return {
+    avgPlannerMs: Math.round(avg),
+    p95PlannerMs: sorted[p95Idx],
+    p99PlannerMs: sorted[p99Idx],
+    totalRequests: sorted.length,
+  };
+}
diff --git a/apps/web/server/services/webhookDispatchQueue.ts b/apps/web/server/services/webhookDispatchQueue.ts
index 45428623..fc9c144f 100644
--- a/apps/web/server/services/webhookDispatchQueue.ts
+++ b/apps/web/server/services/webhookDispatchQueue.ts
@@ -17,6 +17,8 @@ import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
 import { deductCredits } from "./creditService";
 import { channelGateway } from "./channelGateway";
 import { agencyBridge } from "./agencyBridge";
+import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
+import { buildAgencyTaskMetadata } from "./agencyEscalation";
 import { stripSecrets } from "./webhookTriggerService";
 import { auditLogger } from "./auditLogger";
 import { ENV } from "../_core/env";
@@ -72,6 +74,19 @@ export async function processWebhookDispatch(job: Job<WebhookDispatchJob>): Prom
   // ── Dispatch to configured target ─────────────────────────────────────
 
   if (targetType === "agency" && targetAgencyId) {
+    const plannerResult = await runPlanner({
+      sourceType: "webhook",
+      userId,
+      tenantId,
+    }).catch(() => null);
+    const taskMetadata = plannerResult
+      ? buildAgencyTaskMetadata({
+          taskRunId: plannerResult.taskRunId,
+          plan: plannerResult.plan,
+          routeReason: "agency:webhook_dispatch",
+        })
+      : undefined;
+
     const result = await agencyBridge.executeRun({
       agencyId: targetAgencyId,
       conversationId: targetAgencyId, // agencyId as server-side conv fallback
@@ -79,9 +94,20 @@ export async function processWebhookDispatch(job: Job<WebhookDispatchJob>): Prom
       userToken: "",                  // server-side dispatch — no user session
       tenantId,
       userId,
+      taskMetadata,
     });
     targetExecutionId = result.runId;
 
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: "agency",
+        inputTokens: 0,
+        outputTokens: 0,
+      }).catch(() => {});
+    }
+
   } else if (targetType === "chat" && targetConversationId) {
     await channelGateway.processMessageServerSide({
       conversationId: targetConversationId,
