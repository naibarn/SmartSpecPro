diff --git a/apps/web/server/routers/modelSuggestTool.test.ts b/apps/web/server/routers/modelSuggestTool.test.ts
index 9cfbf93d..954e6f29 100644
--- a/apps/web/server/routers/modelSuggestTool.test.ts
+++ b/apps/web/server/routers/modelSuggestTool.test.ts
@@ -13,7 +13,7 @@ vi.mock("../middleware/contentAutomationGate", () => ({
   contentAutomationGate: vi.fn((_req, _res, next) => next()),
 }));
 
-import { modelSuggestHandler, creditCostToTier } from "./modelSuggestTool";
+import { modelSuggestHandler, creditCostToTier, suggestModel } from "./modelSuggestTool";
 import { getModelsByTypeAsync } from "../services/modelRegistry";
 import { contentAutomationGate } from "../middleware/contentAutomationGate";
 
@@ -177,6 +177,104 @@ describe("modelSuggestTool handler", () => {
   });
 });
 
+describe("suggestModel() standalone function", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
+  });
+
+  it("quality_preference='speed' returns cheapest model as recommended", async () => {
+    const result = await suggestModel("image", "speed");
+    // img-model-4 has creditCost=1, the cheapest
+    expect(result.recommended).not.toBeNull();
+    expect(result.recommended!.model_id).toBe("img-model-4");
+  });
+
+  it("quality_preference='quality' returns lowest-priority-number model as recommended", async () => {
+    const result = await suggestModel("image", "quality");
+    // img-model-1 has priority=1 (lowest number = highest priority)
+    expect(result.recommended!.model_id).toBe("img-model-1");
+  });
+
+  it("quality_preference='balanced' produces same order as 'quality'", async () => {
+    const quality = await suggestModel("image", "quality");
+    const balanced = await suggestModel("image", "balanced");
+    expect(balanced.recommended!.model_id).toBe(quality.recommended!.model_id);
+  });
+
+  it("omitting quality_preference defaults to 'balanced' behaviour", async () => {
+    const balanced = await suggestModel("image", "balanced");
+    const omitted = await suggestModel("image");
+    expect(omitted.recommended!.model_id).toBe(balanced.recommended!.model_id);
+  });
+
+  it("returns at most 3 alternatives even with 5+ models available", async () => {
+    const sixModels = [
+      ...MOCK_MODELS,
+      { id: "img-model-5", name: "Extra 5", type: "image", provider: "openai", creditCost: 2, priority: 5, isEnabled: true, description: "Extra 5" },
+      { id: "img-model-6", name: "Extra 6", type: "image", provider: "openai", creditCost: 3, priority: 6, isEnabled: true, description: "Extra 6" },
+    ];
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue(sixModels as never);
+    const result = await suggestModel("image");
+    expect(result.alternatives.length).toBeLessThanOrEqual(3);
+  });
+
+  it("returns recommended: null when model list is empty", async () => {
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue([]);
+    const result = await suggestModel("image");
+    expect(result.recommended).toBeNull();
+  });
+
+  it("returns alternatives: [] when model list is empty", async () => {
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue([]);
+    const result = await suggestModel("image");
+    expect(result.alternatives).toEqual([]);
+  });
+
+  it("purpose='text' returns recommended: null with message, never calls getModelsByTypeAsync", async () => {
+    const result = await suggestModel("text");
+    expect(result.recommended).toBeNull();
+    expect(getModelsByTypeAsync).not.toHaveBeenCalled();
+  });
+
+  it("purpose='text' returns a non-empty message string", async () => {
+    const result = await suggestModel("text");
+    expect(result.message).toBeTruthy();
+    expect(typeof result.message).toBe("string");
+  });
+
+  it("model without priority field sorts after models with explicit priority (priority ?? 99)", async () => {
+    const modelsWithNoPriority = [
+      ...MOCK_MODELS,
+      { id: "no-priority-model", name: "No Priority", type: "image", provider: "openai", creditCost: 5, priority: undefined, isEnabled: true, description: "No priority" },
+    ];
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue(modelsWithNoPriority as never);
+    const result = await suggestModel("image", "quality");
+    const allReturned = [result.recommended, ...result.alternatives].filter(Boolean);
+    const ids = allReturned.map((m) => m!.model_id);
+    // no-priority-model should appear after models with explicit priority
+    const noPriorityIndex = ids.indexOf("no-priority-model");
+    if (noPriorityIndex !== -1) {
+      expect(noPriorityIndex).toBeGreaterThan(0);
+    }
+    // If it's not in alternatives (only top 4 models), verify img-model-1 is recommended
+    expect(result.recommended!.model_id).toBe("img-model-1");
+  });
+
+  it("getModelsByTypeAsync throwing returns { recommended: null, alternatives: [] } without re-throwing", async () => {
+    vi.mocked(getModelsByTypeAsync).mockRejectedValue(new Error("Registry down"));
+    await expect(suggestModel("image")).resolves.toEqual({ recommended: null, alternatives: [] });
+  });
+
+  it("response entries never contain raw creditCost field", async () => {
+    const result = await suggestModel("image");
+    const all = [result.recommended, ...result.alternatives].filter(Boolean);
+    for (const entry of all) {
+      expect(entry).not.toHaveProperty("creditCost");
+    }
+  });
+});
+
 describe("creditCostToTier", () => {
   it("maps creditCost <= 5 to 'low'", () => {
     expect(creditCostToTier(1)).toBe("low");
diff --git a/apps/web/server/routers/modelSuggestTool.ts b/apps/web/server/routers/modelSuggestTool.ts
index dc6529d0..fe394fca 100644
--- a/apps/web/server/routers/modelSuggestTool.ts
+++ b/apps/web/server/routers/modelSuggestTool.ts
@@ -13,6 +13,65 @@ export function creditCostToTier(creditCost: number): "low" | "medium" | "high"
   return "high";
 }
 
+interface ModelEntry {
+  model_id: string;
+  name: string;
+  provider: string;
+  cost_tier: "low" | "medium" | "high";
+  description: string;
+}
+
+interface SuggestResult {
+  recommended: ModelEntry | null;
+  alternatives: ModelEntry[];
+  message?: string;
+}
+
+export async function suggestModel(
+  purpose: "image" | "video" | "audio" | "text",
+  quality_preference?: "speed" | "balanced" | "quality",
+): Promise<SuggestResult> {
+  if (purpose === "text") {
+    return {
+      recommended: null,
+      alternatives: [],
+      message: "Text model selection is handled by the LLM router. Use the default model.",
+    };
+  }
+
+  try {
+    const models = await getModelsByTypeAsync(purpose as MediaType);
+
+    if (models.length === 0) {
+      return { recommended: null, alternatives: [] };
+    }
+
+    const sorted = [...models].sort((a, b) => {
+      if (quality_preference === "speed") {
+        return (a.creditCost ?? 0) - (b.creditCost ?? 0);
+      }
+      // "quality", "balanced", or omitted: sort by priority (lower = higher priority)
+      return (a.priority ?? 99) - (b.priority ?? 99);
+    });
+
+    const toEntry = (m: (typeof sorted)[number]): ModelEntry => ({
+      model_id: m.id,
+      name: m.name,
+      provider: m.provider,
+      cost_tier: creditCostToTier(m.creditCost),
+      description: m.description ?? "",
+    });
+
+    const [top, ...rest] = sorted;
+    return {
+      recommended: toEntry(top),
+      alternatives: rest.slice(0, 3).map(toEntry),
+    };
+  } catch {
+    return { recommended: null, alternatives: [] };
+  }
+}
+
 function verifyInternalToken(req: Request): boolean {
   const expected = ENV.webGatewayToken;
   if (!expected) return false;
@@ -42,59 +101,10 @@ export async function modelSuggestHandler(req: Request, res: Response): Promise<
     });
     return;
   }
-  const { purpose, quality_preference } = parseResult.data;
 
-  // 3. Handle "text" purpose — not in media model registry
-  if (purpose === "text") {
-    res.json({
-      success: true,
-      recommended: null,
-      alternatives: [],
-      message: "Text model selection is handled by the LLM router. Use the default model.",
-    });
-    return;
-  }
-
-  // 4. Fetch models by type
-  const models = await getModelsByTypeAsync(purpose as MediaType);
-
-  if (models.length === 0) {
-    res.json({
-      success: true,
-      recommended: null,
-      alternatives: [],
-      message: `No models available for purpose: ${purpose}`,
-    });
-    return;
-  }
-
-  // 5. Rank models by quality_preference
-  const sorted = [...models].sort((a, b) => {
-    if (quality_preference === "speed") {
-      // Lower creditCost = faster/cheaper
-      return (a.creditCost ?? 0) - (b.creditCost ?? 0);
-    }
-    // "quality" and "balanced": sort by priority (lower = higher priority)
-    return (a.priority ?? 0) - (b.priority ?? 0);
-  });
-
-  // 6. Build response (no raw creditCost exposed)
-  const toEntry = (m: typeof sorted[number]) => ({
-    model_id: m.id,
-    name: m.name,
-    provider: m.provider,
-    cost_tier: creditCostToTier(m.creditCost),
-    description: m.description ?? "",
-  });
-
-  const [top, ...rest] = sorted;
-  const alternatives = rest.slice(0, 3).map(toEntry);
-
-  res.json({
-    success: true,
-    recommended: toEntry(top),
-    alternatives,
-  });
+  const { purpose, quality_preference } = parseResult.data;
+  const result = await suggestModel(purpose, quality_preference);
+  res.json({ success: true, ...result });
 }
 
 export function registerModelSuggestToolRoute(app: Express): void {
