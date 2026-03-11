diff --git a/apps/web/server/_core/responsesRoutes.ts b/apps/web/server/_core/responsesRoutes.ts
index 210e95aa..40e16c06 100644
--- a/apps/web/server/_core/responsesRoutes.ts
+++ b/apps/web/server/_core/responsesRoutes.ts
@@ -501,7 +501,7 @@ export function registerResponsesRoutes(
         conversationModel: requestedModelId,
         hasTools: toolCount > 0,
       }).catch(() => null);
-      if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+      if (plannerResult?.resolvedModel) {
         model = plannerResult.resolvedModel;
       }
 
diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index e8624c1a..c1280711 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -1476,9 +1476,9 @@ export const chatRouter = router({
           }
         }
 
-        // Model selection: active planner overrides, shadow mode uses legacy
+        // Model selection: planner is primary, legacy is fallback
         let llmModel: string | null;
-        if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+        if (plannerResult?.resolvedModel) {
           llmModel = plannerResult.resolvedModel;
         } else {
           llmModel = executionPolicy.modelId;
diff --git a/apps/web/server/routers/scheduledMessages.ts b/apps/web/server/routers/scheduledMessages.ts
index 9d43dd41..8c50b47f 100644
--- a/apps/web/server/routers/scheduledMessages.ts
+++ b/apps/web/server/routers/scheduledMessages.ts
@@ -516,7 +516,7 @@ export const scheduledMessagesRouter = router({
       });
 
       let model: string | null;
-      if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+      if (plannerResult?.resolvedModel) {
         model = plannerResult.resolvedModel;
       } else {
         model = await resolveEnabledLlmModelId([input.model]);
diff --git a/apps/web/server/routers/translation.ts b/apps/web/server/routers/translation.ts
index d23a730d..d90bb0f9 100644
--- a/apps/web/server/routers/translation.ts
+++ b/apps/web/server/routers/translation.ts
@@ -65,7 +65,7 @@ export const translationRouter = router({
       });
 
       let model: string | null;
-      if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+      if (plannerResult?.resolvedModel) {
         model = plannerResult.resolvedModel;
       } else {
         model = await resolveEnabledLlmModelId([prefs.translationModel]);
diff --git a/apps/web/server/services/callLLMStructured.test.ts b/apps/web/server/services/callLLMStructured.test.ts
index e6c98c56..366138ee 100644
--- a/apps/web/server/services/callLLMStructured.test.ts
+++ b/apps/web/server/services/callLLMStructured.test.ts
@@ -54,7 +54,7 @@ const fakePlannerResult = {
   plan: fakePlan,
   resolvedModel: "gpt-4o",
   snapshot: null,
-  shadowMode: true,
+  plannerLatencyMs: 5,
 };
 
 function setupSuccessfulLLMResponse(content = '{"name": "test"}') {
@@ -92,29 +92,29 @@ describe("callLLMStructured planner wiring", () => {
     );
   });
 
-  it("uses legacy model in shadow mode", async () => {
-    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: true });
+  it("uses planner-selected model when planner resolves a model", async () => {
+    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, resolvedModel: "gpt-4o" });
     mockRecordStepAttempt.mockResolvedValue(undefined);
     setupSuccessfulLLMResponse();
 
     await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });
 
-    // Should use original model, not planner's resolvedModel
+    // Should use planner's resolvedModel, not the original
     expect(mockExecuteWithFallback).toHaveBeenCalledWith(
-      expect.objectContaining({ model: "claude-sonnet-4-6" }),
+      expect.objectContaining({ model: "gpt-4o" }),
     );
   });
 
-  it("uses planner model in active mode", async () => {
-    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: false, resolvedModel: "gpt-4o" });
+  it("uses original model when planner resolves null", async () => {
+    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, resolvedModel: null });
     mockRecordStepAttempt.mockResolvedValue(undefined);
     setupSuccessfulLLMResponse();
 
     await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });
 
-    // Should use planner's resolvedModel
+    // Should fall back to original model
     expect(mockExecuteWithFallback).toHaveBeenCalledWith(
-      expect.objectContaining({ model: "gpt-4o" }),
+      expect.objectContaining({ model: "claude-sonnet-4-6" }),
     );
   });
 
diff --git a/apps/web/server/services/callLLMStructured.ts b/apps/web/server/services/callLLMStructured.ts
index 57026b26..8319aa44 100644
--- a/apps/web/server/services/callLLMStructured.ts
+++ b/apps/web/server/services/callLLMStructured.ts
@@ -98,7 +98,7 @@ The JSON must strictly conform to the expected schema.`;
   });
 
   let effectiveModel = model;
-  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+  if (plannerResult?.resolvedModel) {
     effectiveModel = plannerResult.resolvedModel;
   }
 
diff --git a/apps/web/server/services/channelGateway.ts b/apps/web/server/services/channelGateway.ts
index bcaddb69..07d11604 100644
--- a/apps/web/server/services/channelGateway.ts
+++ b/apps/web/server/services/channelGateway.ts
@@ -496,7 +496,7 @@ async function processMessageServerSide(
     // 2b. Check credits
     const estimatedInputTokens = Math.ceil(params.content.length / 4);
     let effectiveConversationModel: string | null;
-    if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+    if (plannerResult?.resolvedModel) {
       effectiveConversationModel = plannerResult.resolvedModel;
     } else {
       effectiveConversationModel = await resolveEnabledLlmModelId([conversation.model]);
diff --git a/apps/web/server/services/llmRoutesHandler.ts b/apps/web/server/services/llmRoutesHandler.ts
index c5d82e11..0ceeadc8 100644
--- a/apps/web/server/services/llmRoutesHandler.ts
+++ b/apps/web/server/services/llmRoutesHandler.ts
@@ -36,9 +36,9 @@ export async function handleChatWithRouter(params: HandlerParams): Promise<void>
     conversationModel: model,
   });
 
-  // Model selection: active mode uses planner, shadow/disabled uses legacy
+  // Model selection: planner is primary, legacy is fallback
   let effectiveModel: string | null;
-  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+  if (plannerResult?.resolvedModel) {
     effectiveModel = plannerResult.resolvedModel;
   } else {
     effectiveModel = await resolveEnabledLlmModelId([model]);
@@ -144,9 +144,9 @@ export async function handleStreamWithRouter(params: HandlerParams): Promise<voi
     conversationModel: model,
   });
 
-  // Model selection: active mode uses planner, shadow/disabled uses legacy
+  // Model selection: planner is primary, legacy is fallback
   let effectiveModel: string | null;
-  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+  if (plannerResult?.resolvedModel) {
     effectiveModel = plannerResult.resolvedModel;
   } else {
     effectiveModel = await resolveEnabledLlmModelId([model]);
diff --git a/apps/web/server/services/scheduler.ts b/apps/web/server/services/scheduler.ts
index ce323777..afe01a95 100644
--- a/apps/web/server/services/scheduler.ts
+++ b/apps/web/server/services/scheduler.ts
@@ -257,7 +257,7 @@ export async function deliverScheduledMessage(scheduleId: number): Promise<void>
   });
 
   let model: string | null;
-  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+  if (plannerResult?.resolvedModel) {
     model = plannerResult.resolvedModel;
   } else {
     model = await resolveEnabledLlmModelId([schedule.modelId]);
diff --git a/apps/web/server/services/taskPlannerMiddleware.test.ts b/apps/web/server/services/taskPlannerMiddleware.test.ts
index 29304e1b..af3559a8 100644
--- a/apps/web/server/services/taskPlannerMiddleware.test.ts
+++ b/apps/web/server/services/taskPlannerMiddleware.test.ts
@@ -109,10 +109,8 @@ describe("taskPlannerMiddleware", () => {
       expect(mockBuildExecutionPlan).not.toHaveBeenCalled();
     });
 
-    it("returns PlannerResult with shadowMode=true when shadow flag is true", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true) // TASK_PLANNER_ENABLED
-        .mockResolvedValueOnce(true); // TASK_PLANNER_SHADOW_MODE
+    it("returns PlannerResult with plannerLatencyMs when enabled", async () => {
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 42 });
       mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
@@ -122,15 +120,15 @@ describe("taskPlannerMiddleware", () => {
       const result = await runPlanner(basePlannerInput);
 
       expect(result).not.toBeNull();
-      expect(result!.shadowMode).toBe(true);
+      expect(result!.plannerLatencyMs).toBeGreaterThanOrEqual(0);
       expect(result!.taskRunId).toBe(42);
       expect(result!.resolvedModel).toBe("gpt-4o");
+      // shadowMode should not exist
+      expect(result).not.toHaveProperty("shadowMode");
     });
 
-    it("returns PlannerResult with shadowMode=false when shadow flag is false", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true) // TASK_PLANNER_ENABLED
-        .mockResolvedValueOnce(false); // TASK_PLANNER_SHADOW_MODE
+    it("planner-selected model is always returned (no shadow mode check)", async () => {
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 43 });
       mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
@@ -140,13 +138,17 @@ describe("taskPlannerMiddleware", () => {
       const result = await runPlanner(basePlannerInput);
 
       expect(result).not.toBeNull();
-      expect(result!.shadowMode).toBe(false);
+      expect(result!.resolvedModel).toBe("gpt-4o");
+      // Only one feature flag check (TASK_PLANNER_ENABLED), no SHADOW_MODE
+      expect(mockGetTenantFeatureFlag).toHaveBeenCalledTimes(1);
+      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith(
+        "TASK_PLANNER_ENABLED",
+        "tenant-1",
+      );
     });
 
     it("returns null on internal error (never throws)", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true) // TASK_PLANNER_ENABLED
-        .mockResolvedValueOnce(true); // TASK_PLANNER_SHADOW_MODE
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockImplementation(() => {
         throw new Error("plan build failed");
       });
@@ -157,9 +159,7 @@ describe("taskPlannerMiddleware", () => {
     });
 
     it("creates task_runs record via createTaskRun", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true)
-        .mockResolvedValueOnce(true);
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 44 });
       mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
@@ -180,9 +180,7 @@ describe("taskPlannerMiddleware", () => {
     });
 
     it("resolves model from plan via resolveModelFromPlan", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true)
-        .mockResolvedValueOnce(true);
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 45 });
       mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
@@ -198,9 +196,7 @@ describe("taskPlannerMiddleware", () => {
     });
 
     it("passes traceId from trace context", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true)
-        .mockResolvedValueOnce(true);
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 46 });
       mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
@@ -239,9 +235,7 @@ describe("taskPlannerMiddleware", () => {
     });
 
     it("handles null resolved model gracefully", async () => {
-      mockGetTenantFeatureFlag
-        .mockResolvedValueOnce(true)
-        .mockResolvedValueOnce(true);
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
       mockBuildExecutionPlan.mockReturnValue(fakePlan);
       mockCreateTaskRun.mockResolvedValue({ id: 48 });
       mockResolveModelFromPlan.mockReturnValue(null);
@@ -253,6 +247,26 @@ describe("taskPlannerMiddleware", () => {
       expect(result!.resolvedModel).toBeNull();
       expect(result!.snapshot).toBeNull();
     });
+
+    it("legacy fallback only triggers when planner returns null", async () => {
+      // When planner is disabled, it returns null → caller should use legacy
+      mockGetTenantFeatureFlag.mockResolvedValue(false);
+
+      const result = await runPlanner(basePlannerInput);
+      expect(result).toBeNull();
+
+      // When planner is enabled and resolves a model, caller uses planner model
+      mockGetTenantFeatureFlag.mockResolvedValue(true);
+      mockBuildExecutionPlan.mockReturnValue(fakePlan);
+      mockCreateTaskRun.mockResolvedValue({ id: 49 });
+      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
+      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
+      mockGetTraceId.mockReturnValue(undefined);
+
+      const result2 = await runPlanner(basePlannerInput);
+      expect(result2).not.toBeNull();
+      expect(result2!.resolvedModel).toBe("gpt-4o");
+    });
   });
 
   describe("recordStepAttempt", () => {
diff --git a/apps/web/server/services/taskPlannerMiddleware.ts b/apps/web/server/services/taskPlannerMiddleware.ts
index ca2742c4..fe8e3596 100644
--- a/apps/web/server/services/taskPlannerMiddleware.ts
+++ b/apps/web/server/services/taskPlannerMiddleware.ts
@@ -7,8 +7,8 @@
  * Key guarantees:
  * - NEVER throws — all errors are caught and logged; returns null on failure
  * - Zero overhead when planner is disabled (feature flag check only)
- * - Shadow mode (default): plans and logs but does NOT override model selection
  * - Active mode: planner-selected model replaces legacy resolveEnabledLlmModelId()
+ * - Legacy fallback: resolveEnabledLlmModelId() used when planner is disabled/failed/no model
  */
 
 import { buildExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlanner";
@@ -30,7 +30,7 @@ export interface PlannerResult {
   plan: TaskExecutionPlan;
   resolvedModel: string | null;
   snapshot: ModelResolutionSnapshot | null;
-  shadowMode: boolean;
+  plannerLatencyMs: number;
 }
 
 export interface PlannerInput {
@@ -60,10 +60,8 @@ export async function runPlanner(
     );
     if (!enabled) return null;
 
-    const shadowMode = await getTenantFeatureFlag(
-      "TASK_PLANNER_SHADOW_MODE",
-      input.tenantId,
-    );
+    const startMs = Date.now();
+
     // 2. Build execution plan
     const plan = buildExecutionPlan({
       sourceType: input.sourceType,
@@ -98,7 +96,7 @@ export async function runPlanner(
       plan,
       resolvedModel: resolved?.modelId ?? null,
       snapshot,
-      shadowMode: shadowMode !== false, // default true
+      plannerLatencyMs: Date.now() - startMs,
     };
   } catch (err) {
     // Planner failure must never block the request
