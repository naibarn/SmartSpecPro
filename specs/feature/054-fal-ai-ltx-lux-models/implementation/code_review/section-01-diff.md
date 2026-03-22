diff --git a/apps/web/scripts/seed-media-providers.ts b/apps/web/scripts/seed-media-providers.ts
index 558865dc..a8c7a39b 100644
--- a/apps/web/scripts/seed-media-providers.ts
+++ b/apps/web/scripts/seed-media-providers.ts
@@ -51,16 +51,29 @@ const DEFAULT_PROVIDERS = [
   {
     providerName: "fal_ai",
     displayName: "fal.ai",
-    description: "Fast inference platform for generative AI - supports real-time image and video generation with optimized latency",
+    description: "Fast inference platform for generative AI - LTX-2.3 video generation, Lux TTS voice synthesis, and Flux image generation",
     providerType: "multimodal",
     baseUrl: "https://fal.run",
     defaultModel: "fal-ai/flux/schnell",
     availableModels: [
+      // Image models
       { id: "fal-ai/flux/schnell", name: "Flux Schnell", type: "image", description: "Ultra-fast image generation" },
       { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image", description: "High quality image generation" },
       { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image", description: "Professional image generation" },
-      { id: "fal-ai/stable-diffusion-v3-medium", name: "SD3 Medium", type: "image", description: "Stable Diffusion 3" },
+      { id: "fal-ai/stable-diffusion-v3-medium", name: "Stable Diffusion 3 Medium", type: "image", description: "SD3 image generation" },
+      // Video models (existing)
       { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video", description: "Video generation" },
+      { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video", description: "Image to video conversion" },
+      // Video models (LTX-2.3)
+      { id: "fal-ai/ltx-2.3/text-to-video", name: "LTX-2.3 Text to Video", type: "video", description: "Text-to-video generation (standard quality)" },
+      { id: "fal-ai/ltx-2.3/text-to-video/fast", name: "LTX-2.3 Text to Video (Fast)", type: "video", description: "Fast text-to-video generation" },
+      { id: "fal-ai/ltx-2.3/image-to-video", name: "LTX-2.3 Image to Video", type: "video", description: "Image-to-video generation (standard quality)" },
+      { id: "fal-ai/ltx-2.3/image-to-video/fast", name: "LTX-2.3 Image to Video (Fast)", type: "video", description: "Fast image-to-video generation" },
+      { id: "fal-ai/ltx-2.3/audio-to-video", name: "LTX-2.3 Audio to Video", type: "video", description: "Audio-driven video generation" },
+      { id: "fal-ai/ltx-2.3/extend-video", name: "LTX-2.3 Extend Video", type: "video", description: "Extend existing video clips" },
+      { id: "fal-ai/ltx-2.3/retake-video", name: "LTX-2.3 Retake Video", type: "video", description: "Re-generate video with modified parameters" },
+      // Audio models
+      { id: "fal-ai/lux-tts", name: "Lux TTS", type: "audio", description: "Text-to-speech with voice cloning" },
     ],
     isEnabled: false,
     isPrimary: false,
diff --git a/apps/web/server/__tests__/testFalAI.test.ts b/apps/web/server/__tests__/testFalAI.test.ts
new file mode 100644
index 00000000..27885230
--- /dev/null
+++ b/apps/web/server/__tests__/testFalAI.test.ts
@@ -0,0 +1,201 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// We need to import the module under test
+// PROVIDER_TEMPLATES is exported from the router module
+import { PROVIDER_TEMPLATES } from "../routers/mediaProviders";
+
+// --- Provider template completeness ---
+
+describe("PROVIDER_TEMPLATES fal_ai entry", () => {
+  const falAiTemplate = PROVIDER_TEMPLATES.find(
+    (t) => t.providerName === "fal_ai"
+  );
+
+  it("exists in PROVIDER_TEMPLATES", () => {
+    expect(falAiTemplate).toBeDefined();
+  });
+
+  it("contains all 7 LTX-2.3 video models", () => {
+    const ltxModels = falAiTemplate!.availableModels.filter((m) =>
+      m.id.startsWith("fal-ai/ltx-2.3/")
+    );
+    expect(ltxModels).toHaveLength(7);
+
+    const expectedIds = [
+      "fal-ai/ltx-2.3/text-to-video",
+      "fal-ai/ltx-2.3/text-to-video/fast",
+      "fal-ai/ltx-2.3/image-to-video",
+      "fal-ai/ltx-2.3/image-to-video/fast",
+      "fal-ai/ltx-2.3/audio-to-video",
+      "fal-ai/ltx-2.3/extend-video",
+      "fal-ai/ltx-2.3/retake-video",
+    ];
+    for (const id of expectedIds) {
+      expect(ltxModels.find((m) => m.id === id)).toBeDefined();
+    }
+  });
+
+  it("contains Lux TTS audio model", () => {
+    const luxTts = falAiTemplate!.availableModels.find(
+      (m) => m.id === "fal-ai/lux-tts"
+    );
+    expect(luxTts).toBeDefined();
+    expect(luxTts!.type).toBe("audio");
+  });
+
+  it("retains existing 4 Flux image models", () => {
+    const fluxIds = [
+      "fal-ai/flux/schnell",
+      "fal-ai/flux/dev",
+      "fal-ai/flux-pro",
+      "fal-ai/stable-diffusion-v3-medium",
+    ];
+    for (const id of fluxIds) {
+      expect(
+        falAiTemplate!.availableModels.find((m) => m.id === id)
+      ).toBeDefined();
+    }
+  });
+
+  it("each model entry has id, name, type, and description fields", () => {
+    for (const model of falAiTemplate!.availableModels) {
+      expect(model.id).toBeTruthy();
+      expect(model.name).toBeTruthy();
+      expect(model.type).toBeTruthy();
+      expect(model.description).toBeTruthy();
+    }
+  });
+
+  it("video model IDs match expected fal-ai/ltx-2.3/* pattern", () => {
+    const ltxModels = falAiTemplate!.availableModels.filter((m) =>
+      m.id.startsWith("fal-ai/ltx-2.3/")
+    );
+    for (const model of ltxModels) {
+      expect(model.type).toBe("video");
+    }
+  });
+
+  it("Lux TTS model ID is fal-ai/lux-tts with type audio", () => {
+    const luxTts = falAiTemplate!.availableModels.find(
+      (m) => m.id === "fal-ai/lux-tts"
+    );
+    expect(luxTts).toBeDefined();
+    expect(luxTts!.id).toBe("fal-ai/lux-tts");
+    expect(luxTts!.type).toBe("audio");
+  });
+
+  it("has 14 total entries", () => {
+    expect(falAiTemplate!.availableModels).toHaveLength(14);
+  });
+});
+
+// --- testFalAI authentication probe ---
+
+// We need to test the testFalAI function which is not exported.
+// We'll test it indirectly by importing the module and using the testConnection
+// endpoint, or we can export testFalAI for testing.
+// For now, let's test via a dynamic import approach.
+
+// Since testFalAI is a private function, we'll mock fetch at the global level
+// and call the function through a re-export. The section plan says to test it.
+// We'll need to export it — let's test via a test helper.
+
+// Actually the simplest approach: we'll export testFalAI and test it directly.
+
+describe("testFalAI", () => {
+  let testFalAI: (
+    apiKey: string
+  ) => Promise<{ success: boolean; message: string }>;
+  const originalFetch = globalThis.fetch;
+
+  beforeEach(async () => {
+    // Dynamic import to get the testFalAI function
+    // We export it from the module for testability
+    const mod = await import("../routers/mediaProviders");
+    testFalAI = (mod as any).testFalAI;
+  });
+
+  afterEach(() => {
+    globalThis.fetch = originalFetch;
+    vi.restoreAllMocks();
+  });
+
+  it("sends POST to queue.fal.run with Authorization: Key header", async () => {
+    const mockFetch = vi.fn().mockResolvedValue({
+      status: 422,
+      ok: false,
+    });
+    globalThis.fetch = mockFetch;
+
+    await testFalAI("test-key-123");
+
+    expect(mockFetch).toHaveBeenCalledWith(
+      "https://queue.fal.run/fal-ai/flux/schnell",
+      expect.objectContaining({
+        method: "POST",
+        headers: expect.objectContaining({
+          Authorization: "Key test-key-123",
+        }),
+      })
+    );
+  });
+
+  it("returns success: true when API responds with 422 (valid key)", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue({
+      status: 422,
+      ok: false,
+    });
+
+    const result = await testFalAI("valid-key");
+    expect(result.success).toBe(true);
+  });
+
+  it("returns success: false when API responds with 401 (invalid key)", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue({
+      status: 401,
+      ok: false,
+    });
+
+    const result = await testFalAI("invalid-key");
+    expect(result.success).toBe(false);
+  });
+
+  it("returns success: false when API responds with 403 (forbidden)", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue({
+      status: 403,
+      ok: false,
+    });
+
+    const result = await testFalAI("forbidden-key");
+    expect(result.success).toBe(false);
+  });
+
+  it("handles network errors gracefully", async () => {
+    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
+
+    const result = await testFalAI("any-key");
+    expect(result.success).toBe(false);
+  });
+
+  it("never sends the actual API key in the response message", async () => {
+    const secretKey = "sk-super-secret-key-12345";
+
+    // Test all response paths
+    for (const status of [422, 401, 403, 200, 500]) {
+      globalThis.fetch = vi.fn().mockResolvedValue({
+        status,
+        ok: status >= 200 && status < 300,
+      });
+
+      const result = await testFalAI(secretKey);
+      expect(result.message).not.toContain(secretKey);
+    }
+
+    // Test error path
+    globalThis.fetch = vi
+      .fn()
+      .mockRejectedValue(new Error("connection failed"));
+    const errorResult = await testFalAI(secretKey);
+    expect(errorResult.message).not.toContain(secretKey);
+  });
+});
diff --git a/apps/web/server/routers/mediaProviders.ts b/apps/web/server/routers/mediaProviders.ts
index 7dfac4cf..c8682c94 100644
--- a/apps/web/server/routers/mediaProviders.ts
+++ b/apps/web/server/routers/mediaProviders.ts
@@ -33,7 +33,7 @@ export const PROVIDER_TEMPLATES = [
   {
     providerName: "fal_ai",
     displayName: "fal.ai",
-    description: "Fast inference platform for generative AI - supports real-time image and video generation with optimized latency",
+    description: "Fast inference platform for generative AI - LTX-2.3 video generation, Lux TTS voice synthesis, and Flux image generation",
     providerType: "multimodal" as const,
     baseUrl: "https://fal.run",
     defaultModel: "fal-ai/flux/schnell",
@@ -43,9 +43,19 @@ export const PROVIDER_TEMPLATES = [
       { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image" as const, description: "High quality image generation" },
       { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image" as const, description: "Professional image generation" },
       { id: "fal-ai/stable-diffusion-v3-medium", name: "Stable Diffusion 3 Medium", type: "image" as const, description: "SD3 image generation" },
-      // Video models
+      // Video models (existing)
       { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video" as const, description: "Video generation" },
       { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video" as const, description: "Image to video conversion" },
+      // Video models (LTX-2.3)
+      { id: "fal-ai/ltx-2.3/text-to-video", name: "LTX-2.3 Text to Video", type: "video" as const, description: "Text-to-video generation (standard quality)" },
+      { id: "fal-ai/ltx-2.3/text-to-video/fast", name: "LTX-2.3 Text to Video (Fast)", type: "video" as const, description: "Fast text-to-video generation" },
+      { id: "fal-ai/ltx-2.3/image-to-video", name: "LTX-2.3 Image to Video", type: "video" as const, description: "Image-to-video generation (standard quality)" },
+      { id: "fal-ai/ltx-2.3/image-to-video/fast", name: "LTX-2.3 Image to Video (Fast)", type: "video" as const, description: "Fast image-to-video generation" },
+      { id: "fal-ai/ltx-2.3/audio-to-video", name: "LTX-2.3 Audio to Video", type: "video" as const, description: "Audio-driven video generation" },
+      { id: "fal-ai/ltx-2.3/extend-video", name: "LTX-2.3 Extend Video", type: "video" as const, description: "Extend existing video clips" },
+      { id: "fal-ai/ltx-2.3/retake-video", name: "LTX-2.3 Retake Video", type: "video" as const, description: "Re-generate video with modified parameters" },
+      // Audio models
+      { id: "fal-ai/lux-tts", name: "Lux TTS", type: "audio" as const, description: "Text-to-speech with voice cloning" },
     ],
   },
   {
@@ -475,22 +485,39 @@ export async function testKieAI(apiKey: string, baseUrl: string): Promise<{ succ
   return { success: false, message: `API error: ${response.status} - ${text}` };
 }
 
-async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
-  // fal.ai authentication test
-  const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
-    method: "OPTIONS",
-    headers: {
-      "Authorization": `Key ${apiKey}`,
-    },
-  });
+export async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
+  // Send an authenticated POST to the queue endpoint with minimal payload.
+  // A valid key returns 422 (validation error for missing required fields).
+  // An invalid key returns 401.
+  try {
+    const response = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
+      method: "POST",
+      headers: {
+        "Authorization": `Key ${apiKey}`,
+        "Content-Type": "application/json",
+      },
+      body: JSON.stringify({}),
+    });
 
-  // OPTIONS should return 200 or 204 if the key format is correct
-  // For a real test, we'd need to make an actual inference call
-  if (response.ok || response.status === 204) {
-    return { success: true, message: "API key format validated" };
+    if (response.status === 422) {
+      return { success: true, message: "API key validated (inference endpoint reachable)" };
+    }
+    if (response.status === 401) {
+      return { success: false, message: "Invalid API key" };
+    }
+    if (response.status === 403) {
+      return { success: false, message: "API key forbidden" };
+    }
+    if (response.status === 429) {
+      return { success: true, message: "API key valid (rate limited)" };
+    }
+    if (response.ok) {
+      return { success: true, message: "Connection successful" };
+    }
+    return { success: false, message: `fal.ai error (HTTP ${response.status})` };
+  } catch (error: any) {
+    return { success: false, message: `Connection failed: ${error.message}` };
   }
-
-  return { success: false, message: `API error: ${response.status}` };
 }
 
 async function testReplicate(apiKey: string): Promise<{ success: boolean; message: string }> {
