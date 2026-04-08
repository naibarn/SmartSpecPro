import { Sha256 } from "@aws-crypto/sha256-browser";
import type {
  CapabilityResult,
  LocalAiCatalogEntry,
} from "../types/capability";

export interface BrowserLocalRuntimeAvailability {
  available: boolean;
  reason:
    | "secure_context_required"
    | "webgpu_unavailable"
    | "webgpu_adapter_unavailable"
    | "webgpu_device_unavailable"
    | "browser_worker_unavailable"
    | null;
}

export interface BrowserLocalTextGenerationInput {
  prompt: string;
  profile: LocalAiCatalogEntry;
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  disableExperimentalSubgroups?: boolean;
  avoidExplicitPowerPreference?: boolean;
  forceFreshWorker?: boolean;
  signal?: AbortSignal;
}

export interface BrowserLocalTextGenerationResult {
  text: string;
  profileId: string;
}

export interface BrowserLocalVoiceTranscriptionInput {
  profile: LocalAiCatalogEntry;
  audioWavBuffer: ArrayBuffer;
  prompt?: string;
  disableExperimentalSubgroups?: boolean;
  avoidExplicitPowerPreference?: boolean;
  signal?: AbortSignal;
}

export interface BrowserLocalVoiceTranscriptionResult {
  text: string;
  profileId: string;
}

export interface BrowserModelDownloadProgress {
  profileId: string;
  downloadedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
  resumable: boolean;
}

interface BrowserLocalRuntimeWorkerRequest {
  requestId: string;
  type: "init" | "generate" | "transcribe" | "dispose";
  payload?: Record<string, unknown>;
}

interface BrowserLocalRuntimeWorkerResponse {
  requestId: string;
  ok: boolean;
  type: "init" | "generate" | "transcribe" | "dispose";
  text?: string;
  profileId?: string;
  error?: string;
}

export const DEFAULT_BROWSER_LOCAL_AI_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/genai_bundle.mjs";
export const DEFAULT_BROWSER_LOCAL_AI_WASM_ROOT_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm";
export const LOCAL_AI_BROWSER_MODEL_CACHE = "smartspec-local-ai-models-v1";
export const BROWSER_LOCAL_RUNTIME_ABORTED_ERROR =
  "browser_runtime_request_aborted";
const LOCAL_AI_CACHE_HEADER_PROFILE_ID = "x-smartspec-local-ai-profile-id";
const LOCAL_AI_CACHE_HEADER_MANIFEST_VERSION =
  "x-smartspec-local-ai-manifest-version";
const LOCAL_AI_CACHE_HEADER_CHECKSUM_SHA256 =
  "x-smartspec-local-ai-checksum-sha256";
const LOCAL_AI_CACHE_HEADER_STATUS = "x-smartspec-local-ai-status";
const LOCAL_AI_CACHE_HEADER_MODEL_ASSET_URL = "x-smartspec-local-ai-model-asset-url";

type BrowserRuntimeConfig = {
  bundleUrl: string;
  bundleSha256: string | null;
  wasmRootUrl: string;
  wasmVersion: string | null;
  wasmAssetChecksums: Record<string, string>;
  modelAssetUrl: string;
};

type BrowserRuntimeDownloadSession = {
  profileId: string;
  downloadedBytes: number;
  totalBytes: number | null;
  contentType: string | null;
};

const workerListeners = new Map<
  string,
  {
    resolve: (value: BrowserLocalRuntimeWorkerResponse) => void;
    reject: (reason?: unknown) => void;
  }
>();

let browserRuntimeWorker: Worker | null = null;
let browserRuntimeWorkerSequence = 0;
const browserRuntimeDownloadSessions = new Map<
  string,
  BrowserRuntimeDownloadSession
>();
const browserRuntimeDownloadControllers = new Map<string, AbortController>();
let browserRuntimeBundleObjectUrl: string | null = null;
let browserRuntimeQueue: Promise<void> = Promise.resolve();

type BrowserRuntimeBundleReference = {
  verifiedBundleUrl: string;
  fallbackBundleUrl: string;
};

const BROWSER_RUNTIME_BUNDLE_LEGACY_LOADER_SNIPPET =
  'async function lr(t){if("function"!=typeof importScripts){const e=document.createElement("script");return e.src=t.toString(),e.crossOrigin="anonymous",new Promise(((t,n)=>{e.addEventListener("load",(()=>{t()}),!1),e.addEventListener("error",(t=>{n(t)}),!1),document.body.appendChild(e)}))}try{importScripts(t.toString())}catch(e){if(!(e instanceof TypeError))throw e;await self.import(t.toString())}}';
const BROWSER_RUNTIME_BUNDLE_PATCHED_LOADER_SNIPPET =
  'async function lr(t){if("function"==typeof importScripts)try{return importScripts(t.toString()),{ModuleFactory:self.ModuleFactory??null}}catch(e){if(!(e instanceof TypeError))throw e}const e=await fetch(t.toString(),{mode:"cors"});if(!e.ok)throw Error("runtime_loader_fetch_failed:"+e.status);let n=await e.text();n+="\\n;globalThis.ModuleFactory=globalThis.ModuleFactory||(\\"undefined\\"!=typeof ModuleFactory?ModuleFactory:void 0);export default (\\"undefined\\"!=typeof ModuleFactory?ModuleFactory:globalThis.ModuleFactory);";const r=URL.createObjectURL(new Blob([n],{type:"application/javascript"}));try{const t=await import(r);return globalThis.ModuleFactory=globalThis.ModuleFactory||t.default||t.ModuleFactory||null,t}finally{URL.revokeObjectURL(r)}}';
const BROWSER_RUNTIME_BUNDLE_LEGACY_SUBGROUP_SNIPPET =
  't.features.has("subgroups")&&(console.warn("Experimental Chromium WGSL subgroup support detected. Enabling this feature in the inference engine."),e.requiredFeatures=["shader-f16","subgroups"])';
const BROWSER_RUNTIME_BUNDLE_PATCHED_SUBGROUP_SNIPPET =
  't.features.has("subgroups")&&(!globalThis.__SMARTSPEC_LOCAL_AI_DISABLE_SUBGROUPS__?(console.warn("Experimental Chromium WGSL subgroup support detected. Enabling this feature in the inference engine."),e.requiredFeatures=["shader-f16","subgroups"]):console.info("SmartSpec Local AI stable browser runtime disabled experimental Chromium WGSL subgroup support."))';
const BROWSER_RUNTIME_BUNDLE_LEGACY_POWER_PREFERENCE_SNIPPET =
  'Kr.X({powerPreference:"high-performance"})';
const BROWSER_RUNTIME_BUNDLE_PATCHED_POWER_PREFERENCE_SNIPPET =
  'Kr.X(globalThis.__SMARTSPEC_LOCAL_AI_AVOID_POWER_PREFERENCE__?{}:{powerPreference:"high-performance"})';

function createBrowserRuntimeError(reason: string): Error {
  return new Error(reason);
}

export function patchBrowserRuntimeBundleSource(source: string): string {
  let nextSource = source;
  if (nextSource.includes(BROWSER_RUNTIME_BUNDLE_LEGACY_LOADER_SNIPPET)) {
    nextSource = nextSource.replace(
      BROWSER_RUNTIME_BUNDLE_LEGACY_LOADER_SNIPPET,
      BROWSER_RUNTIME_BUNDLE_PATCHED_LOADER_SNIPPET,
    );
  }
  if (nextSource.includes(BROWSER_RUNTIME_BUNDLE_LEGACY_SUBGROUP_SNIPPET)) {
    nextSource = nextSource.replace(
      BROWSER_RUNTIME_BUNDLE_LEGACY_SUBGROUP_SNIPPET,
      BROWSER_RUNTIME_BUNDLE_PATCHED_SUBGROUP_SNIPPET,
    );
  }
  if (nextSource.includes(BROWSER_RUNTIME_BUNDLE_LEGACY_POWER_PREFERENCE_SNIPPET)) {
    nextSource = nextSource.replace(
      BROWSER_RUNTIME_BUNDLE_LEGACY_POWER_PREFERENCE_SNIPPET,
      BROWSER_RUNTIME_BUNDLE_PATCHED_POWER_PREFERENCE_SNIPPET,
    );
  }
  return nextSource;
}

function terminateBrowserRuntimeWorker(
  reason = "browser_runtime_terminated",
  revokeBundleReference = true,
) {
  if (browserRuntimeWorker) {
    browserRuntimeWorker.terminate();
    browserRuntimeWorker = null;
  }
  const pendingListeners = [...workerListeners.values()];
  workerListeners.clear();
  for (const listener of pendingListeners) {
    listener.reject(createBrowserRuntimeError(reason));
  }
  if (revokeBundleReference && browserRuntimeBundleObjectUrl) {
    URL.revokeObjectURL(browserRuntimeBundleObjectUrl);
    browserRuntimeBundleObjectUrl = null;
  }
}

export function isBrowserLocalRuntimeAbortError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === BROWSER_LOCAL_RUNTIME_ABORTED_ERROR
  );
}

export function isBrowserLocalRuntimeRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (isBrowserLocalRuntimeAbortError(error)) {
    return false;
  }
  return [
    "browser_runtime_timeout",
    "browser_runtime_worker_crashed",
    "browser_runtime_terminated",
    "browser_runtime_disposed",
    "browser_runtime_failed",
  ].some((candidate) => error.message.includes(candidate));
}

function isAllowedBrowserRuntimeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.hostname === "cdn.jsdelivr.net") {
      return (
        /^\/npm\/@mediapipe\/tasks-genai@\d+\.\d+\.\d+\/genai_bundle\.cjs$/u.test(
          parsed.pathname,
        ) ||
        /^\/npm\/@mediapipe\/tasks-genai@\d+\.\d+\.\d+\/genai_bundle\.mjs$/u.test(
          parsed.pathname,
        ) ||
        /^\/npm\/@mediapipe\/tasks-genai@\d+\.\d+\.\d+\/wasm$/u.test(
          parsed.pathname,
        ) ||
        /^\/npm\/@mediapipe\/tasks-genai@\d+\.\d+\.\d+\/wasm\/[\w.-]+$/u.test(
          parsed.pathname,
        )
      );
    }
    if (parsed.hostname === "huggingface.co") {
      return /^\/litert-community\/[\w.-]+\/resolve\/main\/[\w.-]+$/u.test(
        parsed.pathname,
      );
    }
    return false;
  } catch {
    return false;
  }
}

function isWorkerAvailable(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.subtle === "undefined"
  ) {
    throw new Error("browser_checksum_unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildBrowserModelCacheHeaders(
  profile: LocalAiCatalogEntry,
  runtimeConfig: BrowserRuntimeConfig,
): Record<string, string> {
  return {
    "content-type": "application/octet-stream",
    [LOCAL_AI_CACHE_HEADER_PROFILE_ID]: profile.id,
    [LOCAL_AI_CACHE_HEADER_MANIFEST_VERSION]: String(
      profile.integrity.manifestVersion,
    ),
    [LOCAL_AI_CACHE_HEADER_CHECKSUM_SHA256]:
      profile.integrity.checksumSha256 ?? "",
    [LOCAL_AI_CACHE_HEADER_STATUS]: profile.status,
    [LOCAL_AI_CACHE_HEADER_MODEL_ASSET_URL]: runtimeConfig.modelAssetUrl,
  };
}

async function fetchArrayBufferWithChecksum(input: {
  url: string;
  checksumSha256: string | null;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: "GET",
      mode: "cors",
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createBrowserRuntimeError(BROWSER_LOCAL_RUNTIME_ABORTED_ERROR);
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`runtime_asset_fetch_failed:${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  if (input.checksumSha256) {
    const actualChecksum = await sha256Hex(buffer);
    if (actualChecksum.toLowerCase() !== input.checksumSha256.toLowerCase()) {
      throw new Error("runtime_asset_checksum_mismatch");
    }
  }
  return buffer;
}

function isCachedBrowserModelFresh(input: {
  profile: LocalAiCatalogEntry;
  runtimeConfig: BrowserRuntimeConfig;
  response: Response;
}): boolean {
  if (input.profile.status !== "allowed") {
    return false;
  }
  return (
    input.response.headers.get(LOCAL_AI_CACHE_HEADER_PROFILE_ID) ===
      input.profile.id &&
    input.response.headers.get(LOCAL_AI_CACHE_HEADER_MANIFEST_VERSION) ===
      String(input.profile.integrity.manifestVersion) &&
    input.response.headers.get(LOCAL_AI_CACHE_HEADER_CHECKSUM_SHA256) ===
      (input.profile.integrity.checksumSha256 ?? "") &&
    input.response.headers.get(LOCAL_AI_CACHE_HEADER_STATUS) === "allowed" &&
    input.response.headers.get(LOCAL_AI_CACHE_HEADER_MODEL_ASSET_URL) ===
      input.runtimeConfig.modelAssetUrl
  );
}

async function withBrowserRuntimeExclusive<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = browserRuntimeQueue;
  let release: () => void = () => undefined;
  browserRuntimeQueue = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function getBrowserRuntimeConfig(
  profile: LocalAiCatalogEntry,
): BrowserRuntimeConfig | null {
  if (!profile.supportedPlatforms.includes("web")) {
    return null;
  }
  const bundleUrl =
    profile.runtimeConfig?.browser?.bundleUrl?.trim() ||
    DEFAULT_BROWSER_LOCAL_AI_BUNDLE_URL;
  const bundleSha256 =
    profile.runtimeConfig?.browser?.bundleSha256?.trim() ||
    null;
  const wasmRootUrl =
    profile.runtimeConfig?.browser?.wasmRootUrl?.trim() ||
    DEFAULT_BROWSER_LOCAL_AI_WASM_ROOT_URL;
  const wasmVersion =
    profile.runtimeConfig?.browser?.wasmVersion?.trim() ||
    null;
  const wasmAssetChecksums =
    profile.runtimeConfig?.browser?.wasmAssetChecksums ?? null;
  const modelAssetUrl =
    profile.runtimeConfig?.browser?.modelAssetUrl?.trim() || null;

  if (
    !modelAssetUrl ||
    !bundleSha256 ||
    !wasmVersion ||
    !wasmAssetChecksums ||
    Object.keys(wasmAssetChecksums).length === 0
  ) {
    return null;
  }
  if (
    !isAllowedBrowserRuntimeUrl(bundleUrl) ||
    !isAllowedBrowserRuntimeUrl(modelAssetUrl) ||
    !isAllowedBrowserRuntimeUrl(wasmRootUrl)
  ) {
    return null;
  }

  return {
    bundleUrl,
    bundleSha256,
    wasmRootUrl,
    wasmVersion,
    wasmAssetChecksums,
    modelAssetUrl,
  };
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isMemoryAllocationError(error: unknown): boolean {
  if (error instanceof RangeError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /array buffer allocation failed|out of memory|memory/i.test(
    error.message,
  );
}

function ensureBrowserRuntimeWorker(): Worker {
  if (!isWorkerAvailable()) {
    throw new Error("browser_worker_unavailable");
  }

  if (browserRuntimeWorker) {
    return browserRuntimeWorker;
  }

  const worker = new Worker(
    new URL("../workers/local-llm.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BrowserLocalRuntimeWorkerResponse | undefined;
    if (!data?.requestId) {
      return;
    }
    const listener = workerListeners.get(data.requestId);
    if (!listener) {
      return;
    }
    workerListeners.delete(data.requestId);
    if (data.ok) {
      listener.resolve(data);
      return;
    }
    listener.reject(new Error(data.error ?? "browser_runtime_failed"));
  });
  worker.addEventListener("error", (event) => {
    terminateBrowserRuntimeWorker(
      event.message?.trim() || "browser_runtime_worker_crashed",
    );
  });
  browserRuntimeWorker = worker;
  return worker;
}

function postWorkerMessage(
  type: BrowserLocalRuntimeWorkerRequest["type"],
  payload?: Record<string, unknown>,
  transfer?: Transferable[],
  options?: {
    signal?: AbortSignal;
    terminateWorkerOnAbort?: boolean;
  },
): Promise<BrowserLocalRuntimeWorkerResponse> {
  const signal = options?.signal;
  if (signal?.aborted) {
    if (options?.terminateWorkerOnAbort) {
      terminateBrowserRuntimeWorker(BROWSER_LOCAL_RUNTIME_ABORTED_ERROR);
    }
    return Promise.reject(
      createBrowserRuntimeError(BROWSER_LOCAL_RUNTIME_ABORTED_ERROR),
    );
  }
  const worker = ensureBrowserRuntimeWorker();
  const requestId = `local-ai-${Date.now()}-${browserRuntimeWorkerSequence++}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
    };
    const resolveOnce = (value: BrowserLocalRuntimeWorkerResponse) => {
      if (settled) {
        return;
      }
      cleanup();
      resolve(value);
    };
    const rejectOnce = (reason?: unknown) => {
      if (settled) {
        return;
      }
      cleanup();
      reject(reason);
    };
    const handleAbort = () => {
      workerListeners.delete(requestId);
      if (options?.terminateWorkerOnAbort) {
        terminateBrowserRuntimeWorker(BROWSER_LOCAL_RUNTIME_ABORTED_ERROR);
      }
      rejectOnce(createBrowserRuntimeError(BROWSER_LOCAL_RUNTIME_ABORTED_ERROR));
    };
    const timeoutId = window.setTimeout(() => {
      workerListeners.delete(requestId);
      rejectOnce(createBrowserRuntimeError("browser_runtime_timeout"));
    }, 120_000);
    workerListeners.set(requestId, {
      resolve: resolveOnce,
      reject: rejectOnce,
    });
    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage({
      requestId,
      type,
      payload,
    } satisfies BrowserLocalRuntimeWorkerRequest, transfer ?? []);
  });
}

function getDownloadProgressSnapshot(
  session: BrowserRuntimeDownloadSession,
): BrowserModelDownloadProgress {
  return {
    profileId: session.profileId,
    downloadedBytes: session.downloadedBytes,
    totalBytes: session.totalBytes,
    progressPercent:
      session.totalBytes && session.totalBytes > 0
        ? Math.min(
            100,
            Math.round((session.downloadedBytes / session.totalBytes) * 100),
          )
        : null,
    resumable: false,
  };
}

async function getCachedBrowserModelResponse(
  profile: LocalAiCatalogEntry,
): Promise<Response | null> {
  const runtimeConfig = getBrowserRuntimeConfig(profile);
  if (!runtimeConfig) {
    return null;
  }
  if (typeof window === "undefined" || typeof window.caches === "undefined") {
    return null;
  }
  const cache = await window.caches.open(LOCAL_AI_BROWSER_MODEL_CACHE);
  const cached = (await cache.match(runtimeConfig.modelAssetUrl)) ?? null;
  if (!cached) {
    return null;
  }
  if (
    !isCachedBrowserModelFresh({
      profile,
      runtimeConfig,
      response: cached,
    })
  ) {
    await cache.delete(runtimeConfig.modelAssetUrl);
    resetDownloadSession(profile.id);
    return null;
  }
  return cached;
}

function resetDownloadSession(profileId: string) {
  browserRuntimeDownloadSessions.delete(profileId);
}

async function ensureBrowserRuntimeBundleReference(
  runtimeConfig: BrowserRuntimeConfig,
  signal?: AbortSignal,
): Promise<BrowserRuntimeBundleReference> {
  if (browserRuntimeBundleObjectUrl) {
    return {
      verifiedBundleUrl: browserRuntimeBundleObjectUrl,
      fallbackBundleUrl: runtimeConfig.bundleUrl,
    };
  }
  const bundleBuffer = await fetchArrayBufferWithChecksum({
    url: runtimeConfig.bundleUrl,
    checksumSha256: runtimeConfig.bundleSha256,
    signal,
  });
  let bundleBlobContents: BlobPart = bundleBuffer;
  try {
    const decodedBundle = new TextDecoder().decode(bundleBuffer);
    const patchedBundle = patchBrowserRuntimeBundleSource(decodedBundle);
    if (patchedBundle !== decodedBundle) {
      bundleBlobContents = patchedBundle;
    }
  } catch {
    bundleBlobContents = bundleBuffer;
  }
  browserRuntimeBundleObjectUrl = URL.createObjectURL(
    new Blob([bundleBlobContents], {
      type: "application/javascript",
    }),
  );
  return {
    verifiedBundleUrl: browserRuntimeBundleObjectUrl,
    fallbackBundleUrl: runtimeConfig.bundleUrl,
  };
}

export function cancelBrowserLocalRuntimeModelDownload(profileId: string): boolean {
  const controller = browserRuntimeDownloadControllers.get(profileId);
  if (!controller) {
    return false;
  }
  controller.abort();
  browserRuntimeDownloadControllers.delete(profileId);
  return true;
}

export function getBrowserLocalRuntimeModelDownloadProgress(
  profileId: string,
): BrowserModelDownloadProgress | null {
  const session = browserRuntimeDownloadSessions.get(profileId);
  return session ? getDownloadProgressSnapshot(session) : null;
}

export async function isBrowserLocalRuntimeModelCached(
  profile: LocalAiCatalogEntry,
): Promise<boolean> {
  const cached = await getCachedBrowserModelResponse(profile);
  cached?.body?.cancel().catch(() => undefined);
  return cached != null;
}

export function detectBrowserLocalRuntimeAvailability(input: {
  secureContext: boolean;
  webgpu: boolean;
  webgpuAdapterAvailable: boolean;
  webgpuDeviceAvailable?: boolean;
}): BrowserLocalRuntimeAvailability {
  if (!input.secureContext) {
    return {
      available: false,
      reason: "secure_context_required",
    };
  }
  if (!input.webgpu) {
    return {
      available: false,
      reason: "webgpu_unavailable",
    };
  }
  if (!input.webgpuAdapterAvailable) {
    return {
      available: false,
      reason: "webgpu_adapter_unavailable",
    };
  }
  if (input.webgpuDeviceAvailable === false) {
    return {
      available: false,
      reason: "webgpu_device_unavailable",
    };
  }
  if (!isWorkerAvailable()) {
    return {
      available: false,
      reason: "browser_worker_unavailable",
    };
  }
  return {
    available: true,
    reason: null,
  };
}

export function supportsLocalVoiceRuntime(input: {
  catalog: LocalAiCatalogEntry[];
  capability: CapabilityResult;
}): boolean {
  if (!input.capability.supported) {
    return false;
  }

  const eligibleVoiceProfileIds = new Set(input.capability.eligibleVoiceProfiles);
  return input.catalog.some((entry) => {
    if (
      entry.status !== "allowed" ||
      !entry.supportedPlatforms.includes("web") ||
      !entry.supportsVoiceInput ||
      !eligibleVoiceProfileIds.has(entry.id)
    ) {
      return false;
    }
    return getBrowserRuntimeConfig(entry) !== null;
  });
}

export async function cacheBrowserLocalRuntimeModel(
  profile: LocalAiCatalogEntry,
  options: {
    onProgress?: (progress: BrowserModelDownloadProgress) => void;
    resume?: boolean;
    retry?: boolean;
  } = {},
): Promise<void> {
  const runtimeConfig = getBrowserRuntimeConfig(profile);
  if (!runtimeConfig) {
    throw new Error("browser_runtime_config_missing");
  }
  if (typeof window === "undefined" || typeof window.caches === "undefined") {
    throw new Error("browser_cache_api_unavailable");
  }

  const cache = await window.caches.open(LOCAL_AI_BROWSER_MODEL_CACHE);
  const existing = await cache.match(runtimeConfig.modelAssetUrl);
  if (existing) {
    if (
      isCachedBrowserModelFresh({
        profile,
        runtimeConfig,
        response: existing,
      })
    ) {
      resetDownloadSession(profile.id);
      options.onProgress?.({
        profileId: profile.id,
        downloadedBytes: 1,
        totalBytes: 1,
        progressPercent: 100,
        resumable: false,
      });
      return;
    }
    await cache.delete(runtimeConfig.modelAssetUrl);
  }

  let session = browserRuntimeDownloadSessions.get(profile.id);
  if (!session || options.retry) {
    session = {
      profileId: profile.id,
      downloadedBytes: 0,
      totalBytes: null,
      contentType: null,
    };
    browserRuntimeDownloadSessions.set(profile.id, session);
  }

  const controller = new AbortController();
  browserRuntimeDownloadControllers.set(profile.id, controller);
  let cacheWritePromise: Promise<void> | null = null;

  try {
    const response = await fetch(runtimeConfig.modelAssetUrl, {
      method: "GET",
      mode: "cors",
      signal: controller.signal,
    });
    if (!(response.ok || response.status === 206)) {
      throw new Error(`model_download_failed:${response.status}`);
    }

    if (response.status === 200 && session.downloadedBytes > 0) {
      session = {
        profileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        contentType: null,
      };
      browserRuntimeDownloadSessions.set(profile.id, session);
    }

    session.contentType =
      response.headers.get("content-type") ?? session.contentType;
    session.totalBytes = (() => {
      const contentLength = response.headers.get("content-length");
      const lengthValue = contentLength
        ? Number.parseInt(contentLength, 10)
        : Number.NaN;
      return Number.isFinite(lengthValue) ? lengthValue : null;
    })();

    if (!response.body) {
      throw new Error("model_download_stream_unavailable");
    }

    const [cacheStream, progressStream] = response.body.tee();
    cacheWritePromise = cache.put(
      runtimeConfig.modelAssetUrl,
      new Response(cacheStream, {
        headers: buildBrowserModelCacheHeaders(profile, runtimeConfig),
      }),
    );

    const reader = progressStream.getReader();
    const checksumHasher = profile.integrity.checksumSha256
      ? new Sha256()
      : null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      session.downloadedBytes += value.byteLength;
      checksumHasher?.update(value);
      options.onProgress?.(getDownloadProgressSnapshot(session));
    }

    const totalBytes = session.downloadedBytes;

    if (profile.integrity.checksumSha256 && checksumHasher) {
      const actualChecksum = bytesToHex(
        new Uint8Array(await checksumHasher.digest()),
      );
      if (
        actualChecksum.toLowerCase() !==
        profile.integrity.checksumSha256.toLowerCase()
      ) {
        await cacheWritePromise.catch(() => undefined);
        await cache.delete(runtimeConfig.modelAssetUrl).catch(() => undefined);
        resetDownloadSession(profile.id);
        throw new Error("model_checksum_mismatch");
      }
    }

    await cacheWritePromise;
    resetDownloadSession(profile.id);
    options.onProgress?.({
      profileId: profile.id,
      downloadedBytes: totalBytes,
      totalBytes,
      progressPercent: 100,
      resumable: false,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      options.onProgress?.(getDownloadProgressSnapshot(session));
      await cacheWritePromise?.catch(() => undefined);
      await cache.delete(runtimeConfig.modelAssetUrl).catch(() => undefined);
      throw new Error("model_download_cancelled");
    }
    if (isMemoryAllocationError(error)) {
      resetDownloadSession(profile.id);
      await cacheWritePromise?.catch(() => undefined);
      await cache.delete(runtimeConfig.modelAssetUrl).catch(() => undefined);
      throw new Error("model_download_memory_exhausted");
    }
    await cacheWritePromise?.catch(() => undefined);
    await cache.delete(runtimeConfig.modelAssetUrl).catch(() => undefined);
    throw error;
  } finally {
    browserRuntimeDownloadControllers.delete(profile.id);
  }
}

export async function removeCachedBrowserLocalRuntimeModel(
  profile: LocalAiCatalogEntry,
): Promise<void> {
  const runtimeConfig = getBrowserRuntimeConfig(profile);
  if (!runtimeConfig) {
    return;
  }
  if (typeof window === "undefined" || typeof window.caches === "undefined") {
    return;
  }

  const cache = await window.caches.open(LOCAL_AI_BROWSER_MODEL_CACHE);
  await cache.delete(runtimeConfig.modelAssetUrl);
  resetDownloadSession(profile.id);
}

export async function generateTextWithBrowserLocalRuntime(
  input: BrowserLocalTextGenerationInput,
): Promise<BrowserLocalTextGenerationResult> {
  return withBrowserRuntimeExclusive(async () => {
    if (input.forceFreshWorker === true && browserRuntimeWorker) {
      terminateBrowserRuntimeWorker("browser_runtime_force_reset", false);
    }

    const runtimeConfig = getBrowserRuntimeConfig(input.profile);
    if (!runtimeConfig) {
      throw new Error("browser_runtime_config_missing");
    }

    const cachedResponse =
      (await getCachedBrowserModelResponse(input.profile)) ?? null;
    if (!cachedResponse) {
      throw new Error("browser_model_not_cached");
    }
    cachedResponse.body?.cancel().catch(() => undefined);

    const bundleReference = await ensureBrowserRuntimeBundleReference(
      runtimeConfig,
      input.signal,
    );

    try {
      await postWorkerMessage(
        "init",
        {
          profileId: input.profile.id,
          bundleUrl: bundleReference.verifiedBundleUrl,
          bundleFallbackUrl: bundleReference.fallbackBundleUrl,
          wasmRootUrl: runtimeConfig.wasmRootUrl,
          wasmAssetChecksums: runtimeConfig.wasmAssetChecksums,
          modelAssetUrl: runtimeConfig.modelAssetUrl,
          modelCacheName: LOCAL_AI_BROWSER_MODEL_CACHE,
          maxTokens: input.maxTokens ?? 512,
          topK: input.topK ?? 40,
          temperature: input.temperature ?? 0.2,
          preferHighPerformanceAdapter: true,
          disableExperimentalSubgroups:
            input.disableExperimentalSubgroups === true,
          avoidExplicitPowerPreference:
            input.avoidExplicitPowerPreference === true,
        },
        undefined,
        {
          signal: input.signal,
          terminateWorkerOnAbort: true,
        },
      );

      const response = await postWorkerMessage(
        "generate",
        {
          profileId: input.profile.id,
          prompt: input.prompt,
        },
        undefined,
        {
          signal: input.signal,
          terminateWorkerOnAbort: true,
        },
      );

      return {
        text: response.text ?? "",
        profileId: response.profileId ?? input.profile.id,
      };
    } finally {
      if (input.forceFreshWorker === true) {
        terminateBrowserRuntimeWorker("browser_runtime_force_reset", false);
      }
    }
  });
}

export async function disposeBrowserLocalRuntime(): Promise<void> {
  await withBrowserRuntimeExclusive(async () => {
    if (!browserRuntimeWorker) {
      return;
    }

    try {
      await postWorkerMessage("dispose");
    } finally {
      terminateBrowserRuntimeWorker("browser_runtime_disposed");
    }
  });
}

export async function transcribeWithBrowserLocalRuntime(
  input: BrowserLocalVoiceTranscriptionInput,
): Promise<BrowserLocalVoiceTranscriptionResult> {
  return withBrowserRuntimeExclusive(async () => {
    const runtimeConfig = getBrowserRuntimeConfig(input.profile);
    if (!runtimeConfig) {
      throw new Error("browser_runtime_config_missing");
    }

    const cachedResponse =
      (await getCachedBrowserModelResponse(input.profile)) ?? null;
    if (!cachedResponse) {
      throw new Error("browser_model_not_cached");
    }
    cachedResponse.body?.cancel().catch(() => undefined);

    const bundleReference = await ensureBrowserRuntimeBundleReference(
      runtimeConfig,
      input.signal,
    );

    await postWorkerMessage(
      "init",
      {
        profileId: input.profile.id,
        bundleUrl: bundleReference.verifiedBundleUrl,
        bundleFallbackUrl: bundleReference.fallbackBundleUrl,
        wasmRootUrl: runtimeConfig.wasmRootUrl,
        wasmAssetChecksums: runtimeConfig.wasmAssetChecksums,
        modelAssetUrl: runtimeConfig.modelAssetUrl,
        modelCacheName: LOCAL_AI_BROWSER_MODEL_CACHE,
        maxTokens: 512,
        topK: 40,
        temperature: 0.2,
        supportAudio: true,
        preferHighPerformanceAdapter: true,
        disableExperimentalSubgroups:
          input.disableExperimentalSubgroups === true,
        avoidExplicitPowerPreference:
          input.avoidExplicitPowerPreference === true,
      },
      undefined,
      {
        signal: input.signal,
        terminateWorkerOnAbort: true,
      },
    );

    const response = await postWorkerMessage(
      "transcribe",
      {
        profileId: input.profile.id,
        prompt:
          input.prompt?.trim() ||
          "Transcribe the spoken audio verbatim. Respond with plain text only in the original language.",
        audioWavBuffer: input.audioWavBuffer,
      },
      [input.audioWavBuffer],
      {
        signal: input.signal,
        terminateWorkerOnAbort: true,
      },
    );

    return {
      text: response.text ?? "",
      profileId: response.profileId ?? input.profile.id,
    };
  });
}
