import type {
  CapabilityResult,
  LocalAiCatalogEntry,
  LocalAiExecutionMode,
  LocalAiPlatform,
  LocalAiSyncedPreferences,
} from "../types/capability";
import type { LocalAiDeviceStateScope } from "../types/deviceState";
import {
  readLocalAiDeviceState,
  writeLocalAiDeviceState,
} from "../state/localAiDeviceStateStorage";
import {
  disposeBrowserLocalRuntime,
  generateTextWithBrowserLocalRuntime,
  isBrowserLocalRuntimeAbortError,
  isBrowserLocalRuntimeRetryableError,
} from "../adapters/browserLocalRuntime";
import {
  executeExternalLocalTextCompletion,
  EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
  isExternalLocalTextBackendAbortError,
  readLocalAiLocalEnginePreference,
  readConfiguredExternalLocalTextBackend,
  readConfiguredExternalLocalTextBackendReason,
  shouldAllowExternalLocalBackend,
  shouldAllowOnDeviceLocalEngine,
} from "../adapters/externalLocalTextBackend";
import {
  executeTauriLocalGemmaTextStream,
  getTauriLocalSkillRuntimeStatus,
  isTauriLocalRuntimeAbortError,
} from "../skills/tauriSkillRuntime";

export interface LocalReplyMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateTauriLocalReplyInput {
  platform: LocalAiPlatform;
  preferences: LocalAiSyncedPreferences;
  forceCloudOnly: boolean;
  catalog: LocalAiCatalogEntry[];
  capability?: CapabilityResult | null;
  scope?: LocalAiDeviceStateScope | null;
  recentMessages: LocalReplyMessage[];
  userText: string;
  onPartialText?: (text: string) => void;
  abortSignal?: AbortSignal;
}

export interface GenerateTauriLocalReplyResult {
  text: string;
  profileId: string;
  provider?: string | null;
  model?: string | null;
}

export class LocalTextRuntimeError extends Error {
  code: string;
  profileId: string | null;

  constructor(code: string, message?: string, profileId?: string | null) {
    super(message ?? code);
    this.name = "LocalTextRuntimeError";
    this.code = code;
    this.profileId = profileId ?? null;
  }
}

export function isLocalTextRuntimeError(
  error: unknown,
): error is LocalTextRuntimeError {
  return (
    error instanceof Error &&
    error.name === "LocalTextRuntimeError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

const MAX_USER_TEXT_CHARS = 1_600;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 8_000;
const BROWSER_LOCAL_MAX_HISTORY_MESSAGES = 4;
const BROWSER_LOCAL_MAX_HISTORY_CHARS = 2_600;
const BROWSER_LOCAL_PRIMARY_MAX_TOKENS = 768;
const BROWSER_LOCAL_FALLBACK_MAX_TOKENS = 512;
const PSEUDO_STREAM_DELAY_MS = 18;
const BROWSER_LOCAL_REPLY_MAX_RETRIES = 1;
const BROWSER_LOCAL_REPLY_RETRY_DELAY_MS = 120;

export { isTauriLocalRuntimeAbortError };
export { isExternalLocalTextBackendAbortError };

function shouldExplainMissingLocalRuntime(
  preferences: LocalAiSyncedPreferences,
  forceCloudOnly: boolean,
): boolean {
  return (
    preferences.enabled &&
    !forceCloudOnly &&
    preferences.mode === "local_only" &&
    preferences.useForGeneralChat
  );
}

function trimText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3).trimEnd()}...`;
}

function shouldAllowGeneralLocalReply(
  preferences: LocalAiSyncedPreferences,
  forceCloudOnly: boolean,
): boolean {
  if (
    forceCloudOnly ||
    !preferences.enabled ||
    !preferences.useForGeneralChat ||
    preferences.mode === "off" ||
    preferences.mode === "cloud_only"
  ) {
    return false;
  }
  return true;
}

function pickInstalledTauriProfileId(input: {
  preferredProfileId: string | null;
  installedProfileIds: string[];
  catalog: LocalAiCatalogEntry[];
}): string | null {
  const allowedIds = input.catalog
    .filter(
      (entry) =>
        entry.status === "allowed" &&
        entry.supportedPlatforms.includes("tauri") &&
        input.installedProfileIds.includes(entry.id),
    )
    .map((entry) => entry.id);

  if (
    input.preferredProfileId &&
    allowedIds.includes(input.preferredProfileId)
  ) {
    return input.preferredProfileId;
  }

  return (
    allowedIds.find((value) => value === "gemma4-e4b-tauri-balanced") ??
    allowedIds.find((value) => value === "gemma4-e2b-tauri-fast") ??
    allowedIds[0] ??
    null
  );
}

function pickInstalledBrowserProfile(input: {
  preferredProfileId: string | null;
  installedProfileIds: string[];
  eligibleProfileIds?: string[] | null;
  catalog: LocalAiCatalogEntry[];
}): LocalAiCatalogEntry | null {
  const eligibleProfileIdSet =
    input.eligibleProfileIds && input.eligibleProfileIds.length > 0
      ? new Set(input.eligibleProfileIds)
      : null;
  const allowedProfiles = input.catalog.filter((entry) => {
    if (
      entry.status !== "allowed" ||
      !entry.supportedPlatforms.includes("web") ||
      !input.installedProfileIds.includes(entry.id)
    ) {
      return false;
    }
    if (!eligibleProfileIdSet) {
      return true;
    }
    return eligibleProfileIdSet.has(entry.id);
  });

  if (input.preferredProfileId) {
    const preferred = allowedProfiles.find(
      (entry) => entry.id === input.preferredProfileId,
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    allowedProfiles.find((entry) => entry.id === "gemma4-e2b-web-fast") ??
    allowedProfiles.find((entry) => entry.id === "gemma4-e4b-web-balanced") ??
    allowedProfiles[0] ??
    null
  );
}

function buildLocalReplyPrompt(input: {
  recentMessages: LocalReplyMessage[];
  userText: string;
  maxHistoryMessages?: number;
  maxHistoryChars?: number;
}): string {
  const history = trimText(
    input.recentMessages
      .slice(-(input.maxHistoryMessages ?? MAX_HISTORY_MESSAGES))
      .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
      .join("\n\n"),
    input.maxHistoryChars ?? MAX_HISTORY_CHARS,
  );

  return [
    "You are SmartSpecPro running as a local Gemma 4 assistant on the user's device.",
    "Respond helpfully and directly to the user.",
    "If the request depends on live web data, unsupported tools, or missing external context, say so briefly instead of inventing facts.",
    "Keep the answer concise and action-oriented.",
    history ? `[Recent conversation]\n${history}` : "",
    `[Current user message]\n${trimText(input.userText, MAX_USER_TEXT_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildBrowserLocalReplyPrompt(input: {
  recentMessages: LocalReplyMessage[];
  userText: string;
}): string {
  return buildLocalReplyPrompt({
    recentMessages: input.recentMessages,
    userText: input.userText,
    maxHistoryMessages: BROWSER_LOCAL_MAX_HISTORY_MESSAGES,
    maxHistoryChars: BROWSER_LOCAL_MAX_HISTORY_CHARS,
  });
}

function buildFallbackLocalReplyPrompt(userText: string): string {
  return [
    "You are SmartSpecPro running as a local Gemma 4 assistant on the user's device.",
    "Answer the user directly in the same language as the user's message.",
    "Do not include labels such as [Response], [Assistant], or role prefixes.",
    "Keep the answer short and practical.",
    trimText(userText, MAX_USER_TEXT_CHARS),
  ].join("\n\n");
}

function normalizeLocalReplyText(text: string): string {
  const normalized = text
    .replace(/^\s*\[(response|assistant|answer)\]\s*/iu, "")
    .replace(/^\s*(response|assistant|answer)\s*:\s*/iu, "")
    .trim();
  return normalized;
}

function isBrowserLocalPromptTooLongError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    message.includes("too long for the model to process") ||
    (message.includes("INVALID_ARGUMENT") &&
      message.includes("input_size(") &&
      message.includes("maxTokens("))
  );
}

function toFriendlyBrowserLocalRuntimeError(
  error: unknown,
  profileId: string,
): LocalTextRuntimeError {
  if (isBrowserLocalPromptTooLongError(error)) {
    return new LocalTextRuntimeError(
      "browser_local_text_prompt_too_long",
      "The local browser model could not fit this request and recent chat context into its current token budget. Try a shorter prompt, remove some recent context, use auto/prefer_local, or switch to a localhost backend.",
      profileId,
    );
  }

  return new LocalTextRuntimeError(
    "browser_local_text_runtime_failed",
    error instanceof Error
      ? error.message
      : "Browser local text runtime failed on this device.",
    profileId,
  );
}

async function waitForBrowserLocalRetry(signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise((resolve) =>
    window.setTimeout(resolve, BROWSER_LOCAL_REPLY_RETRY_DELAY_MS),
  );
  assertNotAborted(signal);
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("browser_runtime_request_aborted");
  }
}

function splitPseudoStreamingText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const sentenceChunks = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (sentenceChunks.length > 1) {
    return sentenceChunks;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return [trimmed];
  }

  const chunkSize = Math.max(4, Math.ceil(words.length / 10));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(" "));
  }
  return chunks;
}

async function emitPseudoStreamingText(input: {
  text: string;
  signal?: AbortSignal;
  onPartialText?: (text: string) => void;
  delayMs?: number;
}) {
  if (!input.onPartialText) {
    return;
  }
  const chunks = splitPseudoStreamingText(input.text);
  if (chunks.length <= 1) {
    assertNotAborted(input.signal);
    input.onPartialText(input.text);
    return;
  }

  let accumulated = "";
  for (const chunk of chunks) {
    assertNotAborted(input.signal);
    accumulated = accumulated ? `${accumulated} ${chunk}` : chunk;
    input.onPartialText(accumulated);
    await new Promise((resolve) =>
      window.setTimeout(resolve, input.delayMs ?? PSEUDO_STREAM_DELAY_MS),
    );
  }
}

export async function generateTauriLocalGeneralReply(
  input: GenerateTauriLocalReplyInput,
): Promise<GenerateTauriLocalReplyResult | null> {
  if (!shouldAllowGeneralLocalReply(input.preferences, input.forceCloudOnly)) {
    return null;
  }

  const explainMissingLocalRuntime = shouldExplainMissingLocalRuntime(
    input.preferences,
    input.forceCloudOnly,
  );

  const userText = input.userText.trim();
  if (!userText || userText.length > MAX_USER_TEXT_CHARS) {
    return null;
  }

  const prompt = buildLocalReplyPrompt({
    recentMessages: input.recentMessages,
    userText,
  });
  const browserPrompt = buildBrowserLocalReplyPrompt({
    recentMessages: input.recentMessages,
    userText,
  });
  const fallbackPrompt = buildFallbackLocalReplyPrompt(userText);

  const localEnginePreference = readLocalAiLocalEnginePreference(input.scope);
  const allowExternalBackend = shouldAllowExternalLocalBackend(
    localEnginePreference,
  );
  const allowOnDeviceLocalEngine = shouldAllowOnDeviceLocalEngine(
    localEnginePreference,
  );
  const externalBackend = allowExternalBackend
    ? readConfiguredExternalLocalTextBackend(input.scope)
    : null;
  let externalBackendFailure: LocalTextRuntimeError | null = null;
  if (externalBackend) {
    try {
      const response = await executeExternalLocalTextCompletion({
        config: externalBackend,
        prompt,
        maxTokens: 512,
        temperature: 0.2,
        signal: input.abortSignal,
      });
      const text = response.text.trim();
      if (text) {
        await emitPseudoStreamingText({
          text,
          signal: input.abortSignal,
          onPartialText: input.onPartialText,
        });
        return {
          text,
          profileId: response.model,
          provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
          model: response.model,
        };
      }
    } catch (error) {
      if (isExternalLocalTextBackendAbortError(error)) {
        throw error;
      }
      externalBackendFailure = new LocalTextRuntimeError(
        "external_local_text_backend_failed",
        error instanceof Error
          ? error.message
          : "External local text backend failed.",
        externalBackend.model,
      );
    }
  }
  if (
    allowExternalBackend &&
    !externalBackend &&
    !allowOnDeviceLocalEngine
  ) {
    if (explainMissingLocalRuntime) {
      const reason =
        readConfiguredExternalLocalTextBackendReason(input.scope) ??
        "not_configured";
      throw new LocalTextRuntimeError(
        "external_local_text_backend_not_configured",
        `This device is set to use the Local AI URL backend, but no valid Local AI URL backend is configured (${reason}).`,
      );
    }
    return null;
  }

  if (input.platform === "tauri" && allowOnDeviceLocalEngine) {
    const status = await getTauriLocalSkillRuntimeStatus();
    if (
      !status.supportsGemma4Text ||
      (status.installedGemmaProfileIds?.length ?? 0) === 0
    ) {
      if (externalBackendFailure) {
        throw externalBackendFailure;
      }
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "tauri_local_text_runtime_not_installed",
          "No prepared desktop Gemma 4 text model is installed for this device.",
        );
      }
      return null;
    }

    const profileId = pickInstalledTauriProfileId({
      preferredProfileId: input.preferences.defaultModelId,
      installedProfileIds: status.installedGemmaProfileIds ?? [],
      catalog: input.catalog,
    });
    if (!profileId) {
      if (externalBackendFailure) {
        throw externalBackendFailure;
      }
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "tauri_local_text_runtime_not_installed",
          "No compatible desktop Gemma 4 text profile is ready on this device.",
        );
      }
      return null;
    }

    const response = await executeTauriLocalGemmaTextStream({
      profileId,
      prompt,
      onChunk: (partialText) => {
        input.onPartialText?.(partialText);
      },
      signal: input.abortSignal,
    });
    if (!response.success || !response.text.trim()) {
      throw new LocalTextRuntimeError(
        "tauri_local_text_runtime_failed",
        response.error ?? "Gemma 4 local text runtime failed on this device.",
        profileId,
      );
    }

    return {
      text: response.text.trim(),
      profileId: response.profileId,
      model: response.profileId,
    };
  }

  if (input.platform === "web" && allowOnDeviceLocalEngine) {
    if (!input.scope) {
      if (externalBackendFailure) {
        throw externalBackendFailure;
      }
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "browser_device_scope_unavailable",
          "This browser session could not resolve local device storage for Local AI.",
        );
      }
      return null;
    }
    const deviceState = readLocalAiDeviceState(input.scope);
    const profile = pickInstalledBrowserProfile({
      preferredProfileId: input.preferences.defaultModelId,
      installedProfileIds: deviceState.installedModelIds,
      eligibleProfileIds: input.capability?.eligibleProfiles ?? [],
      catalog: input.catalog,
    });
    if (!profile) {
      if (externalBackendFailure) {
        throw externalBackendFailure;
      }
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "browser_no_installed_model",
          deviceState.installedModelIds.length > 0
            ? "The prepared browser model is no longer compatible with the current Local AI catalog."
            : "No prepared browser Gemma 4 model is installed for this device.",
        );
      }
      return null;
    }

    let response = null;
    let lastRuntimeError: unknown = null;
    for (let attempt = 0; attempt <= BROWSER_LOCAL_REPLY_MAX_RETRIES; attempt += 1) {
      const promptForAttempt = attempt === 0 ? browserPrompt : fallbackPrompt;
      try {
        response = await generateTextWithBrowserLocalRuntime({
          profile,
          prompt: promptForAttempt,
          maxTokens:
            attempt === 0
              ? BROWSER_LOCAL_PRIMARY_MAX_TOKENS
              : BROWSER_LOCAL_FALLBACK_MAX_TOKENS,
          temperature: attempt === 0 ? 0.2 : 0.1,
          topK: attempt === 0 ? 32 : 24,
          disableExperimentalSubgroups:
            deviceState.preferStableBrowserRuntime !== false,
          avoidExplicitPowerPreference:
            deviceState.preferStableBrowserRuntime !== false,
          forceFreshWorker:
            deviceState.preferStableBrowserRuntime !== false,
          signal: input.abortSignal,
        });
        const normalizedText = normalizeLocalReplyText(response.text);
        if (normalizedText) {
          response = {
            ...response,
            text: normalizedText,
          };
          break;
        }
        response = null;
        lastRuntimeError = new Error("browser_local_text_runtime_empty_response");
        if (attempt >= BROWSER_LOCAL_REPLY_MAX_RETRIES) {
          break;
        }
        await disposeBrowserLocalRuntime().catch(() => undefined);
        await waitForBrowserLocalRetry(input.abortSignal);
      } catch (error) {
        lastRuntimeError = error;
        if (isBrowserLocalRuntimeAbortError(error)) {
          throw error;
        }
        if (isTauriLocalRuntimeAbortError(error)) {
          throw error;
        }
        const shouldRetryBrowserRuntime =
          isBrowserLocalRuntimeRetryableError(error) ||
          isBrowserLocalPromptTooLongError(error);
        if (
          attempt >= BROWSER_LOCAL_REPLY_MAX_RETRIES ||
          !shouldRetryBrowserRuntime
        ) {
          if (
            error instanceof Error &&
            error.message === "browser_model_not_cached" &&
            input.scope
          ) {
            const latestDeviceState = readLocalAiDeviceState(input.scope);
            writeLocalAiDeviceState(input.scope, {
              installedModelIds: latestDeviceState.installedModelIds.filter(
                (entryId) => entryId !== profile.id,
              ),
              lastCapabilityCheckAt: new Date().toISOString(),
            });
          }
          throw toFriendlyBrowserLocalRuntimeError(error, profile.id);
        }
        await disposeBrowserLocalRuntime().catch(() => undefined);
        await waitForBrowserLocalRetry(input.abortSignal);
      }
    }
    if (!response) {
      if (lastRuntimeError) {
        if (
          lastRuntimeError instanceof Error &&
          lastRuntimeError.message === "browser_local_text_runtime_empty_response"
        ) {
          throw new LocalTextRuntimeError(
            "browser_local_text_runtime_empty_response",
            "The browser local text runtime returned an empty response.",
            profile.id,
          );
        }
        throw new LocalTextRuntimeError(
          "browser_local_text_runtime_failed",
          lastRuntimeError instanceof Error
            ? lastRuntimeError.message
            : "Browser local text runtime failed on this device.",
          profile.id,
        );
      }
      if (externalBackendFailure) {
        throw externalBackendFailure;
      }
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "browser_local_text_runtime_unavailable",
          "Browser local text runtime is not available on this device.",
          profile.id,
        );
      }
      return null;
    }
    const text = response.text.trim();
    if (!text) {
      if (explainMissingLocalRuntime) {
        throw new LocalTextRuntimeError(
          "browser_local_text_runtime_empty_response",
          "The browser local text runtime returned an empty response.",
          profile.id,
        );
      }
      return null;
    }
    await emitPseudoStreamingText({
      text,
      signal: input.abortSignal,
      onPartialText: input.onPartialText,
      delayMs: 14,
    });
    return {
      text,
      profileId: response.profileId,
      model: response.profileId,
    };
  }

  if (externalBackendFailure) {
    throw externalBackendFailure;
  }

  if (externalBackendFailure) {
    throw externalBackendFailure;
  }

  return null;
}

export function shouldBlockCloudForLocalOnlyMode(
  mode: LocalAiExecutionMode,
  preferencesEnabled: boolean,
  forceCloudOnly: boolean,
): boolean {
  return preferencesEnabled && !forceCloudOnly && mode === "local_only";
}
