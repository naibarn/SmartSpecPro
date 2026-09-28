diff --git a/apps/web/scripts/seed-media-models-kie-ai.ts b/apps/web/scripts/seed-media-models-kie-ai.ts
index f4e1a8d39..77147a3b7 100644
--- a/apps/web/scripts/seed-media-models-kie-ai.ts
+++ b/apps/web/scripts/seed-media-models-kie-ai.ts
@@ -1574,6 +1574,10 @@ const IMAGE_MODELS = [
       generateType: "text-to-image",
       supportsReferenceImages: true,
       maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "gpt_image_2",
+        negativePromptMode: "inline_only",
+      },
       maxReferenceImages: 16,
       apiConfig: {
         kie_model_id_with_references: "gpt-image-2-image-to-image",
@@ -1678,6 +1682,34 @@ const IMAGE_MODELS = [
   },
 
   // === Nano Banana (Google) ===
+  {
+    modelId: "google-nano-banana-pro",
+    name: "Google Nano Banana Pro",
+    description: "Google Nano Banana Pro image generation and editing.",
+    modelType: "image",
+    provider: "kie.ai",
+    aliases: ["nano banana pro", "nano_banana_pro", "nanobananapro", "google nano banana"],
+    creditCost: 10,
+    priority: 1,
+    sortOrder: 1,
+    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "nano-banana-pro",
+      generateType: "image-to-image",
+      maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
+      inputFields: [
+        { key: "image_input", label: "Reference Images", type: "image_urls" },
+      ],
+      pricingTiers: { "default": 10 },
+      pricingFormula: "flat",
+    } as ModelDefinition,
+  },
   {
     modelId: "google/nano-banana",
     name: "Nano Banana",
@@ -1694,6 +1726,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "nano-banana",
       generateType: "text-to-image",
+      maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "resolution", label: "Resolution", type: "select",
           options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
@@ -1723,6 +1760,10 @@ const IMAGE_MODELS = [
       kieModelId: "nano-banana-2",
       generateType: "text-to-image",
       maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       // Multi-view (planning/marketplace-multi-product-reference-images):
       // kie.ai nano-banana-2 accepts up to 14 input images. Keeps the
       // marketplace-auto-review reference cap in sync on every re-seed.
@@ -1768,6 +1809,10 @@ const IMAGE_MODELS = [
       kieModelId: "nano-banana-2-lite",
       generateType: "text-to-image",
       maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       maxReferenceImages: 10,
       reference_image_input_key: "image_urls",
       reference_image_input_type: "array",
@@ -1803,6 +1848,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "nano-banana-pro",
       generateType: "image-to-image",
+      maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "resolution", label: "Resolution", type: "select",
           options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }],
@@ -1840,6 +1890,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "nano-banana-edit",
       generateType: "edit",
+      maxPromptLength: 20000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "image_input", label: "Source Image", type: "image_urls", required: true },
         { key: "resolution", label: "Resolution", type: "select",
@@ -2022,6 +2077,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "seedream",
       generateType: "text-to-image",
+      maxPromptLength: 5000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
           options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
@@ -2047,6 +2107,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "seedream/seedream-v4-text-to-image",
       generateType: "text-to-image",
+      maxPromptLength: 5000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
           options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
@@ -2072,6 +2137,11 @@ const IMAGE_MODELS = [
       apiPayloadFormat: "market",
       kieModelId: "seedream/4.5-text-to-image",
       generateType: "text-to-image",
+      maxPromptLength: 5000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "quality", label: "Quality", type: "select",
           options: [{ value: "basic", label: "Basic" }, { value: "high", label: "High" }],
@@ -2112,6 +2182,10 @@ const IMAGE_MODELS = [
       generateType: "text-to-image",
       supportsReferenceImages: true,
       maxPromptLength: 5000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
       maxReferenceImages: 10,
       apiConfig: {
         kie_model_id_with_references: "seedream/5-pro-image-to-image",
diff --git a/apps/web/server/services/__tests__/modelPromptBudget.test.ts b/apps/web/server/services/__tests__/modelPromptBudget.test.ts
index 681d7efa4..c31e23103 100644
--- a/apps/web/server/services/__tests__/modelPromptBudget.test.ts
+++ b/apps/web/server/services/__tests__/modelPromptBudget.test.ts
@@ -72,4 +72,20 @@ describe("model prompt budget", () => {
     mockGetStaticModelById.mockReturnValue(undefined);
     expect(resolveVdImagePromptBudgetForModel({ modelId: "missing" })).toBe(3800);
   });
+
+  it("keeps legacy budget resolution independent from target contract validation", () => {
+    mockGetStaticModelById.mockReturnValue(undefined);
+    expect(
+      resolveVdImagePromptBudgetForModel({
+        modelId: "seedream/5-pro-text-to-image",
+        configJson: { maxPromptLength: 5_000 },
+      }),
+    ).toBe(5_000);
+    expect(
+      resolveVdImagePromptBudgetForModel({
+        modelId: "legacy-image-model",
+        configJson: { maxPromptLength: 500 },
+      }),
+    ).toBe(3_800);
+  });
 });
diff --git a/apps/web/server/services/__tests__/verticalDramaCharacterPromptCatalogParity.test.ts b/apps/web/server/services/__tests__/verticalDramaCharacterPromptCatalogParity.test.ts
new file mode 100644
index 000000000..6240eea88
--- /dev/null
+++ b/apps/web/server/services/__tests__/verticalDramaCharacterPromptCatalogParity.test.ts
@@ -0,0 +1,124 @@
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+import { describe, expect, it } from "vitest";
+import { getStaticFallbackModels, getStaticModelById } from "../modelRegistry";
+import { resolveVerticalDramaCharacterPromptCapability } from "../verticalDramaCharacterPromptContract";
+
+describe("Vertical Drama character prompt catalog parity", () => {
+  it("keeps static Nano Banana entries explicitly target-capable", () => {
+    const models = getStaticFallbackModels();
+    for (const [id, family, maxPromptLength] of [
+      ["google-nano-banana-pro", "nano_banana", 20_000],
+      ["google-banana-2", "nano_banana", 20_000],
+      ["google-banana-2-lite", "nano_banana", 20_000],
+      ["gpt-image-2-text-to-image", "gpt_image_2", 20_000],
+      ["google/nano-banana", "nano_banana", 20_000],
+      ["google/pro-image-to-image", "nano_banana", 20_000],
+      ["google/nano-banana-edit", "nano_banana", 20_000],
+      ["seedream", "seedream", 5_000],
+      ["seedream/seedream-v4-text-to-image", "seedream", 5_000],
+      ["seedream/4.5-text-to-image", "seedream", 5_000],
+      ["seedream/5-pro-text-to-image", "seedream", 5_000],
+    ] as const) {
+      const model = models.find(entry => entry.id === id);
+      expect(model, `missing static model ${id}`).toBeDefined();
+      expect(model?.configJson).toMatchObject({
+        maxPromptLength,
+        verticalDramaCharacterPromptContract: {
+          family,
+          negativePromptMode: "inline_only",
+        },
+      });
+    }
+  });
+
+  it("keeps Kie seed rows explicitly target-capable", () => {
+    const source = readFileSync(
+      resolve(__dirname, "../../../scripts/seed-media-models-kie-ai.ts"),
+      "utf8",
+    );
+
+    const modelBlock = (modelId: string) => {
+      const start = source.indexOf(`modelId: "${modelId}"`);
+      const next = source.indexOf("\n  {\n    modelId:", start + 1);
+      return source.slice(start, next === -1 ? source.length : next);
+    };
+
+    for (const [modelId, family, maxPromptLength] of [
+      ["gpt-image-2-text-to-image", "gpt_image_2", "20000"],
+      ["google-nano-banana-pro", "nano_banana", "20000"],
+      ["google/nano-banana", "nano_banana", "20000"],
+      ["google-banana-2", "nano_banana", "20000"],
+      ["google-banana-2-lite", "nano_banana", "20000"],
+      ["google/pro-image-to-image", "nano_banana", "20000"],
+      ["google/nano-banana-edit", "nano_banana", "20000"],
+      ["seedream", "seedream", "5000"],
+      ["seedream/seedream-v4-text-to-image", "seedream", "5000"],
+      ["seedream/4.5-text-to-image", "seedream", "5000"],
+      ["seedream/5-pro-text-to-image", "seedream", "5000"],
+    ]) {
+      const block = modelBlock(modelId);
+      expect(block, `missing seed model ${modelId}`).toContain(`modelId: "${modelId}"`);
+      expect(block).toContain(`maxPromptLength: ${maxPromptLength}`);
+      expect(block).toContain(`family: "${family}"`);
+      expect(block).toContain('negativePromptMode: "inline_only"');
+    }
+  });
+
+  it("uses the canonical selected family even when a reference route differs", () => {
+    const capability = resolveVerticalDramaCharacterPromptCapability(
+      {
+        modelId: "seedream/5-pro-text-to-image",
+        referenceImageRoute: "google-banana-2",
+      },
+      { requireTarget: true },
+    );
+
+    expect(capability).toMatchObject({
+      family: "seedream",
+      maxPromptChars: 5_000,
+      source: "static",
+    });
+  });
+
+  it.each([
+    ["nano-banana", "google/nano-banana", "nano_banana", 20_000],
+    ["nano-banana-pro", "google-nano-banana-pro", "nano_banana", 20_000],
+    ["seedream-3", "seedream", "seedream", 5_000],
+    ["seedream-4", "seedream/seedream-v4-text-to-image", "seedream", 5_000],
+    ["seedream-4.5", "seedream/4.5-text-to-image", "seedream", 5_000],
+    ["seedream-5-pro", "seedream/5-pro-text-to-image", "seedream", 5_000],
+  ] as const)("resolves %s alias to its target contract", (_alias, modelId, family, maxPromptChars) => {
+    const capability = resolveVerticalDramaCharacterPromptCapability(
+      { modelId: _alias },
+      { requireTarget: true },
+    );
+
+    expect(capability).toMatchObject({
+      canonicalModelId: modelId,
+      family,
+      maxPromptChars,
+      negativePromptMode: "inline_only",
+    });
+  });
+
+  it("keeps representative non-target static entries unchanged and legacy", () => {
+    for (const [lookupKey, expectedId] of [
+      ["flux-2.0", "flux-2.0"],
+      ["z-image", "z-image"],
+      ["grok-imagine", "grok-imagine"],
+    ] as const) {
+      const model = getStaticModelById(lookupKey);
+      expect(model?.id).toBe(expectedId);
+      expect(model?.configJson?.verticalDramaCharacterPromptContract).toBeUndefined();
+
+      const capability = resolveVerticalDramaCharacterPromptCapability({ modelId: lookupKey });
+      expect(capability).toMatchObject({
+        family: "other",
+        negativePromptMode: "separate_legacy",
+        promptProfile: "legacy",
+        configured: false,
+      });
+    }
+  });
+});
diff --git a/apps/web/server/services/__tests__/verticalDramaCharacterPromptContract.test.ts b/apps/web/server/services/__tests__/verticalDramaCharacterPromptContract.test.ts
new file mode 100644
index 000000000..cd512cc5a
--- /dev/null
+++ b/apps/web/server/services/__tests__/verticalDramaCharacterPromptContract.test.ts
@@ -0,0 +1,271 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+const { mockGetStaticModelById } = vi.hoisted(() => ({
+  mockGetStaticModelById: vi.fn(),
+}));
+
+vi.mock("../modelRegistry", () => ({
+  getStaticModelById: mockGetStaticModelById,
+}));
+
+import {
+  assertVerticalDramaCharacterPromptLength,
+  isTargetVerticalDramaCharacterCapability,
+  resolveVerticalDramaCharacterPromptCapability,
+} from "../verticalDramaCharacterPromptContract";
+
+const contract = {
+  family: "gpt_image_2",
+  negativePromptMode: "inline_only",
+};
+
+describe("vertical drama character prompt contract", () => {
+  beforeEach(() => mockGetStaticModelById.mockReset());
+
+  it("resolves GPT Image 2 as rich single-prompt target capability", () => {
+    const capability = resolveVerticalDramaCharacterPromptCapability(
+      {
+        modelId: "gpt-image-2-text-to-image",
+        configJson: { maxPromptLength: 20_000, verticalDramaCharacterPromptContract: contract },
+      },
+      { requireTarget: true },
+    );
+
+    expect(capability).toMatchObject({
+      family: "gpt_image_2",
+      maxPromptChars: 20_000,
+      negativePromptMode: "inline_only",
+      promptProfile: "rich",
+      source: "db",
+      configured: true,
+    });
+    expect(isTargetVerticalDramaCharacterCapability(capability)).toBe(true);
+  });
+
+  it("resolves Seedream as a compact 5,000-character target", () => {
+    const capability = resolveVerticalDramaCharacterPromptCapability(
+      {
+        modelId: "seedream/5-pro-text-to-image",
+        configJson: {
+          maxPromptLength: 5_000,
+          verticalDramaCharacterPromptContract: {
+            family: "seedream",
+            negativePromptMode: "inline_only",
+          },
+        },
+      },
+      { requireTarget: true },
+    );
+
+    expect(capability).toMatchObject({
+      family: "seedream",
+      maxPromptChars: 5_000,
+      promptProfile: "compact",
+    });
+  });
+
+  it("prefers DB metadata over a conflicting static fallback", () => {
+    mockGetStaticModelById.mockReturnValue({
+      id: "gpt-image-2-text-to-image",
+      configJson: {
+        maxPromptLength: 20_000,
+        verticalDramaCharacterPromptContract: {
+          family: "gpt_image_2",
+          negativePromptMode: "inline_only",
+        },
+      },
+    });
+
+    expect(
+      resolveVerticalDramaCharacterPromptCapability(
+        {
+          modelId: "gpt-image-2-text-to-image",
+          configJson: { maxPromptLength: 20_000, verticalDramaCharacterPromptContract: contract },
+        },
+        { requireTarget: true },
+      ),
+    ).toMatchObject({ family: "gpt_image_2", source: "db" });
+  });
+
+  it("keeps reference-image route resolution on the same capability", () => {
+    const text = resolveVerticalDramaCharacterPromptCapability(
+      {
+        modelId: "seedream/5-pro-text-to-image",
+        configJson: {
+          maxPromptLength: 5_000,
+          verticalDramaCharacterPromptContract: {
+            family: "seedream",
+            negativePromptMode: "inline_only",
+          },
+        },
+      },
+      { requireTarget: true },
+    );
+    const reference = resolveVerticalDramaCharacterPromptCapability(
+      {
+        modelId: "seedream/5-pro-text-to-image",
+        referenceImageRoute: "google-banana-2",
+        configJson: {
+          maxPromptLength: 5_000,
+          verticalDramaCharacterPromptContract: {
+            family: "seedream",
+            negativePromptMode: "inline_only",
+          },
+        },
+      },
+      { requireTarget: true },
+    );
+
+    expect(reference).toEqual(text);
+  });
+
+  it("uses a complete static fallback when DB config is absent", () => {
+    mockGetStaticModelById.mockReturnValue({
+      configJson: {
+        maxPromptLength: 20_000,
+        verticalDramaCharacterPromptContract: {
+          family: "nano_banana",
+          negativePromptMode: "inline_only",
+        },
+      },
+    });
+
+    expect(
+      resolveVerticalDramaCharacterPromptCapability(
+        { modelId: "google-nano-banana-pro" },
+        { requireTarget: true },
+      ),
+    ).toMatchObject({
+      family: "nano_banana",
+      maxPromptChars: 20_000,
+      source: "static",
+      promptProfile: "rich",
+    });
+  });
+
+  it("fails closed when target metadata is incomplete", () => {
+    mockGetStaticModelById.mockReturnValue(undefined);
+
+    expect(() =>
+      resolveVerticalDramaCharacterPromptCapability(
+        { modelId: "unknown-model", configJson: { maxPromptLength: 20_000 } },
+        { requireTarget: true },
+      ),
+    ).toThrowError(expect.objectContaining({
+      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING",
+    }));
+  });
+
+  it.each([
+    [{ family: "not_a_family", negativePromptMode: "inline_only" }, 20_000],
+    [{ family: "gpt_image_2", negativePromptMode: "separate_legacy" }, 20_000],
+    [{ family: "seedream", negativePromptMode: "inline_only" }, 20_000],
+  ])("rejects malformed target contract %#", (rawContract, maxPromptLength) => {
+    expect(() =>
+      resolveVerticalDramaCharacterPromptCapability(
+        {
+          modelId: "invalid-model",
+          configJson: { maxPromptLength, verticalDramaCharacterPromptContract: rawContract },
+        },
+        { requireTarget: true },
+      ),
+    ).toThrowError(expect.objectContaining({
+      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
+    }));
+  });
+
+  it("rejects fractional target limits instead of flooring them", () => {
+    expect(() =>
+      resolveVerticalDramaCharacterPromptCapability(
+        {
+          modelId: "gpt-image-2-text-to-image",
+          configJson: {
+            maxPromptLength: 20_000.9,
+            verticalDramaCharacterPromptContract: contract,
+          },
+        },
+        { requireTarget: true },
+      ),
+    ).toThrowError(expect.objectContaining({
+      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
+    }));
+  });
+
+  it("keeps an unmarked caller on the explicit legacy path", () => {
+    mockGetStaticModelById.mockReturnValue(undefined);
+
+    expect(
+      resolveVerticalDramaCharacterPromptCapability({ modelId: "legacy-model" }),
+    ).toMatchObject({
+      family: "other",
+      maxPromptChars: 3_800,
+      negativePromptMode: "separate_legacy",
+      promptProfile: "legacy",
+      source: "explicit_legacy",
+      configured: false,
+    });
+  });
+
+  it.each([
+    ["gpt_image_2", 20_000],
+    ["nano_banana", 20_000],
+    ["seedream", 5_000],
+  ] as const)("accepts exact target boundary for %s", (family, limit) => {
+    const capability = {
+      family,
+      maxPromptChars: limit,
+      negativePromptMode: "inline_only" as const,
+      promptProfile: family === "seedream" ? "compact" as const : "rich" as const,
+      source: "db" as const,
+      canonicalModelId: "model",
+      configured: true,
+    };
+
+    expect(() => assertVerticalDramaCharacterPromptLength("x".repeat(limit), capability)).not.toThrow();
+    expect(() => assertVerticalDramaCharacterPromptLength(`${"x".repeat(limit)}y`, capability)).toThrow(
+      /too[_ ]long/i,
+    );
+  });
+
+  it("uses JavaScript string.length semantics for Thai and emoji", () => {
+    const capability = {
+      family: "seedream" as const,
+      maxPromptChars: 5,
+      negativePromptMode: "inline_only" as const,
+      promptProfile: "compact" as const,
+      source: "db" as const,
+      canonicalModelId: "seedream/5-pro-text-to-image",
+      configured: true,
+    };
+
+    expect(() => assertVerticalDramaCharacterPromptLength("ไทย", capability)).not.toThrow();
+    expect(() => assertVerticalDramaCharacterPromptLength("🙂🙂🙂", capability)).toThrow(/too[_ ]long/i);
+  });
+
+  it("exposes bounded structured length metadata without the prompt body", () => {
+    const capability = {
+      family: "seedream" as const,
+      maxPromptChars: 5,
+      negativePromptMode: "inline_only" as const,
+      promptProfile: "compact" as const,
+      source: "db" as const,
+      canonicalModelId: "seedream/5-pro-text-to-image",
+      configured: true,
+    };
+    const sensitivePrompt = "secret-character-prompt";
+
+    expect(() => assertVerticalDramaCharacterPromptLength(sensitivePrompt, capability)).toThrow();
+    try {
+      assertVerticalDramaCharacterPromptLength(sensitivePrompt, capability);
+    } catch (error) {
+      expect(error).toMatchObject({
+        code: "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG",
+        modelId: "seedream/5-pro-text-to-image",
+        family: "seedream",
+        maxPromptChars: 5,
+        promptLength: sensitivePrompt.length,
+      });
+      expect((error as Error).message).not.toContain(sensitivePrompt);
+    }
+  });
+});
diff --git a/apps/web/server/services/modelRegistry.ts b/apps/web/server/services/modelRegistry.ts
index b590bf494..b8e68a5f8 100644
--- a/apps/web/server/services/modelRegistry.ts
+++ b/apps/web/server/services/modelRegistry.ts
@@ -454,9 +454,212 @@ const STATIC_MODEL_REGISTRY: ModelDefinition[] = [
     creditCost: 10,
     aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
     sizes: ["1024x1024", "1024x1792", "1792x1024"],
+    configJson: {
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
+    },
     isEnabled: true,
     priority: 1,
   },
+  {
+    id: "gpt-image-2-text-to-image",
+    type: "image",
+    name: "GPT Image 2",
+    provider: "kie.ai",
+    description: "OpenAI GPT Image 2 generation and reference-image editing via Kie AI.",
+    aliases: ["gpt-image-2", "gpt image 2", "gpt-image-2-image-to-image", "gpt-image-2-edit"],
+    creditCost: 70,
+    aspectRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "gpt-image-2-text-to-image",
+      generateType: "text-to-image",
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "gpt_image_2",
+        negativePromptMode: "inline_only",
+      },
+      maxReferenceImages: 16,
+      apiConfig: {
+        kie_model_id_with_references: "gpt-image-2-image-to-image",
+        reference_image_input_key: "input_urls",
+        reference_image_input_type: "array",
+      },
+    },
+    isEnabled: true,
+    priority: 7,
+  },
+  {
+    id: "google/nano-banana",
+    type: "image",
+    name: "Nano Banana",
+    provider: "kie.ai",
+    description: "Google Nano Banana image generation.",
+    aliases: ["nano-banana", "banana"],
+    creditCost: 20,
+    aspectRatios: ["1:1", "16:9", "9:16"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "nano-banana",
+      generateType: "text-to-image",
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 15,
+  },
+  {
+    id: "google/pro-image-to-image",
+    type: "image",
+    name: "Nano Banana Pro",
+    provider: "kie.ai",
+    description: "Nano Banana Pro image editing and generation.",
+    aliases: ["nano-banana-pro", "banana-pro"],
+    creditCost: 40,
+    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "nano-banana-pro",
+      generateType: "image-to-image",
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 10,
+  },
+  {
+    id: "google/nano-banana-edit",
+    type: "image",
+    name: "Nano Banana Edit",
+    provider: "kie.ai",
+    description: "Nano Banana image editing.",
+    aliases: ["nano-banana-edit", "banana-edit"],
+    creditCost: 40,
+    aspectRatios: ["1:1", "16:9", "9:16"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "nano-banana-edit",
+      generateType: "edit",
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 14,
+  },
+  {
+    id: "seedream",
+    type: "image",
+    name: "Seedream 3.0",
+    provider: "kie.ai",
+    description: "Seedream 3.0 image generation.",
+    aliases: ["seedream-3", "seedream3"],
+    creditCost: 25,
+    aspectRatios: ["1:1", "16:9", "9:16"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "seedream",
+      generateType: "text-to-image",
+      maxPromptLength: 5_000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 20,
+  },
+  {
+    id: "seedream/seedream-v4-text-to-image",
+    type: "image",
+    name: "Seedream 4.0",
+    provider: "kie.ai",
+    description: "Seedream 4.0 image generation.",
+    aliases: ["seedream-4", "seedream4"],
+    creditCost: 35,
+    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "seedream/seedream-v4-text-to-image",
+      generateType: "text-to-image",
+      maxPromptLength: 5_000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 18,
+  },
+  {
+    id: "seedream/4.5-text-to-image",
+    type: "image",
+    name: "Seedream 4.5",
+    provider: "kie.ai",
+    description: "Seedream 4.5 image generation.",
+    aliases: ["seedream-4.5", "seedream45"],
+    creditCost: 45,
+    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "seedream/4.5-text-to-image",
+      generateType: "text-to-image",
+      maxPromptLength: 5_000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
+    },
+    isEnabled: true,
+    priority: 13,
+  },
+  {
+    id: "seedream/5-pro-text-to-image",
+    type: "image",
+    name: "Seedream 5.0 Pro",
+    provider: "kie.ai",
+    description: "Seedream 5.0 Pro image generation and reference editing.",
+    aliases: ["seedream-5-pro", "seedream 5 pro", "seedream/5-pro-image-to-image"],
+    creditCost: 70,
+    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"],
+    configJson: {
+      apiEndpoint: "/api/v1/jobs/createTask",
+      apiPayloadFormat: "market",
+      kieModelId: "seedream/5-pro-text-to-image",
+      generateType: "text-to-image",
+      maxPromptLength: 5_000,
+      verticalDramaCharacterPromptContract: {
+        family: "seedream",
+        negativePromptMode: "inline_only",
+      },
+      maxReferenceImages: 10,
+      apiConfig: {
+        kie_model_id_with_references: "seedream/5-pro-image-to-image",
+        reference_image_input_key: "image_urls",
+        reference_image_input_type: "array",
+      },
+    },
+    isEnabled: true,
+    priority: 6,
+  },
   {
     id: "google-banana-2",
     type: "image",
@@ -485,6 +688,11 @@ const STATIC_MODEL_REGISTRY: ModelDefinition[] = [
       apiPayloadFormat: "market",
       generateType: "text-to-image",
       maxReferenceImages: 14,
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       inputFields: [
         { key: "image_input", label: "Reference Images", type: "image_urls", syncWith: "none" },
       ],
@@ -517,6 +725,11 @@ const STATIC_MODEL_REGISTRY: ModelDefinition[] = [
       kieModelId: "nano-banana-2-lite",
       generateType: "text-to-image",
       maxReferenceImages: 10,
+      maxPromptLength: 20_000,
+      verticalDramaCharacterPromptContract: {
+        family: "nano_banana",
+        negativePromptMode: "inline_only",
+      },
       reference_image_input_key: "image_urls",
       reference_image_input_type: "array",
       inputFields: [
diff --git a/apps/web/server/services/verticalDramaCharacterPromptContract.ts b/apps/web/server/services/verticalDramaCharacterPromptContract.ts
new file mode 100644
index 000000000..4fa4e1a3e
--- /dev/null
+++ b/apps/web/server/services/verticalDramaCharacterPromptContract.ts
@@ -0,0 +1,221 @@
+import {
+  resolveConfiguredMaxPromptLength,
+  resolveVdImagePromptBudgetForModel,
+} from "./modelPromptBudget";
+import { getStaticModelById } from "./modelRegistry";
+
+export const VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_KEY =
+  "verticalDramaCharacterPromptContract" as const;
+
+export const VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION =
+  "vd_character_natural_human_v1" as const;
+
+export type VerticalDramaCharacterPromptFamily =
+  | "gpt_image_2"
+  | "nano_banana"
+  | "seedream"
+  | "other";
+
+export type VerticalDramaCharacterPromptCapability = {
+  family: VerticalDramaCharacterPromptFamily;
+  maxPromptChars: number;
+  negativePromptMode: "inline_only" | "separate_legacy";
+  promptProfile: "rich" | "compact" | "legacy";
+  source: "db" | "static" | "explicit_legacy";
+  canonicalModelId: string;
+  configured: boolean;
+};
+
+export type VerticalDramaCharacterPromptModelContext = {
+  modelId: string;
+  configJson?: Record<string, unknown> | null;
+  referenceImageRoute?: string;
+};
+
+export type VerticalDramaCharacterPromptContractErrorCode =
+  | "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING"
+  | "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID"
+  | "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG";
+
+export class VerticalDramaCharacterPromptContractError extends Error {
+  readonly code: VerticalDramaCharacterPromptContractErrorCode;
+  readonly modelId: string;
+  readonly family?: VerticalDramaCharacterPromptFamily;
+  readonly maxPromptChars?: number;
+  readonly promptLength?: number;
+
+  constructor(params: {
+    code: VerticalDramaCharacterPromptContractErrorCode;
+    modelId: string;
+    detail: string;
+    family?: VerticalDramaCharacterPromptFamily;
+    maxPromptChars?: number;
+    promptLength?: number;
+  }) {
+    super(`${params.code}: model ${params.modelId} ${params.detail}`);
+    this.name = params.code;
+    this.code = params.code;
+    this.modelId = params.modelId;
+    this.family = params.family;
+    this.maxPromptChars = params.maxPromptChars;
+    this.promptLength = params.promptLength;
+  }
+}
+
+type TargetPromptContract = {
+  family: Exclude<VerticalDramaCharacterPromptFamily, "other">;
+  negativePromptMode: "inline_only";
+};
+
+const TARGET_LIMITS: Record<TargetPromptContract["family"], number> = {
+  gpt_image_2: 20_000,
+  nano_banana: 20_000,
+  seedream: 5_000,
+};
+
+function isRecord(value: unknown): value is Record<string, unknown> {
+  return typeof value === "object" && value !== null && !Array.isArray(value);
+}
+
+function readTargetContract(value: unknown): TargetPromptContract | null {
+  if (!isRecord(value)) return null;
+
+  const family = value.family;
+  const negativePromptMode = value.negativePromptMode;
+  if (
+    (family !== "gpt_image_2" && family !== "nano_banana" && family !== "seedream") ||
+    negativePromptMode !== "inline_only"
+  ) {
+    return null;
+  }
+
+  return { family, negativePromptMode };
+}
+
+function capabilityError(
+  code: VerticalDramaCharacterPromptContractErrorCode,
+  modelId: string,
+  detail: string,
+  metadata: Omit<ConstructorParameters<typeof VerticalDramaCharacterPromptContractError>[0], "code" | "modelId" | "detail"> = {},
+): VerticalDramaCharacterPromptContractError {
+  return new VerticalDramaCharacterPromptContractError({
+    code,
+    modelId,
+    detail,
+    ...metadata,
+  });
+}
+
+function readRawPromptLimit(configJson: Record<string, unknown> | undefined): number | null {
+  const raw = configJson?.maxPromptLength ?? configJson?.max_prompt_length;
+  if (typeof raw !== "number" && typeof raw !== "string") return null;
+
+  const parsed = Number(raw);
+  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed) ? parsed : null;
+}
+
+export function resolveVerticalDramaCharacterPromptCapability(
+  context: VerticalDramaCharacterPromptModelContext,
+  options: { requireTarget?: boolean } = {},
+): VerticalDramaCharacterPromptCapability {
+  const modelId = context.modelId.trim();
+  const hasDbConfig = context.configJson !== undefined && context.configJson !== null;
+  // Reference routing changes provider transport details only. The selected
+  // canonical model remains the sole family/limit authority.
+  const staticModel = getStaticModelById(modelId);
+  const staticConfig = isRecord(staticModel?.configJson) ? staticModel.configJson : undefined;
+  const sourceConfig = hasDbConfig ? context.configJson : staticConfig;
+  const source = hasDbConfig ? "db" : "static";
+  const rawContract = sourceConfig?.[VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_KEY];
+
+  if (rawContract === undefined) {
+    if (options.requireTarget) {
+      throw capabilityError(
+        "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING",
+        modelId,
+        "does not declare target character prompt capability",
+      );
+    }
+
+    return {
+      family: "other",
+      maxPromptChars: resolveVdImagePromptBudgetForModel({
+        modelId,
+        configJson: context.configJson,
+      }),
+      negativePromptMode: "separate_legacy",
+      promptProfile: "legacy",
+      source: "explicit_legacy",
+      canonicalModelId: staticModel?.id ?? modelId,
+      configured: false,
+    };
+  }
+
+  const targetContract = readTargetContract(rawContract);
+  const rawConfiguredLimit = readRawPromptLimit(sourceConfig ?? undefined);
+  const configuredLimit = resolveConfiguredMaxPromptLength(sourceConfig);
+  if (!targetContract || configuredLimit === null) {
+    throw capabilityError(
+      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
+      modelId,
+      "declares malformed family, mode, or prompt limit",
+    );
+  }
+
+  if (rawConfiguredLimit === null || rawConfiguredLimit !== configuredLimit) {
+    throw capabilityError(
+      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
+      modelId,
+      "declares a non-integer prompt limit",
+    );
+  }
+
+  const expectedLimit = TARGET_LIMITS[targetContract.family];
+  if (configuredLimit !== expectedLimit) {
+    throw capabilityError(
+      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
+      modelId,
+      `declares ${configuredLimit} characters for ${targetContract.family}; expected ${expectedLimit}`,
+      { family: targetContract.family, maxPromptChars: configuredLimit },
+    );
+  }
+
+  return {
+    family: targetContract.family,
+    maxPromptChars: configuredLimit,
+    negativePromptMode: targetContract.negativePromptMode,
+    promptProfile: targetContract.family === "seedream" ? "compact" : "rich",
+    source,
+    canonicalModelId: staticModel?.id ?? modelId,
+    configured: true,
+  };
+}
+
+export function isTargetVerticalDramaCharacterCapability(
+  capability: VerticalDramaCharacterPromptCapability,
+): boolean {
+  return (
+    capability.configured &&
+    capability.negativePromptMode === "inline_only" &&
+    capability.family !== "other"
+  );
+}
+
+export function assertVerticalDramaCharacterPromptLength(
+  prompt: string,
+  capability: VerticalDramaCharacterPromptCapability,
+): void {
+  const length = prompt.length;
+  if (length <= capability.maxPromptChars) return;
+
+  throw capabilityError(
+    "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG",
+    capability.canonicalModelId,
+    `for ${capability.family} is ${length} characters; maximum is ${capability.maxPromptChars}`,
+    {
+      family: capability.family,
+      maxPromptChars: capability.maxPromptChars,
+      promptLength: length,
+    },
+  );
+}
