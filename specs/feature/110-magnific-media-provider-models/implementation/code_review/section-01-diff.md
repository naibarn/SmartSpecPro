diff --git a/apps/web/scripts/__tests__/seed-media-providers.test.ts b/apps/web/scripts/__tests__/seed-media-providers.test.ts
index 45b62d15..7a154fbc 100644
--- a/apps/web/scripts/__tests__/seed-media-providers.test.ts
+++ b/apps/web/scripts/__tests__/seed-media-providers.test.ts
@@ -55,4 +55,25 @@ describe("seed-media-providers", () => {
       expect.objectContaining({ id: "elevenlabs/voice-isolator", type: "audio" }),
     ]));
   });
+
+  it("includes a disabled Magnific provider row with all phase-one image and video workflows", () => {
+    const magnific = DEFAULT_PROVIDERS.find((provider) => provider.providerName === "magnific");
+
+    expect(magnific).toBeDefined();
+    expect(magnific).toMatchObject({
+      displayName: "Magnific",
+      providerType: "multimodal",
+      baseUrl: "https://api.magnific.com",
+      defaultModel: "magnific/mystic",
+      isEnabled: false,
+      isPrimary: false,
+    });
+    expect(magnific?.availableModels).toHaveLength(34);
+    expect(magnific?.availableModels).toEqual(expect.arrayContaining([
+      expect.objectContaining({ id: "magnific/mystic", type: "image" }),
+      expect.objectContaining({ id: "magnific/remove-background", type: "image" }),
+      expect.objectContaining({ id: "magnific/veo-3-1-text-to-video-fast", type: "video" }),
+      expect.objectContaining({ id: "magnific/video-upscaler-precision", type: "video" }),
+    ]));
+  });
 });
diff --git a/apps/web/scripts/seed-media-providers.ts b/apps/web/scripts/seed-media-providers.ts
index 465a4e9a..0a30a253 100644
--- a/apps/web/scripts/seed-media-providers.ts
+++ b/apps/web/scripts/seed-media-providers.ts
@@ -10,7 +10,11 @@ import {
   ELEVENLABS_PROVIDER,
   ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
   getElevenLabsProviderAvailableModels,
+  getMagnificProviderAvailableModels,
   getWaveSpeedProviderAvailableModels,
+  MAGNIFIC_BASE_URL,
+  MAGNIFIC_DEFAULT_MODEL_ID,
+  MAGNIFIC_PROVIDER,
   WAVESPEED_LAUNCH_MODEL_ID,
 } from "../server/services/mediaProviderUtils";
 
@@ -100,6 +104,18 @@ export const DEFAULT_PROVIDERS = [
     isPrimary: false,
     priority: 12,
   },
+  {
+    providerName: MAGNIFIC_PROVIDER,
+    displayName: "Magnific",
+    description: "Magnific media provider for image generation, enhancement, video generation, and video upscaling",
+    providerType: "multimodal",
+    baseUrl: MAGNIFIC_BASE_URL,
+    defaultModel: MAGNIFIC_DEFAULT_MODEL_ID,
+    availableModels: getMagnificProviderAvailableModels(),
+    isEnabled: false,
+    isPrimary: false,
+    priority: 14,
+  },
   {
     providerName: ELEVENLABS_PROVIDER,
     displayName: "ElevenLabs",
diff --git a/apps/web/server/routers/mediaProviders.test.ts b/apps/web/server/routers/mediaProviders.test.ts
index 4c10cb03..589aaf39 100644
--- a/apps/web/server/routers/mediaProviders.test.ts
+++ b/apps/web/server/routers/mediaProviders.test.ts
@@ -37,6 +37,7 @@ import {
   testBytePlusModelArk,
   testElevenLabs,
   testKieAI,
+  testMagnificAI,
   testUVoice,
   testWaveSpeedAI,
 } from "./mediaProviders";
@@ -214,6 +215,86 @@ describe("PROVIDER_TEMPLATES — ElevenLabs direct entry", () => {
   });
 });
 
+describe("PROVIDER_TEMPLATES — Magnific entry", () => {
+  const magnificTemplate = PROVIDER_TEMPLATES.find(
+    (t) => t.providerName === "magnific"
+  );
+
+  it("uses the official API root and Mystic default model", () => {
+    expect(magnificTemplate).toBeDefined();
+    expect(magnificTemplate?.displayName).toBe("Magnific");
+    expect(magnificTemplate?.providerType).toBe("multimodal");
+    expect(magnificTemplate?.baseUrl).toBe("https://api.magnific.com");
+    expect(magnificTemplate?.defaultModel).toBe("magnific/mystic");
+    expect(magnificTemplate?.availableModels).toHaveLength(34);
+    expect(magnificTemplate?.availableModels).toEqual(expect.arrayContaining([
+      expect.objectContaining({ id: "magnific/mystic", type: "image" }),
+      expect.objectContaining({ id: "magnific/remove-background", type: "image" }),
+      expect.objectContaining({ id: "magnific/veo-3-1-reference-to-video", type: "video" }),
+      expect.objectContaining({ id: "magnific/video-upscaler-precision", type: "video" }),
+    ]));
+  });
+});
+
+describe("testMagnificAI", () => {
+  beforeEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it("calls GET /v1/ai/mystic with x-magnific-api-key auth", async () => {
+    const fetchSpy = vi.fn().mockResolvedValue({
+      ok: true,
+      status: 200,
+      json: async () => ({ data: [] }),
+    });
+    vi.stubGlobal("fetch", fetchSpy);
+
+    const result = await testMagnificAI("magnific-secret", "https://api.magnific.com/");
+
+    expect(result.success).toBe(true);
+    expect(fetchSpy).toHaveBeenCalledTimes(1);
+    const [url, options] = fetchSpy.mock.calls[0];
+    expect(url).toBe("https://api.magnific.com/v1/ai/mystic");
+    expect(options.method).toBe("GET");
+    expect(options.headers["x-magnific-api-key"]).toBe("magnific-secret");
+    expect(options.headers.Authorization).toBeUndefined();
+  });
+
+  it("returns sanitized auth and rate-limit failures", async () => {
+    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
+      ok: false,
+      status: 401,
+      json: async () => ({ error: "invalid key magnific-secret" }),
+      text: async () => "invalid key magnific-secret",
+    }));
+    await expect(testMagnificAI("magnific-secret", "https://api.magnific.com")).resolves.toMatchObject({
+      success: false,
+      message: expect.stringMatching(/401/i),
+    });
+
+    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
+      ok: false,
+      status: 429,
+      json: async () => ({ error: "rate limited magnific-secret" }),
+      text: async () => "rate limited magnific-secret",
+    }));
+    const result = await testMagnificAI("magnific-secret", "https://api.magnific.com");
+
+    expect(result.success).toBe(false);
+    expect(result.message).toMatch(/429/i);
+    expect(result.message).not.toContain("magnific-secret");
+  });
+
+  it("rejects unsafe Magnific base URLs before fetch", async () => {
+    const fetchSpy = vi.fn();
+    vi.stubGlobal("fetch", fetchSpy);
+
+    await expect(testMagnificAI("key", "https://127.0.0.1")).rejects.toThrow(/public host/i);
+    await expect(testMagnificAI("key", "http://api.magnific.com")).rejects.toThrow(/https/i);
+    expect(fetchSpy).not.toHaveBeenCalled();
+  });
+});
+
 describe("testElevenLabs", () => {
   beforeEach(() => {
     vi.restoreAllMocks();
diff --git a/apps/web/server/routers/mediaProviders.ts b/apps/web/server/routers/mediaProviders.ts
index f7edf1dc..ec5c64d2 100644
--- a/apps/web/server/routers/mediaProviders.ts
+++ b/apps/web/server/routers/mediaProviders.ts
@@ -10,8 +10,13 @@ import {
   ELEVENLABS_PROVIDER,
   ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
   getElevenLabsProviderAvailableModels,
+  getMagnificProviderAvailableModels,
   getWaveSpeedProviderAvailableModels,
+  MAGNIFIC_BASE_URL,
+  MAGNIFIC_DEFAULT_MODEL_ID,
+  MAGNIFIC_PROVIDER,
   normalizeMediaProviderName,
+  normalizeMagnificBaseUrl,
   normalizePersistedMediaProviderBaseUrl,
   normalizeWaveSpeedBaseUrl,
   WAVESPEED_LAUNCH_MODEL_ID,
@@ -124,6 +129,15 @@ export const PROVIDER_TEMPLATES = [
     defaultModel: WAVESPEED_LAUNCH_MODEL_ID,
     availableModels: getWaveSpeedProviderAvailableModels(),
   },
+  {
+    providerName: MAGNIFIC_PROVIDER,
+    displayName: "Magnific",
+    description: "Magnific image and video media provider for Mystic, enhancement, Kling, Wan, Veo, and upscaling workflows",
+    providerType: "multimodal" as const,
+    baseUrl: MAGNIFIC_BASE_URL,
+    defaultModel: MAGNIFIC_DEFAULT_MODEL_ID,
+    availableModels: getMagnificProviderAvailableModels(),
+  },
   {
     providerName: ELEVENLABS_PROVIDER,
     displayName: "ElevenLabs",
@@ -427,6 +441,12 @@ export const mediaProvidersRouter = router({
               provider.baseUrl || "https://api.wavespeed.ai/api/v3"
             );
             break;
+          case MAGNIFIC_PROVIDER:
+            result = await testMagnificAI(
+              apiKey,
+              provider.baseUrl || MAGNIFIC_BASE_URL
+            );
+            break;
           case ELEVENLABS_PROVIDER:
             result = await testElevenLabs(
               apiKey,
@@ -745,6 +765,64 @@ export async function testWaveSpeedAI(
   };
 }
 
+export async function testMagnificAI(
+  apiKey: string,
+  baseUrl: string,
+): Promise<{ success: boolean; message: string; latencyMs?: number }> {
+  const normalizedBaseUrl = normalizeMagnificBaseUrl(baseUrl);
+  validateExternalUrl(normalizedBaseUrl);
+  const startTime = Date.now();
+  const response = await fetch(`${normalizedBaseUrl}/v1/ai/mystic`, {
+    method: "GET",
+    headers: {
+      "x-magnific-api-key": apiKey,
+      Accept: "application/json",
+    },
+  });
+  const latencyMs = Date.now() - startTime;
+
+  if (response.status === 401) {
+    return { success: false, message: "Invalid Magnific API key (401 Unauthorized)", latencyMs };
+  }
+  if (response.status === 403) {
+    return { success: false, message: "Magnific account is not authorized for this resource (403 Forbidden)", latencyMs };
+  }
+  if (response.status === 429) {
+    return { success: false, message: "Magnific rate limit reached (429 Too Many Requests)", latencyMs };
+  }
+
+  let payload: any = null;
+  let responseSummary = "";
+  try {
+    payload = await response.json();
+    responseSummary = summarizeResponseText(JSON.stringify(payload));
+  } catch {
+    responseSummary = summarizeResponseText(await response.text().catch(() => ""));
+  }
+
+  if (!response.ok) {
+    return {
+      success: false,
+      message: `Magnific API error (HTTP ${response.status}): ${redactProviderSecret(responseSummary, apiKey)}`,
+      latencyMs,
+    };
+  }
+
+  if (!payload || typeof payload !== "object") {
+    return {
+      success: false,
+      message: "Magnific connection test returned an unexpected response body",
+      latencyMs,
+    };
+  }
+
+  return {
+    success: true,
+    message: "Connection successful",
+    latencyMs,
+  };
+}
+
 export async function testElevenLabs(
   apiKey: string,
   baseUrl: string,
diff --git a/apps/web/server/services/mediaProviderUtils.test.ts b/apps/web/server/services/mediaProviderUtils.test.ts
index f11ad8d1..6531ccf0 100644
--- a/apps/web/server/services/mediaProviderUtils.test.ts
+++ b/apps/web/server/services/mediaProviderUtils.test.ts
@@ -8,12 +8,15 @@ import {
   buildWaveSpeedModelConfigJson,
   buildWaveSpeedModelSeeds,
   assertRelativeUploadMediaReferencePath,
+  getMagnificProviderAvailableModels,
   getElevenLabsProviderAvailableModels,
   buildWaveSpeedLaunchModelConfigJson,
   buildWaveSpeedLaunchModelSeed,
   getWaveSpeedProviderAvailableModels,
   isReferenceImageRequiredFromConfig,
   normalizeMediaProviderName,
+  normalizeMagnificBaseUrl,
+  normalizePersistedMediaProviderBaseUrl,
   normalizeRelativeMediaEndpointPath,
   normalizeWaveSpeedBaseUrl,
   sanitizeMediaModelConfigJson,
@@ -43,12 +46,30 @@ describe("mediaProviderUtils", () => {
     expect(normalizeMediaProviderName("kie.ai")).toBe("kie_ai");
   });
 
+  it("normalizes Magnific provider aliases without regressing existing providers", () => {
+    expect(normalizeMediaProviderName("magnific")).toBe("magnific");
+    expect(normalizeMediaProviderName("magnific_api")).toBe("magnific");
+    expect(normalizeMediaProviderName("magnific-ai")).toBe("magnific");
+    expect(normalizeMediaProviderName("magnific ai")).toBe("magnific");
+    expect(normalizeMediaProviderName("wavespeed-ai")).toBe("wavespeed_ai");
+    expect(normalizeMediaProviderName("elevenlabs_ai")).toBe("elevenlabs");
+    expect(normalizeMediaProviderName("kie.ai")).toBe("kie_ai");
+  });
+
   it("normalizes both service-root and api-root WaveSpeed base URLs to a single api root", () => {
     expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai")).toBe("https://api.wavespeed.ai/api/v3");
     expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai/api/v3")).toBe("https://api.wavespeed.ai/api/v3");
     expect(normalizeWaveSpeedBaseUrl("https://proxy.example.com/wavespeed")).toBe("https://proxy.example.com/wavespeed/api/v3");
   });
 
+  it("normalizes Magnific base URLs while requiring public HTTPS hosts", () => {
+    expect(normalizeMagnificBaseUrl("https://api.magnific.com/")).toBe("https://api.magnific.com");
+    expect(normalizePersistedMediaProviderBaseUrl("magnific_api", "https://api.magnific.com/")).toBe("https://api.magnific.com");
+    expect(() => normalizeMagnificBaseUrl("http://api.magnific.com")).toThrow(/https/i);
+    expect(() => normalizeMagnificBaseUrl("https://127.0.0.1")).toThrow(/public host/i);
+    expect(() => normalizePersistedMediaProviderBaseUrl("magnific", "https://metadata.google.internal")).toThrow(/public host/i);
+  });
+
   it("rejects unsafe absolute and traversal endpoint metadata", () => {
     expect(() => normalizeRelativeMediaEndpointPath("https://evil.example.com/submit")).toThrow(/relative/i);
     expect(() => normalizeRelativeMediaEndpointPath("//evil.example.com/submit")).toThrow(/relative/i);
@@ -56,6 +77,7 @@ describe("mediaProviderUtils", () => {
     expect(() => normalizeRelativeMediaEndpointPath("/predictions/%2e%2e/result")).toThrow(/\.\./i);
     expect(() => normalizeRelativeMediaEndpointPath("%68%74%74%70%73%3A%2F%2Fevil.example.com/submit")).toThrow(/relative/i);
     expect(() => normalizeRelativeMediaEndpointPath("/predictions/{jobId}/result", { allowRequestIdPlaceholder: true })).toThrow(/placeholder/i);
+    expect(normalizeRelativeMediaEndpointPath("/v1/ai/mystic/{taskId}", { allowedPlaceholders: ["taskId"] })).toBe("/v1/ai/mystic/{taskId}");
   });
 
   it("only allows relative media asset paths under the public upload/storage routes", () => {
@@ -185,6 +207,18 @@ describe("mediaProviderUtils", () => {
     expect(providerModels.find((model) => model.id === WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID)?.type).toBe("audio");
   });
 
+  it("exposes Magnific provider models for admin templates and provider seeds", () => {
+    const providerModels = getMagnificProviderAvailableModels();
+
+    expect(providerModels).toHaveLength(34);
+    expect(providerModels).toEqual(expect.arrayContaining([
+      expect.objectContaining({ id: "magnific/mystic", type: "image" }),
+      expect.objectContaining({ id: "magnific/remove-background", type: "image" }),
+      expect.objectContaining({ id: "magnific/veo-3-1-text-to-video-fast", type: "video" }),
+      expect.objectContaining({ id: "magnific/video-upscaler-precision", type: "video" }),
+    ]));
+  });
+
   it("builds WaveSpeed audio model configs with per-unit and flat pricing", () => {
     const geminiFlash = buildWaveSpeedModelConfigJson(WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID);
     const lyriaPro = buildWaveSpeedModelConfigJson(WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID);
diff --git a/apps/web/server/services/mediaProviderUtils.ts b/apps/web/server/services/mediaProviderUtils.ts
index ff036874..ebe67f15 100644
--- a/apps/web/server/services/mediaProviderUtils.ts
+++ b/apps/web/server/services/mediaProviderUtils.ts
@@ -3,6 +3,9 @@ export const WAVESPEED_LAUNCH_MODEL_ID = "wavespeed-ai/cinematic-video-generator
 export const WAVESPEED_LAUNCH_MODEL_NAME = "Seedance 2.0 Grade Cinematic Video Generator";
 export const WAVESPEED_LAUNCH_MODEL_DESCRIPTION =
   "WaveSpeed Seedance 2.0 cinematic video generation with optional image guidance and native audio.";
+export const MAGNIFIC_PROVIDER = "magnific";
+export const MAGNIFIC_BASE_URL = "https://api.magnific.com";
+export const MAGNIFIC_DEFAULT_MODEL_ID = "magnific/mystic";
 export const WAVESPEED_ALLOWED_DURATIONS = [5, 10, 15] as const;
 export const WAVESPEED_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4"] as const;
 export const WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] as const;
@@ -107,6 +110,12 @@ type ModelInputFieldRecord = Record<string, unknown>;
 type PublicUrlValidationOptions = {
   requireHttps?: boolean;
 };
+type ProviderAvailableModelRecord = {
+  id: string;
+  name: string;
+  type: "image" | "video" | "audio";
+  description: string;
+};
 type ElevenLabsCapability =
   | "text_to_speech"
   | "voice_changer"
@@ -153,6 +162,43 @@ const PRIVATE_HOST_PATTERNS = [
   /\.local$/i,
 ];
 
+const MAGNIFIC_PROVIDER_MODEL_DEFINITIONS: readonly ProviderAvailableModelRecord[] = [
+  { id: "magnific/mystic", name: "Mystic", type: "image", description: "Magnific Mystic text-to-image generation" },
+  { id: "magnific/seedream-v5-lite", name: "Seedream 5 Lite", type: "image", description: "Magnific Seedream 5 Lite text-to-image generation" },
+  { id: "magnific/seedream-v5-lite-edit", name: "Seedream 5 Lite Edit", type: "image", description: "Magnific Seedream 5 Lite image editing" },
+  { id: "magnific/nano-banana-pro", name: "Nano Banana Pro", type: "image", description: "Magnific Google Nano Banana Pro image generation" },
+  { id: "magnific/nano-banana-pro-flash", name: "Nano Banana Pro Flash", type: "image", description: "Magnific Google Nano Banana Pro Flash image generation" },
+  { id: "magnific/z-image-turbo", name: "Z-Image Turbo", type: "image", description: "Magnific Z-Image Turbo image generation" },
+  { id: "magnific/upscaler-creative", name: "Upscaler Creative", type: "image", description: "Magnific creative image upscaling" },
+  { id: "magnific/relight", name: "Relight", type: "image", description: "Magnific image relighting" },
+  { id: "magnific/style-transfer", name: "Style Transfer", type: "image", description: "Magnific image style transfer" },
+  { id: "magnific/remove-background", name: "Remove Background", type: "image", description: "Magnific synchronous background removal" },
+  { id: "magnific/image-expand", name: "Image Expand", type: "image", description: "Magnific image expansion" },
+  { id: "magnific/skin-enhancer-creative", name: "Skin Enhancer Creative", type: "image", description: "Magnific creative skin enhancement" },
+  { id: "magnific/skin-enhancer-faithful", name: "Skin Enhancer Faithful", type: "image", description: "Magnific faithful skin enhancement" },
+  { id: "magnific/skin-enhancer-flexible", name: "Skin Enhancer Flexible", type: "image", description: "Magnific flexible skin enhancement" },
+  { id: "magnific/change-camera", name: "Change Camera", type: "image", description: "Magnific image camera-angle change" },
+  { id: "magnific/kling-v3-pro", name: "Kling 3 Pro", type: "video", description: "Magnific Kling 3 Pro video generation" },
+  { id: "magnific/kling-v3-standard", name: "Kling 3 Standard", type: "video", description: "Magnific Kling 3 Standard video generation" },
+  { id: "magnific/kling-v3-omni-pro", name: "Kling 3 Omni Pro", type: "video", description: "Magnific Kling 3 Omni Pro video generation" },
+  { id: "magnific/kling-v3-omni-standard", name: "Kling 3 Omni Standard", type: "video", description: "Magnific Kling 3 Omni Standard video generation" },
+  { id: "magnific/kling-v3-omni-reference-pro", name: "Kling 3 Omni Reference Pro", type: "video", description: "Magnific Kling 3 Omni Pro reference-to-video" },
+  { id: "magnific/kling-v3-omni-reference-standard", name: "Kling 3 Omni Reference Standard", type: "video", description: "Magnific Kling 3 Omni Standard reference-to-video" },
+  { id: "magnific/kling-v3-motion-control-pro", name: "Kling 3 Motion Control Pro", type: "video", description: "Magnific Kling 3 Pro motion-control video" },
+  { id: "magnific/kling-v3-motion-control-standard", name: "Kling 3 Motion Control Standard", type: "video", description: "Magnific Kling 3 Standard motion-control video" },
+  { id: "magnific/kling-v2-6-motion-control-pro", name: "Kling 2.6 Motion Control Pro", type: "video", description: "Magnific Kling 2.6 Pro motion-control video" },
+  { id: "magnific/kling-v2-6-motion-control-standard", name: "Kling 2.6 Motion Control Standard", type: "video", description: "Magnific Kling 2.6 Standard motion-control video" },
+  { id: "magnific/wan-v2-7-text-to-video", name: "Wan 2.7 Text to Video", type: "video", description: "Magnific Wan 2.7 text-to-video" },
+  { id: "magnific/wan-v2-7-image-to-video", name: "Wan 2.7 Image to Video", type: "video", description: "Magnific Wan 2.7 image-to-video" },
+  { id: "magnific/wan-v2-7-reference-to-video", name: "Wan 2.7 Reference to Video", type: "video", description: "Magnific Wan 2.7 reference-to-video" },
+  { id: "magnific/veo-3-1-text-to-video", name: "Veo 3.1 Text to Video", type: "video", description: "Magnific Google Veo 3.1 text-to-video" },
+  { id: "magnific/veo-3-1-text-to-video-fast", name: "Veo 3.1 Text to Video Fast", type: "video", description: "Magnific Google Veo 3.1 Fast text-to-video" },
+  { id: "magnific/veo-3-1-image-to-video", name: "Veo 3.1 Image to Video", type: "video", description: "Magnific Google Veo 3.1 image-to-video" },
+  { id: "magnific/veo-3-1-image-to-video-fast", name: "Veo 3.1 Image to Video Fast", type: "video", description: "Magnific Google Veo 3.1 Fast image-to-video" },
+  { id: "magnific/veo-3-1-reference-to-video", name: "Veo 3.1 Reference to Video", type: "video", description: "Magnific Google Veo 3.1 reference-to-video" },
+  { id: "magnific/video-upscaler-precision", name: "Video Upscaler Precision", type: "video", description: "Magnific precision video upscaling" },
+];
+
 const WAVESPEED_MODEL_DEFINITIONS: readonly WaveSpeedModelDefinition[] = [
   {
     modelId: WAVESPEED_LAUNCH_MODEL_ID,
@@ -862,6 +908,9 @@ export function normalizeMediaProviderName(providerName: string | null | undefin
   if (normalized === "wavespeed_ai" || normalized === "wavespeedai") {
     return WAVESPEED_PROVIDER;
   }
+  if (normalized === "magnific" || normalized === "magnific_api" || normalized === "magnific_ai") {
+    return MAGNIFIC_PROVIDER;
+  }
   if (
     normalized === "elevenlabs"
     || normalized === "eleven_labs"
@@ -924,7 +973,9 @@ export function normalizePersistedMediaProviderBaseUrl(
   const normalizedProviderName = normalizeMediaProviderName(providerName);
   const normalizedUrl = normalizedProviderName === WAVESPEED_PROVIDER
     ? normalizeWaveSpeedBaseUrl(trimmed)
-    : new URL(trimmed).toString().replace(/\/$/, "");
+    : normalizedProviderName === MAGNIFIC_PROVIDER
+      ? normalizeMagnificBaseUrl(trimmed)
+      : new URL(trimmed).toString().replace(/\/$/, "");
 
   assertPublicSafeHttpUrl(normalizedUrl, "Provider base URL", { requireHttps: true });
   return normalizedUrl;
@@ -965,6 +1016,15 @@ export function normalizeWaveSpeedBaseUrl(baseUrl: string | null | undefined): s
   return parsed.toString().replace(/\/$/, "");
 }
 
+export function normalizeMagnificBaseUrl(baseUrl: string | null | undefined): string {
+  const rawValue = String(baseUrl ?? "").trim() || MAGNIFIC_BASE_URL;
+  const parsed = new URL(rawValue);
+  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
+  const normalized = parsed.toString().replace(/\/$/, "");
+  assertPublicSafeHttpUrl(normalized, "Magnific base URL", { requireHttps: true });
+  return normalized;
+}
+
 export function normalizeRelativeMediaEndpointPath(
   rawValue: string,
   options?: { allowRequestIdPlaceholder?: boolean; allowedPlaceholders?: string[] },
@@ -1250,6 +1310,10 @@ export function getWaveSpeedProviderAvailableModels(): Array<{
   }));
 }
 
+export function getMagnificProviderAvailableModels(): ProviderAvailableModelRecord[] {
+  return MAGNIFIC_PROVIDER_MODEL_DEFINITIONS.map((definition) => ({ ...definition }));
+}
+
 export function buildElevenLabsModelConfigJson(modelId: string): Record<string, unknown> {
   const definition = requireElevenLabsModelDefinition(modelId);
   return sanitizeMediaModelConfigJson({
diff --git a/python-backend/app/llm_proxy/gateway_unified.py b/python-backend/app/llm_proxy/gateway_unified.py
index 9b07918a..179963d0 100644
--- a/python-backend/app/llm_proxy/gateway_unified.py
+++ b/python-backend/app/llm_proxy/gateway_unified.py
@@ -160,6 +160,8 @@ class LLMGateway:
             return "fal_ai"
         if normalized in {"wavespeed_ai", "wavespeedai"}:
             return "wavespeed_ai"
+        if normalized in {"magnific", "magnific_api", "magnific_ai"}:
+            return "magnific"
         if normalized in {"elevenlabs", "eleven_labs", "elevenlabs_ai", "eleven_labs_ai"}:
             return "elevenlabs"
         return normalized
diff --git a/python-backend/tests/unit/services/test_gateway_fal_routing.py b/python-backend/tests/unit/services/test_gateway_fal_routing.py
index 9e6c62fa..86541640 100644
--- a/python-backend/tests/unit/services/test_gateway_fal_routing.py
+++ b/python-backend/tests/unit/services/test_gateway_fal_routing.py
@@ -29,6 +29,12 @@ class TestProviderIdNormalization:
         assert LLMGateway._normalize_provider_id("kie") == "kie_ai"
         assert LLMGateway._normalize_provider_id("uvoice") == "uvoice"
 
+    def test_magnific_aliases(self):
+        assert LLMGateway._normalize_provider_id("magnific") == "magnific"
+        assert LLMGateway._normalize_provider_id("magnific_api") == "magnific"
+        assert LLMGateway._normalize_provider_id("magnific-ai") == "magnific"
+        assert LLMGateway._normalize_provider_id("magnific_ai") == "magnific"
+
 
 # --- Video Routing ---
 
