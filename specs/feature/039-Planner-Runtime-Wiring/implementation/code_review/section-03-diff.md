diff --git a/apps/web/server/_core/responsesRoutes.ts b/apps/web/server/_core/responsesRoutes.ts
index 587e17fb..1d330f6e 100644
--- a/apps/web/server/_core/responsesRoutes.ts
+++ b/apps/web/server/_core/responsesRoutes.ts
@@ -32,6 +32,7 @@ import {
   DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST,
 } from "../services/searchResultCache";
 import { getRedisClient } from "../services/redis";
+import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
 
 // ---------------------------------------------------------------------------
 // Constants
@@ -489,6 +490,21 @@ export function registerResponsesRoutes(
         traceId,
       });
 
+      // --- Task planner wiring ---
+      const toolCount = Array.isArray(sanitizedBody.tools)
+        ? (sanitizedBody.tools as unknown[]).length
+        : 0;
+      const plannerResult = await runPlanner({
+        sourceType: "responses",
+        userId,
+        tenantId,
+        conversationModel: requestedModelId,
+        hasTools: toolCount > 0,
+      });
+      if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+        model = plannerResult.resolvedModel;
+      }
+
       // Update sanitized body with resolved model
       sanitizedBody.model = model;
 
@@ -535,6 +551,7 @@ export function registerResponsesRoutes(
             startTime,
             internalToken,
             deps,
+            plannerResult,
           );
         } else {
           await proxyResponsesJson(
@@ -550,6 +567,7 @@ export function registerResponsesRoutes(
             startTime,
             internalToken,
             deps,
+            plannerResult,
           );
         }
       } catch (err: any) {
@@ -583,6 +601,7 @@ async function proxyResponsesJson(
   startTime: number,
   internalToken: string,
   deps: any,
+  plannerResult?: import("../services/taskPlannerMiddleware").PlannerResult | null,
 ) {
   const controller = new AbortController();
   req.on("close", () => controller.abort());
@@ -812,6 +831,20 @@ async function proxyResponsesJson(
     sourceType: "browser_automation",
   });
 
+  // Record step attempt for planner tracking
+  if (plannerResult) {
+    recordStepAttempt({
+      taskRunId: plannerResult.taskRunId,
+      plan: plannerResult.plan,
+      model: requestedModelId,
+      provider: provider.providerName,
+      inputTokens: budget.totalInputTokens,
+      outputTokens: budget.totalOutputTokens,
+      durationMs: totalMs,
+      snapshot: plannerResult.snapshot,
+    }).catch(() => {});
+  }
+
   // Log web_search cost separately if any
   if (budget.webSearchCalls > 0) {
     const searchCredits = calculateCreditsFromCost(searchCostUsd);
@@ -947,6 +980,7 @@ async function proxyResponsesStream(
   startTime: number,
   internalToken: string,
   deps: any,
+  plannerResult?: import("../services/taskPlannerMiddleware").PlannerResult | null,
 ) {
   const controller = new AbortController();
   let clientDisconnected = false;
@@ -1219,6 +1253,20 @@ async function proxyResponsesStream(
       sourceType: "browser_automation",
     });
 
+    // Record step attempt for planner tracking
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: requestedModelId,
+        provider: provider.providerName,
+        inputTokens: budget.totalInputTokens,
+        outputTokens: budget.totalOutputTokens,
+        durationMs: totalMs,
+        snapshot: plannerResult.snapshot,
+      }).catch(() => {});
+    }
+
     // Log web_search cost
     if (budget.webSearchCalls > 0) {
       const searchCredits = calculateCreditsFromCost(searchCostUsd);
diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index 944d1491..e8624c1a 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -50,6 +50,8 @@ import { auditLogger } from "../services/auditLogger";
 import { checkAbuseGuard, hashPrompt } from "../services/abuseGuard";
 import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
 import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
+import { classifyArtifactIntent, selectExecutionRoute } from "../services/artifactRouter";
+import { updateTaskRunArtifact } from "../services/taskRunStore";
 
 // ── Security: forbidden patterns in LLM-generated skillContent ───────────────
 const ISC_FORBIDDEN_PATTERNS = [
@@ -1454,6 +1456,26 @@ export const chatRouter = router({
           },
         });
 
+        // Artifact classification for presentation/report skills
+        if (plannerResult) {
+          const artifactIntent = classifyArtifactIntent({
+            sourceType: "skill",
+            skillSlug: input.skillId,
+          });
+          if (artifactIntent !== "chat_reply") {
+            const artifactRoute = selectExecutionRoute({
+              artifactIntent,
+              complexity: plannerResult.plan.complexity,
+              modelSupportsStructuredOutput: true,
+            });
+            updateTaskRunArtifact(plannerResult.taskRunId, {
+              artifactIntent,
+              executionRoute: artifactRoute.route,
+              routeReason: artifactRoute.routeReason,
+            }).catch(() => {});
+          }
+        }
+
         // Model selection: active planner overrides, shadow mode uses legacy
         let llmModel: string | null;
         if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
diff --git a/apps/web/server/services/aiPresentationService.ts b/apps/web/server/services/aiPresentationService.ts
index ef00695d..a410f404 100644
--- a/apps/web/server/services/aiPresentationService.ts
+++ b/apps/web/server/services/aiPresentationService.ts
@@ -55,6 +55,8 @@ import {
   applyWatermarkToSlideContent,
   extractWatermarkFromSlideContent,
 } from "./presentationWatermarkService";
+import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
+import { linkArtifactToTaskRun } from "./taskRunStore";
 
 // ── Constants ──────────────────────────────────────────────
 
@@ -2691,6 +2693,9 @@ async function invokeSkillTextLLM(params: {
   preferredProviderId?: number;
   strictProviderPin?: boolean;
   billingContext?: SkillLLMBillingContext;
+  taskRunId?: number;
+  plannerPlan?: import("./taskExecutionPlanner").TaskExecutionPlan;
+  plannerSnapshot?: import("./modelResolver").ModelResolutionSnapshot | null;
 }): Promise<string> {
   if (params.strictProviderPin && params.preferredProviderId) {
     const candidates = await resolveProviders(params.model).catch(() => []);
@@ -2760,6 +2765,20 @@ async function invokeSkillTextLLM(params: {
     throw new BillingChargeError(`LLM credit deduction failed: ${sanitizeErrorMessage(err)}`);
   }
 
+  // Record step attempt for planner tracking
+  if (params.taskRunId && params.plannerPlan) {
+    recordStepAttempt({
+      taskRunId: params.taskRunId,
+      plan: params.plannerPlan,
+      model: params.model,
+      provider: result.providerName,
+      inputTokens,
+      outputTokens,
+      costUsd: costUsd?.toString(),
+      snapshot: params.plannerSnapshot,
+    }).catch(() => {});
+  }
+
   const content = result.response?.choices?.[0]?.message?.content;
   return extractTextContent(content) || JSON.stringify(content);
 }
@@ -4461,6 +4480,16 @@ export async function generateAIDraft(
       return;
     }
 
+    // ── Planner: create one task_run for the entire presentation ──
+    const plannerResult = await runPlanner({
+      sourceType: "presentation",
+      userId: actor.userId,
+      tenantId: actor.tenantId,
+      conversationModel: DEFAULT_TEXT_MODEL,
+      skillSlug: "ai-presentation",
+    });
+    const taskRunId = plannerResult?.taskRunId;
+
     // ── Phase 1: Draft Source Preparation ────────────────
     if (await isCancelled()) { await setCancelled(); return; }
 
@@ -4590,6 +4619,9 @@ export async function generateAIDraft(
             stage: "article_generation",
             promptPreview: articlePrompt.slice(0, 500),
           },
+          taskRunId,
+          plannerPlan: plannerResult?.plan,
+          plannerSnapshot: plannerResult?.snapshot,
         });
       } catch (err) {
         const sanitizedError = sanitizeErrorMessage(err);
@@ -4844,6 +4876,9 @@ export async function generateAIDraft(
                     slideIndex: index,
                     promptPreview: baseImagePrompt.slice(0, 500),
                   },
+                  taskRunId,
+                  plannerPlan: plannerResult?.plan,
+                  plannerSnapshot: plannerResult?.snapshot,
                 }),
                 IMAGE_PROMPT_ENHANCE_TIMEOUT_MS,
                 "image_prompt_enhancement_timeout",
@@ -5436,6 +5471,13 @@ export async function generateAIDraft(
       return;
     }
 
+    // Link artifact to task run on success
+    if (taskRunId) {
+      linkArtifactToTaskRun(taskRunId, {
+        presentationDeckId: input.deckId,
+      }).catch(() => {});
+    }
+
     // ── Success ─────────────────────────────────────────
     await updateProgress({
       phase: 7,
diff --git a/apps/web/server/services/taskRunStore.test.ts b/apps/web/server/services/taskRunStore.test.ts
new file mode 100644
index 00000000..ab7ba262
--- /dev/null
+++ b/apps/web/server/services/taskRunStore.test.ts
@@ -0,0 +1,92 @@
+/**
+ * Tests for taskRunStore.ts — updateTaskRunArtifact and linkArtifactToTaskRun
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const mockUpdate = vi.fn().mockReturnValue({
+  set: vi.fn().mockReturnValue({
+    where: vi.fn().mockResolvedValue(undefined),
+  }),
+});
+
+vi.mock("../db", () => ({
+  getDb: vi.fn().mockResolvedValue({
+    update: (...args: any[]) => mockUpdate(...args),
+    insert: vi.fn().mockReturnValue({
+      values: vi.fn().mockReturnValue({
+        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
+      }),
+    }),
+    select: vi.fn().mockReturnValue({
+      from: vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue([]),
+      }),
+    }),
+  }),
+}));
+
+vi.mock("./taskExecutionPlanner", () => ({
+  validatePlanVersion: vi.fn().mockReturnValue(true),
+}));
+
+vi.mock("./artifactRouter", () => ({
+  classifyArtifactIntent: vi.fn(),
+  selectExecutionRoute: vi.fn(),
+}));
+
+import { updateTaskRunArtifact, linkArtifactToTaskRun } from "./taskRunStore";
+
+describe("taskRunStore", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("updateTaskRunArtifact", () => {
+    it("updates artifact metadata on existing task_run", async () => {
+      await updateTaskRunArtifact(42, {
+        artifactIntent: "presentation_deck",
+        executionRoute: "deterministic_pipeline",
+        routeReason: "presentation routed to deterministic pipeline",
+      });
+
+      expect(mockUpdate).toHaveBeenCalled();
+    });
+
+    it("does nothing when db is null", async () => {
+      const { getDb } = await import("../db");
+      vi.mocked(getDb).mockResolvedValueOnce(null as any);
+
+      await updateTaskRunArtifact(42, {
+        artifactIntent: "presentation_deck",
+        executionRoute: "deterministic_pipeline",
+        routeReason: "test",
+      });
+
+      // Should not throw
+    });
+  });
+
+  describe("linkArtifactToTaskRun", () => {
+    it("links presentation deck ID to task run", async () => {
+      await linkArtifactToTaskRun(42, {
+        presentationDeckId: 100,
+      });
+
+      expect(mockUpdate).toHaveBeenCalled();
+    });
+
+    it("links artifact message ID to task run", async () => {
+      await linkArtifactToTaskRun(42, {
+        artifactMessageId: 200,
+      });
+
+      expect(mockUpdate).toHaveBeenCalled();
+    });
+
+    it("does nothing when neither ID provided", async () => {
+      await linkArtifactToTaskRun(42, {});
+
+      expect(mockUpdate).not.toHaveBeenCalled();
+    });
+  });
+});
diff --git a/apps/web/server/services/taskRunStore.ts b/apps/web/server/services/taskRunStore.ts
index 456f34e9..5dbe2d94 100644
--- a/apps/web/server/services/taskRunStore.ts
+++ b/apps/web/server/services/taskRunStore.ts
@@ -179,6 +179,30 @@ export async function loadValidatedPlan(
   return row.planJson as TaskExecutionPlan;
 }
 
+// ── Update artifact metadata on task run ─────────────────────────────
+
+export async function updateTaskRunArtifact(
+  taskRunId: number,
+  artifact: {
+    artifactIntent: ArtifactIntent;
+    executionRoute: ExecutionRoute;
+    routeReason: string;
+  },
+): Promise<void> {
+  const db = await getDb();
+  if (!db) return;
+
+  await db
+    .update(taskRuns)
+    .set({
+      artifactIntent: artifact.artifactIntent,
+      executionRoute: artifact.executionRoute,
+      routeReason: artifact.routeReason,
+      updatedAt: new Date(),
+    })
+    .where(eq(taskRuns.id, taskRunId));
+}
+
 // ── Link artifact to task run (Section 04) ───────────────────────────
 
 export async function linkArtifactToTaskRun(
