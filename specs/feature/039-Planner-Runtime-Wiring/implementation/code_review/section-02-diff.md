diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index f343c9c3..c5a664bb 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -49,6 +49,7 @@ import { checkRateLimit } from "../middleware/distributedRateLimit";
 import { auditLogger } from "../services/auditLogger";
 import { checkAbuseGuard, hashPrompt } from "../services/abuseGuard";
 import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
+import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
 
 // ── Security: forbidden patterns in LLM-generated skillContent ───────────────
 const ISC_FORBIDDEN_PATTERNS = [
@@ -1438,7 +1439,28 @@ export const chatRouter = router({
           skill,
           conversationModel,
         });
-        const llmModel = executionPolicy.modelId;
+
+        // Wire task planner for skill execution tracking
+        const skillTenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+        const plannerResult = await runPlanner({
+          sourceType: "skill",
+          userId: ctx.user.id,
+          tenantId: skillTenantId,
+          conversationModel,
+          skillSlug: input.skillId,
+          executionPolicy: {
+            modelId: executionPolicy.modelId ?? undefined,
+            mode: executionPolicy.modelSource,
+          },
+        });
+
+        // Model selection: active planner overrides, shadow mode uses legacy
+        let llmModel: string | null;
+        if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+          llmModel = plannerResult.resolvedModel;
+        } else {
+          llmModel = executionPolicy.modelId;
+        }
         if (!llmModel) {
           return {
             success: false,
@@ -1573,6 +1595,21 @@ export const chatRouter = router({
             sourceType: "skill",
           });
 
+          // Record step attempt for planner tracking
+          if (plannerResult) {
+            recordStepAttempt({
+              taskRunId: plannerResult.taskRunId,
+              plan: plannerResult.plan,
+              model: llmModel,
+              provider: provider.providerName,
+              inputTokens,
+              outputTokens,
+              costUsd: llmData?.usage?.cost?.toString(),
+              snapshot: plannerResult.snapshot,
+              creditsUsed,
+            }).catch(() => {});
+          }
+
           // Save as assistant message in conversation
           if (input.conversationId) {
             try {
diff --git a/apps/web/server/services/callLLMStructured.test.ts b/apps/web/server/services/callLLMStructured.test.ts
new file mode 100644
index 00000000..e6c98c56
--- /dev/null
+++ b/apps/web/server/services/callLLMStructured.test.ts
@@ -0,0 +1,174 @@
+/**
+ * Tests for callLLMStructured.ts planner wiring
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock dependencies
+vi.mock("./llmRouter", () => ({
+  executeWithFallback: vi.fn(),
+  resolveProviders: vi.fn(),
+}));
+vi.mock("./creditService", () => ({
+  deductCreditsForModel: vi.fn(),
+}));
+vi.mock("./auditLogger", () => ({
+  auditLogger: { log: vi.fn() },
+}));
+vi.mock("./taskPlannerMiddleware", () => ({
+  runPlanner: vi.fn(),
+  recordStepAttempt: vi.fn(),
+}));
+
+import { callLLMStructured } from "./callLLMStructured";
+import { executeWithFallback } from "./llmRouter";
+import { deductCreditsForModel } from "./creditService";
+import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
+import { z } from "zod";
+
+const mockExecuteWithFallback = vi.mocked(executeWithFallback);
+const mockDeductCredits = vi.mocked(deductCreditsForModel);
+const mockRunPlanner = vi.mocked(runPlanner);
+const mockRecordStepAttempt = vi.mocked(recordStepAttempt);
+
+const testSchema = z.object({ name: z.string() });
+
+const baseParams = {
+  systemPrompt: "You are a test.",
+  userMessage: "Test",
+  zodSchema: testSchema,
+  userId: 1,
+  tenantId: "tenant-1",
+};
+
+const fakePlan = {
+  version: 1 as const,
+  taskType: "chat" as const,
+  complexity: "simple" as const,
+  requirements: {},
+  strategy: "fastest" as const,
+  createdAt: "2026-01-01T00:00:00Z",
+};
+
+const fakePlannerResult = {
+  taskRunId: 42,
+  plan: fakePlan,
+  resolvedModel: "gpt-4o",
+  snapshot: null,
+  shadowMode: true,
+};
+
+function setupSuccessfulLLMResponse(content = '{"name": "test"}') {
+  mockExecuteWithFallback.mockResolvedValue({
+    type: "success" as const,
+    response: {
+      choices: [{ message: { content }, index: 0, finish_reason: "stop" }],
+      usage: { prompt_tokens: 100, completion_tokens: 50 },
+    },
+    providerName: "openai",
+    providerId: 1,
+  } as any);
+  mockDeductCredits.mockResolvedValue({ creditsUsed: 5 });
+}
+
+describe("callLLMStructured planner wiring", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("runs planner once before the retry loop", async () => {
+    mockRunPlanner.mockResolvedValue(fakePlannerResult);
+    mockRecordStepAttempt.mockResolvedValue(undefined);
+    setupSuccessfulLLMResponse();
+
+    await callLLMStructured(baseParams);
+
+    expect(mockRunPlanner).toHaveBeenCalledTimes(1);
+    expect(mockRunPlanner).toHaveBeenCalledWith(
+      expect.objectContaining({
+        sourceType: "skill",
+        userId: 1,
+        tenantId: "tenant-1",
+      }),
+    );
+  });
+
+  it("uses legacy model in shadow mode", async () => {
+    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: true });
+    mockRecordStepAttempt.mockResolvedValue(undefined);
+    setupSuccessfulLLMResponse();
+
+    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });
+
+    // Should use original model, not planner's resolvedModel
+    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
+      expect.objectContaining({ model: "claude-sonnet-4-6" }),
+    );
+  });
+
+  it("uses planner model in active mode", async () => {
+    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: false, resolvedModel: "gpt-4o" });
+    mockRecordStepAttempt.mockResolvedValue(undefined);
+    setupSuccessfulLLMResponse();
+
+    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });
+
+    // Should use planner's resolvedModel
+    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
+      expect.objectContaining({ model: "gpt-4o" }),
+    );
+  });
+
+  it("records step attempt after each retry", async () => {
+    mockRunPlanner.mockResolvedValue(fakePlannerResult);
+    mockRecordStepAttempt.mockResolvedValue(undefined);
+
+    // First attempt returns invalid JSON, second returns valid
+    let callCount = 0;
+    mockExecuteWithFallback.mockImplementation(async () => {
+      callCount++;
+      return {
+        type: "success" as const,
+        response: {
+          choices: [{
+            message: { content: callCount === 1 ? "not json" : '{"name": "test"}' },
+            index: 0,
+            finish_reason: "stop",
+          }],
+          usage: { prompt_tokens: 100, completion_tokens: 50 },
+        },
+        providerName: "openai",
+        providerId: 1,
+      } as any;
+    });
+    mockDeductCredits.mockResolvedValue({ creditsUsed: 5 });
+
+    await callLLMStructured({ ...baseParams, maxRetries: 1 });
+
+    // recordStepAttempt called for each attempt
+    expect(mockRecordStepAttempt).toHaveBeenCalledTimes(2);
+  });
+
+  it("works when planner is disabled (returns null)", async () => {
+    mockRunPlanner.mockResolvedValue(null);
+    setupSuccessfulLLMResponse();
+
+    const result = await callLLMStructured(baseParams);
+
+    expect(result.data).toEqual({ name: "test" });
+    expect(mockRecordStepAttempt).not.toHaveBeenCalled();
+  });
+
+  it("passes skillSlug from billingMetadata", async () => {
+    mockRunPlanner.mockResolvedValue(null);
+    setupSuccessfulLLMResponse();
+
+    await callLLMStructured({
+      ...baseParams,
+      billingMetadata: { skillSlug: "my-skill" },
+    });
+
+    expect(mockRunPlanner).toHaveBeenCalledWith(
+      expect.objectContaining({ skillSlug: "my-skill" }),
+    );
+  });
+});
diff --git a/apps/web/server/services/callLLMStructured.ts b/apps/web/server/services/callLLMStructured.ts
index 7aee70f3..efd4f13a 100644
--- a/apps/web/server/services/callLLMStructured.ts
+++ b/apps/web/server/services/callLLMStructured.ts
@@ -3,6 +3,7 @@ import type { Message } from "../_core/llm";
 import { executeWithFallback, resolveProviders } from "./llmRouter";
 import { deductCreditsForModel } from "./creditService";
 import { auditLogger } from "./auditLogger";
+import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
 
 // ── Types ────────────────────────────────────────────────────
 
@@ -87,6 +88,20 @@ The JSON must strictly conform to the expected schema.`;
     }
   }
 
+  // Wire task planner ONCE before the retry loop
+  const plannerResult = await runPlanner({
+    sourceType: "skill",
+    userId,
+    tenantId,
+    conversationModel: model,
+    skillSlug: (billingMetadata?.skillSlug as string) ?? undefined,
+  });
+
+  let effectiveModel = model;
+  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
+    effectiveModel = plannerResult.resolvedModel;
+  }
+
   for (let attempt = 0; attempt <= maxRetries; attempt++) {
     const isRetry = attempt > 0;
 
@@ -101,7 +116,7 @@ The JSON must strictly conform to the expected schema.`;
     ];
 
     const result = await executeWithFallback({
-      model,
+      model: effectiveModel,
       messages,
       stream: false,
       userId,
@@ -151,6 +166,21 @@ The JSON must strictly conform to the expected schema.`;
     });
     totalCredits += creditsUsed;
 
+    // Record step attempt for each retry (per-attempt tracking)
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: effectiveModel,
+        provider: result.providerName,
+        inputTokens,
+        outputTokens,
+        costUsd: costUsd?.toString(),
+        snapshot: plannerResult.snapshot,
+        creditsUsed,
+      }).catch(() => {});
+    }
+
     lastRawResponse = content;
 
     // Strip markdown fences and attempt JSON parse
diff --git a/apps/web/server/services/skillExecutor.ts b/apps/web/server/services/skillExecutor.ts
index 8491803f..42fe3d02 100644
--- a/apps/web/server/services/skillExecutor.ts
+++ b/apps/web/server/services/skillExecutor.ts
@@ -23,6 +23,7 @@ import {
   getModelsByTypeAsync,
 } from "./modelRegistry";
 import { calculateCreditCost } from "./pricingCalculator";
+import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
 import {
   isSandboxEnabled,
   shouldUseSandboxForFeature,
@@ -381,19 +382,19 @@ export async function executeSkill(
   switch (skill.type) {
     case "image-generation":
       console.log(`[SkillExecutor] Routing to executeImageGeneration`);
-      return executeImageGeneration(skill, params, userId, userToken);
+      return executeImageGeneration(skill, params, userId, userToken, tenantId);
 
     case "video-generation":
       console.log(`[SkillExecutor] Routing to executeVideoGeneration`);
-      return executeVideoGeneration(skill, params, userId, userToken);
+      return executeVideoGeneration(skill, params, userId, userToken, tenantId);
 
     case "image-video-generation":
       console.log(`[SkillExecutor] Skill type is image-video-generation, routing to video generation`);
-      return executeVideoGeneration(skill, params, userId, userToken);
+      return executeVideoGeneration(skill, params, userId, userToken, tenantId);
 
     case "audio-generation":
       console.log(`[SkillExecutor] Routing to executeAudioGeneration`);
-      return executeAudioGeneration(params, userId, userToken);
+      return executeAudioGeneration(params, userId, userToken, tenantId);
 
     case "automation":
     case "chat-assistant":
@@ -427,11 +428,20 @@ async function executeImageGeneration(
   skill: SkillDefinition,
   params: SkillExecutionParams,
   userId: number,
-  userToken: string
+  userToken: string,
+  tenantId?: string,
 ): Promise<SkillExecutionResult> {
   // Ensure model cache is loaded from DB before any lookups
   await getModelsByTypeAsync("image");
 
+  // Wire task planner for media tracking
+  const plannerResult = await runPlanner({
+    sourceType: "media",
+    userId,
+    tenantId: tenantId || "default",
+    skillSlug: skill.id,
+  });
+
   // Get model from params or defaults
   const modelInput = params.model || skill.defaultModel;
   let model: ImageModel;
@@ -509,6 +519,19 @@ async function executeImageGeneration(
     // Extract URLs
     const urls = result.data?.map((d) => d.url).filter((u): u is string => !!u) || [];
 
+    // Record step attempt for planner tracking
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: String(model),
+        inputTokens: 0,
+        outputTokens: 0,
+        snapshot: plannerResult.snapshot,
+        creditsUsed: result.creditsUsed || creditCost,
+      }).catch(() => {});
+    }
+
     return {
       success: true,
       skillId: skill.id,
@@ -536,11 +559,20 @@ async function executeVideoGeneration(
   skill: SkillDefinition,
   params: SkillExecutionParams,
   userId: number,
-  userToken: string
+  userToken: string,
+  tenantId?: string,
 ): Promise<SkillExecutionResult> {
   // Ensure model cache is loaded from DB before any lookups
   await getModelsByTypeAsync("video");
 
+  // Wire task planner for media tracking
+  const plannerResult = await runPlanner({
+    sourceType: "media",
+    userId,
+    tenantId: tenantId || "default",
+    skillSlug: skill.id,
+  });
+
   // Get model from params or defaults
   const modelInput = params.model || skill.defaultModel;
   let model: VideoModel;
@@ -626,6 +658,19 @@ async function executeVideoGeneration(
       status: task.status,
     });
 
+    // Record step attempt for planner tracking
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: String(model),
+        inputTokens: 0,
+        outputTokens: 0,
+        snapshot: plannerResult.snapshot,
+        creditsUsed: creditCost,
+      }).catch(() => {});
+    }
+
     return {
       success: true,
       skillId: skill.id,
@@ -656,11 +701,20 @@ async function executeVideoGeneration(
 export async function executeAudioGeneration(
   params: SkillExecutionParams,
   userId: number,
-  userToken: string
+  userToken: string,
+  tenantId?: string,
 ): Promise<SkillExecutionResult> {
   // Ensure model cache is loaded from DB before any lookups
   await getModelsByTypeAsync("audio");
 
+  // Wire task planner for media tracking
+  const plannerResult = await runPlanner({
+    sourceType: "media",
+    userId,
+    tenantId: tenantId || "default",
+    skillSlug: "audio-generation",
+  });
+
   // Get model from params or defaults
   const modelInput = params.model;
   let model: AudioModel;
@@ -729,6 +783,19 @@ export async function executeAudioGeneration(
     // Extract URL
     const url = result.data?.[0]?.url;
 
+    // Record step attempt for planner tracking
+    if (plannerResult) {
+      recordStepAttempt({
+        taskRunId: plannerResult.taskRunId,
+        plan: plannerResult.plan,
+        model: String(model),
+        inputTokens: 0,
+        outputTokens: 0,
+        snapshot: plannerResult.snapshot,
+        creditsUsed: result.creditsUsed || audioCreditCost,
+      }).catch(() => {});
+    }
+
     return {
       success: true,
       skillId: "audio-generation",
