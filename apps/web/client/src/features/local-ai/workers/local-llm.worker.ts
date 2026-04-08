import {
  wrapAdapterRequestDevice,
  type BrowserGpuAdapterLike,
} from "./browserGpuDeviceLimits";

type WorkerRequestType = "init" | "generate" | "transcribe" | "dispose";

interface WorkerRequest {
  requestId: string;
  type: WorkerRequestType;
  payload?: Record<string, unknown>;
}

interface WorkerResponse {
  requestId: string | null;
  ok: boolean;
  type: WorkerRequestType;
  profileId?: string | null;
  text?: string;
  error?: string;
}

type GenAiFilesetResolver = {
  forGenAiTasks: (root: string) => Promise<unknown>;
};

type GenAiRuntime = {
  generateResponse?: (prompt: unknown) => Promise<unknown> | unknown;
  close?: () => void;
  delete?: () => void;
};

type GenAiLlmInferenceStatic = {
  createFromOptions: (
    fileset: unknown,
    options: Record<string, unknown>,
  ) => Promise<GenAiRuntime>;
};

type GenAiBundleModule = {
  FilesetResolver?: GenAiFilesetResolver;
  LlmInference?: GenAiLlmInferenceStatic;
};

type WorkerGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter?: (options?: {
      powerPreference?: "low-power" | "high-performance";
    }) => Promise<BrowserGpuAdapterLike | null>;
  };
};

let loadedBundleUrl: string | null = null;
let loadedBundleModule: GenAiBundleModule | null = null;
let activeProfileId: string | null = null;
let activeRuntime: GenAiRuntime | null = null;
let activeRuntimeSupportsAudio = false;
let restoreVerifiedFetch: (() => void) | null = null;
let restoreAdapterPreferenceShim: (() => void) | null = null;
const LOCAL_AI_BROWSER_MODEL_CACHE = "smartspec-local-ai-models-v1";

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}

function resolveFilesetResolver(
  module?: GenAiBundleModule | null,
): GenAiFilesetResolver | null {
  if (module?.FilesetResolver) {
    return module.FilesetResolver;
  }
  const globalScope = self as typeof self & {
    FilesetResolver?: GenAiFilesetResolver;
  };
  return globalScope.FilesetResolver ?? null;
}

function resolveLlmInference(
  module?: GenAiBundleModule | null,
): GenAiLlmInferenceStatic | null {
  if (module?.LlmInference) {
    return module.LlmInference;
  }
  const globalScope = self as typeof self & {
    LlmInference?: GenAiLlmInferenceStatic;
  };
  return globalScope.LlmInference ?? null;
}

function disposeRuntime() {
  restoreVerifiedFetch?.();
  restoreVerifiedFetch = null;
  restoreAdapterPreferenceShim?.();
  restoreAdapterPreferenceShim = null;
  if (!activeRuntime) {
    activeProfileId = null;
    return;
  }
  try {
    activeRuntime.close?.();
  } catch {
    // Ignore cleanup errors in the worker and reset local state.
  }
  try {
    activeRuntime.delete?.();
  } catch {
    // Ignore cleanup errors in the worker and reset local state.
  }
  activeRuntime = null;
  activeProfileId = null;
  activeRuntimeSupportsAudio = false;
}

async function loadBundleModule(url: string): Promise<GenAiBundleModule> {
  return (await import(/* @vite-ignore */ url)) as GenAiBundleModule;
}

function installAdapterPreferenceShim(preferHighPerformance: boolean): () => void {
  const navigatorWithGpu = self.navigator as WorkerGpuNavigator | undefined;
  const gpu = navigatorWithGpu?.gpu;
  const originalRequestAdapter = gpu?.requestAdapter;
  const wrappedAdapters = new WeakSet<object>();
  const globalScope = self as typeof self & {
    GPUAdapter?: {
      prototype?: BrowserGpuAdapterLike;
    };
  };
  const adapterPrototype = globalScope.GPUAdapter?.prototype;
  if (adapterPrototype && typeof adapterPrototype === "object") {
    wrapAdapterRequestDevice(adapterPrototype, wrappedAdapters);
  }
  if (!gpu || typeof originalRequestAdapter !== "function") {
    return () => undefined;
  }

  gpu.requestAdapter = async (options) => {
    const nextOptions =
      preferHighPerformance &&
      (!options || typeof options.powerPreference === "undefined")
        ? {
            ...(options ?? {}),
            powerPreference: "high-performance" as const,
          }
        : options;

    const adapter = await originalRequestAdapter.call(gpu, nextOptions);
    const runtimeAdapterPrototype =
      adapter && typeof adapter === "object"
        ? (Object.getPrototypeOf(adapter) as BrowserGpuAdapterLike | null)
        : null;
    if (runtimeAdapterPrototype && typeof runtimeAdapterPrototype === "object") {
      wrapAdapterRequestDevice(runtimeAdapterPrototype, wrappedAdapters);
    }
    return wrapAdapterRequestDevice(adapter, wrappedAdapters);
  };

  return () => {
    gpu.requestAdapter = originalRequestAdapter;
  };
}

function collectGeneratedTextCandidates(
  value: unknown,
  seen: WeakSet<object>,
): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return [String(value)];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectGeneratedTextCandidates(entry, seen));
  }

  const candidate = value as Record<string, unknown>;
  const prioritizedKeys = [
    "text",
    "response",
    "outputText",
    "generatedText",
    "content",
    "message",
  ] as const;

  const collected: string[] = [];
  for (const key of prioritizedKeys) {
    collected.push(...collectGeneratedTextCandidates(candidate[key], seen));
  }

  const nestedKeys = [
    "responses",
    "candidates",
    "parts",
    "items",
    "result",
    "results",
    "data",
  ] as const;
  for (const key of nestedKeys) {
    collected.push(...collectGeneratedTextCandidates(candidate[key], seen));
  }

  return collected;
}

function normalizeGeneratedText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const collected = collectGeneratedTextCandidates(value, new WeakSet());
  if (collected.length > 0) {
    return collected.join("\n").trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }
  return JSON.stringify(value);
}

function asString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (
    typeof self.crypto === "undefined" ||
    typeof self.crypto.subtle === "undefined"
  ) {
    throw new Error("browser_worker_checksum_unavailable");
  }
  const digest = await self.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeWasmAssetChecksums(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const checksums: Record<string, string> = {};
  for (const [fileName, checksum] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      fileName.trim().length > 0 &&
      typeof checksum === "string" &&
      checksum.trim().length > 0
    ) {
      checksums[fileName] = checksum.trim();
    }
  }
  return checksums;
}

function installVerifiedAssetFetch(input: {
  wasmRootUrl: string;
  wasmAssetChecksums: Record<string, string>;
  modelAssetUrl: string;
  modelCacheName: string;
}): () => void {
  const globalScope = self as typeof self & { fetch?: typeof fetch };
  const originalFetch = globalScope.fetch?.bind(globalScope);
  if (!originalFetch) {
    return () => undefined;
  }

  const wasmRoot = new URL(
    input.wasmRootUrl.endsWith("/")
      ? input.wasmRootUrl
      : `${input.wasmRootUrl}/`,
  );

  globalScope.fetch = (async (
    resource: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const resourceUrl =
      typeof resource === "string"
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url;
    const resolvedUrl = new URL(resourceUrl, self.location.href);

    if (resolvedUrl.href === input.modelAssetUrl) {
      if (typeof self.caches === "undefined") {
        throw new Error("browser_cache_api_unavailable");
      }
      const cache = await self.caches.open(
        input.modelCacheName || LOCAL_AI_BROWSER_MODEL_CACHE,
      );
      const cachedResponse = await cache.match(input.modelAssetUrl);
      if (!cachedResponse) {
        throw new Error("browser_model_not_cached");
      }
      return cachedResponse.clone();
    }

    if (!resolvedUrl.href.startsWith(wasmRoot.href)) {
      return originalFetch(resource as RequestInfo, init);
    }

    const fileName = resolvedUrl.pathname.split("/").pop()?.trim() ?? "";
    const expectedChecksum = input.wasmAssetChecksums[fileName] ?? null;
    if (!expectedChecksum) {
      throw new Error("browser_runtime_wasm_asset_not_allowlisted");
    }

    const response = await originalFetch(resource as RequestInfo, init);
    if (!response.ok) {
      throw new Error(`browser_runtime_wasm_asset_fetch_failed:${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const actualChecksum = await sha256Hex(buffer);
    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
      throw new Error("browser_runtime_wasm_asset_checksum_mismatch");
    }

    return new Response(buffer, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  }) as typeof fetch;

  return () => {
    globalScope.fetch = originalFetch;
  };
}

async function ensureRuntime(payload: Record<string, unknown>) {
  const globalScope = self as typeof self & {
    __SMARTSPEC_LOCAL_AI_DISABLE_SUBGROUPS__?: boolean;
    __SMARTSPEC_LOCAL_AI_AVOID_POWER_PREFERENCE__?: boolean;
  };
  const profileId = asString(payload.profileId, "");
  const bundleUrl = asString(payload.bundleUrl, "");
  const bundleFallbackUrl = asString(payload.bundleFallbackUrl, "");
  const wasmRootUrl = asString(payload.wasmRootUrl, "");
  const wasmAssetChecksums = normalizeWasmAssetChecksums(
    payload.wasmAssetChecksums,
  );
  const modelAssetUrl = asString(payload.modelAssetUrl, "");
  const modelCacheName = asString(
    payload.modelCacheName,
    LOCAL_AI_BROWSER_MODEL_CACHE,
  );
  const supportAudio = payload.supportAudio === true;
  const preferHighPerformanceAdapter =
    payload.preferHighPerformanceAdapter !== false;
  globalScope.__SMARTSPEC_LOCAL_AI_DISABLE_SUBGROUPS__ =
    payload.disableExperimentalSubgroups === true;
  globalScope.__SMARTSPEC_LOCAL_AI_AVOID_POWER_PREFERENCE__ =
    payload.avoidExplicitPowerPreference === true;

  if (
    !profileId ||
    !bundleUrl ||
    !wasmRootUrl ||
    Object.keys(wasmAssetChecksums).length === 0 ||
    !modelAssetUrl
  ) {
    throw new Error("browser_runtime_config_missing");
  }

  if (loadedBundleUrl !== bundleUrl) {
    let bundleLoaded = false;
    let blobLoadError: unknown = null;
    try {
      loadedBundleModule = await loadBundleModule(bundleUrl);
      loadedBundleUrl = bundleUrl;
      bundleLoaded = true;
    } catch (error) {
      blobLoadError = error;
    }

    if (!bundleLoaded) {
      if (bundleFallbackUrl && bundleFallbackUrl !== bundleUrl) {
        try {
          loadedBundleModule = await loadBundleModule(bundleFallbackUrl);
          loadedBundleUrl = bundleFallbackUrl;
          bundleLoaded = true;
        } catch (fallbackError) {
          const primaryMessage =
            blobLoadError instanceof Error
              ? blobLoadError.message
              : String(blobLoadError ?? "unknown error");
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError ?? "unknown error");
          throw new Error(
            `browser_runtime_bundle_load_failed: primary=${primaryMessage}; fallback=${fallbackMessage}`,
          );
        }
      }
    }

    if (!bundleLoaded) {
      const detail =
        blobLoadError instanceof Error
          ? blobLoadError.message
          : String(blobLoadError ?? "unknown error");
      loadedBundleModule = null;
      throw new Error(`browser_runtime_bundle_load_failed: ${detail}`);
    }
  }

  const filesetResolver = resolveFilesetResolver(loadedBundleModule);
  const llmInference = resolveLlmInference(loadedBundleModule);
  if (!filesetResolver || !llmInference) {
    throw new Error("browser_runtime_bundle_load_failed");
  }

  if (
    activeRuntime &&
    activeProfileId === profileId &&
    (!supportAudio || activeRuntimeSupportsAudio)
  ) {
    return;
  }

  disposeRuntime();

  restoreVerifiedFetch = installVerifiedAssetFetch({
    wasmRootUrl,
    wasmAssetChecksums,
    modelAssetUrl,
    modelCacheName,
  });
  restoreAdapterPreferenceShim = installAdapterPreferenceShim(
    preferHighPerformanceAdapter,
  );
  try {
    const fileset = await filesetResolver.forGenAiTasks(wasmRootUrl);
    activeRuntime = await llmInference.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: modelAssetUrl,
      },
      maxTokens:
        typeof payload.maxTokens === "number" ? payload.maxTokens : 512,
      topK: typeof payload.topK === "number" ? payload.topK : 40,
      temperature:
        typeof payload.temperature === "number" ? payload.temperature : 0.2,
      supportAudio,
    });
    activeProfileId = profileId;
    activeRuntimeSupportsAudio = supportAudio;
  } catch (error) {
    restoreVerifiedFetch?.();
    restoreVerifiedFetch = null;
    restoreAdapterPreferenceShim?.();
    restoreAdapterPreferenceShim = null;
    throw error;
  }
}

function buildAudioPrompt(input: {
  audioSource: string;
  prompt: string;
}): unknown[] {
  return [
    input.prompt.trim() || "Transcribe the audio verbatim.",
    { audioSource: input.audioSource },
  ];
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const requestId =
    event.data && typeof event.data === "object" && "requestId" in event.data
      ? event.data.requestId ?? null
      : null;
  const type =
    event.data && typeof event.data === "object" && "type" in event.data
      ? event.data.type
      : "generate";

  try {
    if (type === "dispose") {
      disposeRuntime();
      postResponse({
        requestId,
        ok: true,
        type,
        profileId: null,
      });
      return;
    }

    const payload =
      event.data && typeof event.data.payload === "object"
        ? event.data.payload
        : {};

    if (type === "init") {
      await ensureRuntime(payload);
      postResponse({
        requestId,
        ok: true,
        type,
        profileId: activeProfileId,
      });
      return;
    }

    if (!activeRuntime) {
      await ensureRuntime(payload);
    }
    if (!activeRuntime || typeof activeRuntime.generateResponse !== "function") {
      throw new Error("browser_runtime_generate_unavailable");
    }

    let generated: unknown;
    if (type === "transcribe") {
      if (!activeRuntimeSupportsAudio) {
        throw new Error("browser_runtime_audio_unavailable");
      }
      const audioWavBuffer =
        payload.audioWavBuffer instanceof ArrayBuffer
          ? payload.audioWavBuffer
          : null;
      if (!audioWavBuffer) {
        throw new Error("audio_wav_buffer_required");
      }
      const prompt = asString(
        payload.prompt,
        "Transcribe the spoken audio verbatim. Respond with plain text only.",
      );
      const audioObjectUrl = URL.createObjectURL(
        new Blob([audioWavBuffer], {
          type: "audio/wav",
        }),
      );
      try {
        generated = await activeRuntime.generateResponse(
          buildAudioPrompt({
            audioSource: audioObjectUrl,
            prompt,
          }),
        );
      } finally {
        URL.revokeObjectURL(audioObjectUrl);
      }
    } else {
      const prompt = asString(payload.prompt, "");
      if (!prompt) {
        throw new Error("prompt_required");
      }
      generated = await activeRuntime.generateResponse(prompt);
    }
    postResponse({
      requestId,
      ok: true,
      type,
      profileId: activeProfileId,
      text: normalizeGeneratedText(generated),
    });
  } catch (error) {
    postResponse({
      requestId,
      ok: false,
      type,
      profileId: activeProfileId,
      error: error instanceof Error ? error.message : "browser_runtime_failed",
    });
  }
});
