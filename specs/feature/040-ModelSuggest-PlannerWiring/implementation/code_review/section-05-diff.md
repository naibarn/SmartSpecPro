diff --git a/apps/web/server/routers/autoDraftTool.test.ts b/apps/web/server/routers/autoDraftTool.test.ts
index a531e78b..68e692a5 100644
--- a/apps/web/server/routers/autoDraftTool.test.ts
+++ b/apps/web/server/routers/autoDraftTool.test.ts
@@ -6,6 +6,15 @@ vi.mock("../_core/env", () => ({
   ENV: { webGatewayToken: "test-gateway-token" },
 }));
 
+vi.mock("./modelSuggestTool", () => ({
+  suggestModel: vi.fn(),
+}));
+
+vi.mock("../services/modelRegistry", () => ({
+  getModelsByTypeAsync: vi.fn(),
+  getDefaultModel: vi.fn(),
+}));
+
 vi.mock("../services/contentAutomationRateLimit", () => ({
   checkHourlyRate: vi.fn(),
   acquireConcurrentSlot: vi.fn(),
@@ -56,6 +65,8 @@ import { getRedisClient } from "../services/redis";
 import { getDb } from "../db";
 import { signBearerToken } from "../_core/tokens";
 import { auditLogger } from "../services/auditLogger";
+import { suggestModel } from "./modelSuggestTool";
+import { getDefaultModel } from "../services/modelRegistry";
 import { createLibraryItem } from "../services/libraryService";
 import { createPresentationDeckForLibraryItem } from "../services/presentationService";
 
@@ -148,6 +159,13 @@ beforeEach(() => {
     deck: { id: 99, libraryItemId: 11, tenantId: "tenant-1", title: "How to build a React app", version: 0 } as never,
   });
   vi.mocked(auditLogger.log).mockReturnValue(undefined);
+
+  // Default: suggestModel returns a recommendation
+  vi.mocked(suggestModel).mockResolvedValue({
+    recommended: { model_id: "flux-2.0", name: "Flux", provider: "fal", cost_tier: "low", description: "" },
+    alternatives: [],
+  });
+  vi.mocked(getDefaultModel).mockReturnValue({ id: "default-img-model" } as never);
 });
 
 describe("autoDraftTool handler", () => {
@@ -437,3 +455,141 @@ describe("autoDraftTool handler", () => {
     });
   });
 });
+
+describe("autoDraftTool model selection", () => {
+  it("calls suggestModel when image_model_id is absent", async () => {
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(suggestModel)).toHaveBeenCalledWith("image", "balanced");
+  });
+
+  it("uses recommended model_id from suggestModel when image_model_id is absent", async () => {
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(generateAIDraft)).toHaveBeenCalledWith(
+      expect.objectContaining({ imageModel: "flux-2.0" }),
+      expect.anything(),
+      expect.anything(),
+      expect.anything(),
+    );
+  });
+
+  it("does NOT call suggestModel when image_model_id is present", async () => {
+    const req = buildMockRequest({ image_model_id: "grok-imagine" });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(suggestModel)).not.toHaveBeenCalled();
+  });
+
+  it("uses agent's model unchanged when image_model_id is present", async () => {
+    const req = buildMockRequest({ image_model_id: "grok-imagine" });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(generateAIDraft)).toHaveBeenCalledWith(
+      expect.objectContaining({ imageModel: "grok-imagine" }),
+      expect.anything(),
+      expect.anything(),
+      expect.anything(),
+    );
+  });
+
+  it("auto-draft completes when suggestModel throws — no error returned to caller", async () => {
+    vi.mocked(suggestModel).mockRejectedValue(new Error("Registry down"));
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res, jsonMock } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    const call = jsonMock.mock.calls[0][0];
+    expect(call.success).toBe(true);
+  });
+
+  it("uses getDefaultModel fallback when suggestModel throws", async () => {
+    vi.mocked(suggestModel).mockRejectedValue(new Error("Registry down"));
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(generateAIDraft)).toHaveBeenCalledWith(
+      expect.objectContaining({ imageModel: "default-img-model" }),
+      expect.anything(),
+      expect.anything(),
+      expect.anything(),
+    );
+  });
+
+  it("uses getDefaultModel fallback when suggestModel returns null recommended", async () => {
+    vi.mocked(suggestModel).mockResolvedValue({ recommended: null, alternatives: [] });
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    expect(vi.mocked(generateAIDraft)).toHaveBeenCalledWith(
+      expect.objectContaining({ imageModel: "default-img-model" }),
+      expect.anything(),
+      expect.anything(),
+      expect.anything(),
+    );
+  });
+
+  it("emits auto_draft.model_selected event when agent omits image_model_id", async () => {
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    const auditCalls = vi.mocked(auditLogger.log).mock.calls.map((c) => c[0]);
+    const modelSelectedCall = auditCalls.find((c) => c.eventType === "auto_draft.model_selected");
+    expect(modelSelectedCall).toBeDefined();
+  });
+
+  it("diverged=false when agent omits image_model_id (system chose)", async () => {
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    const auditCalls = vi.mocked(auditLogger.log).mock.calls.map((c) => c[0]);
+    const modelSelectedCall = auditCalls.find((c) => c.eventType === "auto_draft.model_selected");
+    expect(modelSelectedCall?.metadata).toMatchObject({ diverged: false });
+  });
+
+  it("emits auto_draft.model_selected event when agent provides image_model_id", async () => {
+    const req = buildMockRequest({ image_model_id: "grok-imagine" });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    const auditCalls = vi.mocked(auditLogger.log).mock.calls.map((c) => c[0]);
+    const modelSelectedCall = auditCalls.find((c) => c.eventType === "auto_draft.model_selected");
+    expect(modelSelectedCall).toBeDefined();
+  });
+
+  it("audit event contains agentModel, recommendedModel, imageModelUsed, diverged on suggestion path", async () => {
+    const req = buildMockRequest({ image_model_id: undefined });
+    const { res } = buildMockResponse();
+
+    await autoDraftToolHandler(req, res);
+
+    const auditCalls = vi.mocked(auditLogger.log).mock.calls.map((c) => c[0]);
+    const modelSelectedCall = auditCalls.find((c) => c.eventType === "auto_draft.model_selected");
+    expect(modelSelectedCall?.metadata).toMatchObject({
+      agentModel: null,
+      recommendedModel: "flux-2.0",
+      imageModelUsed: "flux-2.0",
+      diverged: false,
+    });
+  });
+});
diff --git a/apps/web/server/routers/autoDraftTool.ts b/apps/web/server/routers/autoDraftTool.ts
index 14c967fb..eb0311cf 100644
--- a/apps/web/server/routers/autoDraftTool.ts
+++ b/apps/web/server/routers/autoDraftTool.ts
@@ -21,6 +21,8 @@ import {
   AutoDraftRequestSchema,
   canvasPresetToSize,
 } from "@shared/contentAutomation/types";
+import { suggestModel } from "./modelSuggestTool";
+import { getDefaultModel } from "../services/modelRegistry";
 
 const FALLBACK_ARTICLE_SKILL = "general-article-writer";
 
@@ -199,6 +201,32 @@ export async function autoDraftToolHandler(req: Request, res: Response): Promise
     return;
   }
 
+  // Resolve image model: agent-specified → suggested → default
+  let imageModel: string | undefined = input.image_model_id;
+  let recommendedModel: string | undefined;
+
+  if (!input.image_model_id) {
+    try {
+      const suggestResult = await suggestModel("image", "balanced");
+      recommendedModel = suggestResult.recommended?.model_id;
+      imageModel = recommendedModel ?? getDefaultModel("image")?.id;
+    } catch {
+      imageModel = getDefaultModel("image")?.id;
+    }
+  }
+
+  emitAuditLog(
+    "auto_draft.model_selected",
+    {
+      agentModel: input.image_model_id ?? null,
+      recommendedModel: recommendedModel ?? null,
+      imageModelUsed: imageModel ?? null,
+      diverged: !!input.image_model_id && input.image_model_id !== recommendedModel,
+    },
+    userId,
+    tenantId,
+  );
+
   try {
     // 14. Build GenerateAIDraftInput and await generateAIDraft (blocking)
     const draftInput = {
@@ -209,7 +237,7 @@ export async function autoDraftToolHandler(req: Request, res: Response): Promise
       language: (input.language as "auto" | "en" | "th") ?? "auto",
       articleSkillId,
       imageSkillId,
-      imageModel: input.image_model_id,
+      imageModel,
       canvasWidth: canvasDims.width,
       canvasHeight: canvasDims.height,
       stylePresetId: (input.style_preset ?? "dark-professional") as never,
