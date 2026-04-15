import type {
  LocalSkillExecutionEnvelope,
  LocalSkillOutputContract,
  LocalSkillRuntimeKind,
  LocalSkillStagedFileDescriptor,
  ResolvedLocalSkillPolicy,
} from "../types/capability";

export interface TauriLocalSkillExecutionResult {
  success: boolean;
  skillId: string;
  type: "image" | "video" | "audio" | "text" | "action" | "sandbox-job";
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  jobId?: string;
  isAsync?: boolean;
}

export interface TauriLocalSkillRuntimeStatus {
  available: boolean;
  supportsScriptBundle: boolean;
  supportsGemma4Text: boolean;
  supportsGemma4Image: boolean;
  supportsGemma4Voice: boolean;
  nodePath: string | null;
  litertLmPath?: string | null;
  runtimeRoot: string | null;
  managedModelRoot?: string | null;
  bundleMode?: string | null;
  gemmaProfileIds?: string[];
  bundledGemmaProfileIds?: string[];
  installedGemmaProfileIds?: string[];
  reason: string | null;
}

export interface TauriLocalGemmaModelStatus {
  profileId: string;
  installed: boolean;
  managed: boolean;
  bundled?: boolean;
  sourceKind?: "managed" | "bundled" | "external" | null;
  modelPath?: string | null;
  sourceRepo?: string | null;
  fileName?: string | null;
  checksumSha256?: string | null;
  verified?: boolean;
  verificationError?: string | null;
  needsRepair?: boolean;
  updateAvailable?: boolean;
  error?: string | null;
}

export interface ExecuteTauriLocalSkillInput {
  skillId: string;
  skillFilePath: string;
  policy: ResolvedLocalSkillPolicy;
  prompt?: string;
  dynamicParams?: Record<string, unknown>;
  conversationId?: number;
  origin?:
    | "chat"
    | "team_room"
    | "team_run"
    | "agency"
    | "public_api"
    | "scheduler"
    | "workflow_background"
    | "channel_bridge";
}

export interface ExecuteTauriLocalGemmaTextInput {
  profileId: string;
  prompt: string;
}

export interface ExecuteTauriLocalGemmaTextStreamInput
  extends ExecuteTauriLocalGemmaTextInput {
  onChunk?: (partialText: string, chunk: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  allowNonStreamingFallback?: boolean;
}

export interface TauriLocalGemmaTextResult {
  success: boolean;
  profileId: string;
  text: string;
  error?: string;
}

export interface ExecuteTauriLocalGemmaVoiceInput {
  profileId: string;
  audioBase64: string;
  mimeType: string;
}

export interface TauriLocalGemmaVoiceResult {
  success: boolean;
  profileId: string;
  text: string;
  error?: string;
}

export interface ExecuteTauriLocalGemmaImageInput {
  profileId: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
}

export interface TauriLocalGemmaImageResult {
  success: boolean;
  profileId: string;
  text: string;
  error?: string;
}

interface TauriLocalGemmaTextChunkEvent {
  requestId: string;
  profileId: string;
  chunk: string;
  accumulatedText: string;
}

interface TauriLocalGemmaTextCompleteEvent {
  requestId: string;
  profileId: string;
  success: boolean;
  text: string;
  error?: string;
}

export interface ExecuteTauriLocalHttpBackendChatInput {
  requestUrl: string;
  apiKey?: string | null;
  model: string;
  requestTimeoutMs: number;
  messages: unknown[];
  maxTokens?: number;
  temperature?: number;
}

export interface TauriLocalHttpBackendChatResult {
  success: boolean;
  model?: string | null;
  text?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  httpStatus?: number | null;
}

export const TAURI_LOCAL_RUNTIME_ABORTED_ERROR = "local_llm_stream_aborted";

export function isTauriLocalRuntimeAbortError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === TAURI_LOCAL_RUNTIME_ABORTED_ERROR
  );
}

function splitPseudoStreamingText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const sentencePieces = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (sentencePieces.length > 1) {
    return sentencePieces;
  }

  const wordPieces = trimmed.split(/\s+/).filter(Boolean);
  if (wordPieces.length <= 1) {
    return [trimmed];
  }

  const chunkSize = Math.max(4, Math.ceil(wordPieces.length / 12));
  const chunks: string[] = [];
  for (let index = 0; index < wordPieces.length; index += chunkSize) {
    chunks.push(wordPieces.slice(index, index + chunkSize).join(" "));
  }
  return chunks;
}

async function emitPseudoStreamingText(input: {
  text: string;
  onChunk?: (partialText: string, chunk: string) => void;
}): Promise<void> {
  if (!input.onChunk) {
    return;
  }
  const chunks = splitPseudoStreamingText(input.text);
  if (chunks.length <= 1) {
    input.onChunk(input.text, input.text);
    return;
  }

  let accumulated = "";
  for (const chunk of chunks) {
    accumulated = accumulated ? `${accumulated} ${chunk}` : chunk;
    input.onChunk(accumulated, chunk);
    await new Promise((resolve) => window.setTimeout(resolve, 18));
  }
}

export function canAttemptTauriLocalSkill(
  policy: ResolvedLocalSkillPolicy,
): boolean {
  return (
    policy.eligible === true &&
    policy.requiresTauri === true &&
    policy.tier === "local_safe" &&
    policy.runtimeKind !== "none"
  );
}

export function buildTauriLocalSkillExecutionEnvelope(input: {
  skillId: string;
  localExecutionId: string;
  runtimeKind: Exclude<LocalSkillRuntimeKind, "none">;
  params?: Record<string, unknown>;
  stagedInputs?: LocalSkillStagedFileDescriptor[];
  outputContract?: LocalSkillOutputContract | null;
  metadata?: Record<string, unknown>;
  userToken?: string;
  providerApiKeys?: string[];
  refreshToken?: string;
  sessionToken?: string;
}): LocalSkillExecutionEnvelope {
  return {
    skillId: input.skillId,
    localExecutionId: input.localExecutionId,
    runtimeKind: input.runtimeKind,
    params: { ...(input.params ?? {}) },
    stagedInputs: [...(input.stagedInputs ?? [])],
    outputContract: input.outputContract ?? null,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, payload);
}

export async function executeTauriLocalHttpBackendChatCompletion(
  input: ExecuteTauriLocalHttpBackendChatInput,
): Promise<TauriLocalHttpBackendChatResult> {
  if (!isTauriDesktopRuntime()) {
    return {
      success: false,
      errorCode: "not_tauri",
      errorDetail: "The local HTTP backend bridge is only available in Tauri.",
    };
  }

  return invokeTauri<TauriLocalHttpBackendChatResult>(
    "local_http_backend_chat_completion",
    {
      request: {
        requestUrl: input.requestUrl,
        apiKey: input.apiKey ?? null,
        model: input.model,
        requestTimeoutMs: input.requestTimeoutMs,
        messages: input.messages,
        maxTokens: input.maxTokens ?? 512,
        temperature: input.temperature ?? 0.2,
      },
    },
  );
}

export async function getTauriLocalSkillRuntimeStatus(): Promise<TauriLocalSkillRuntimeStatus> {
  if (!isTauriDesktopRuntime()) {
    return {
      available: false,
      supportsScriptBundle: false,
      supportsGemma4Text: false,
      supportsGemma4Image: false,
      supportsGemma4Voice: false,
      nodePath: null,
      litertLmPath: null,
      runtimeRoot: null,
      managedModelRoot: null,
      bundleMode: null,
      gemmaProfileIds: [],
      bundledGemmaProfileIds: [],
      installedGemmaProfileIds: [],
      reason: "not_tauri",
    };
  }

  try {
    return await invokeTauri<TauriLocalSkillRuntimeStatus>(
      "local_skill_get_runtime_status",
    );
  } catch (error) {
    return {
      available: false,
      supportsScriptBundle: false,
      supportsGemma4Text: false,
      supportsGemma4Image: false,
      supportsGemma4Voice: false,
      nodePath: null,
      litertLmPath: null,
      runtimeRoot: null,
      managedModelRoot: null,
      bundleMode: null,
      gemmaProfileIds: [],
      bundledGemmaProfileIds: [],
      installedGemmaProfileIds: [],
      reason: error instanceof Error ? error.message : "invoke_failed",
    };
  }
}

export async function prepareTauriLocalGemmaModel(
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  if (!isTauriDesktopRuntime()) {
    return {
      profileId,
      installed: false,
      managed: false,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      error: "not_tauri",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaModelStatus>(
      "local_llm_prepare_model",
      {
        request: {
          profileId,
        },
      },
    );
  } catch (error) {
    return {
      profileId,
      installed: false,
      managed: false,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      error: error instanceof Error ? error.message : "local_llm_prepare_failed",
    };
  }
}

export async function removeTauriLocalGemmaModel(
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  if (!isTauriDesktopRuntime()) {
    return {
      profileId,
      installed: false,
      managed: false,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      error: "not_tauri",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaModelStatus>(
      "local_llm_remove_model",
      {
        request: {
          profileId,
        },
      },
    );
  } catch (error) {
    return {
      profileId,
      installed: false,
      managed: false,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      error: error instanceof Error ? error.message : "local_llm_remove_failed",
    };
  }
}

async function invokeTauriModelLifecycleCommand(
  command: "local_llm_verify_model" | "local_llm_update_model" | "local_llm_repair_model",
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  if (!isTauriDesktopRuntime()) {
    return {
      profileId,
      installed: false,
      managed: false,
      bundled: false,
      sourceKind: null,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      checksumSha256: null,
      verified: false,
      verificationError: null,
      needsRepair: false,
      updateAvailable: false,
      error: "not_tauri",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaModelStatus>(command, {
      request: {
        profileId,
      },
    });
  } catch (error) {
    return {
      profileId,
      installed: false,
      managed: false,
      bundled: false,
      sourceKind: null,
      modelPath: null,
      sourceRepo: null,
      fileName: null,
      checksumSha256: null,
      verified: false,
      verificationError: null,
      needsRepair: false,
      updateAvailable: false,
      error:
        error instanceof Error
          ? error.message
          : `${command}_failed`,
    };
  }
}

export async function verifyTauriLocalGemmaModel(
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  return invokeTauriModelLifecycleCommand("local_llm_verify_model", profileId);
}

export async function updateTauriLocalGemmaModel(
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  return invokeTauriModelLifecycleCommand("local_llm_update_model", profileId);
}

export async function repairTauriLocalGemmaModel(
  profileId: string,
): Promise<TauriLocalGemmaModelStatus> {
  return invokeTauriModelLifecycleCommand("local_llm_repair_model", profileId);
}

export async function executeTauriLocalGemmaText(
  input: ExecuteTauriLocalGemmaTextInput,
): Promise<TauriLocalGemmaTextResult> {
  const status = await getTauriLocalSkillRuntimeStatus();
  if (!status.supportsGemma4Text) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        status.reason === "local_runtime_disabled"
          ? "Gemma 4 local text runtime is disabled in this Tauri build."
          : "Gemma 4 local text runtime is not available on this device.",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaTextResult>("local_llm_generate", {
      request: {
        profileId: input.profileId,
        prompt: input.prompt,
      },
    });
  } catch (error) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error: error instanceof Error ? error.message : "local_llm_invoke_failed",
    };
  }
}

export async function executeTauriLocalGemmaVoiceTranscription(
  input: ExecuteTauriLocalGemmaVoiceInput,
): Promise<TauriLocalGemmaVoiceResult> {
  const status = await getTauriLocalSkillRuntimeStatus();
  if (!status.supportsGemma4Voice) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        status.reason === "local_runtime_disabled"
          ? "Gemma 4 local voice transcription is disabled in this Tauri build."
          : "Gemma 4 local voice transcription is not available on this device.",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaVoiceResult>(
      "local_llm_transcribe_audio",
      {
        request: {
          profileId: input.profileId,
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
        },
      },
    );
  } catch (error) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        error instanceof Error ? error.message : "local_llm_transcription_invoke_failed",
    };
  }
}

export async function executeTauriLocalGemmaImageAnalysis(
  input: ExecuteTauriLocalGemmaImageInput,
): Promise<TauriLocalGemmaImageResult> {
  const status = await getTauriLocalSkillRuntimeStatus();
  if (!status.supportsGemma4Image) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        status.reason === "local_runtime_disabled"
          ? "Gemma 4 local image analysis is disabled in this Tauri build."
          : "Gemma 4 local image analysis is not available on this device.",
    };
  }

  try {
    return await invokeTauri<TauriLocalGemmaImageResult>(
      "local_llm_analyze_image",
      {
        request: {
          profileId: input.profileId,
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          prompt: input.prompt,
        },
      },
    );
  } catch (error) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        error instanceof Error ? error.message : "local_llm_image_invoke_failed",
    };
  }
}

export async function executeTauriLocalGemmaTextStream(
  input: ExecuteTauriLocalGemmaTextStreamInput,
): Promise<TauriLocalGemmaTextResult> {
  const status = await getTauriLocalSkillRuntimeStatus();
  if (!status.supportsGemma4Text) {
    return {
      success: false,
      profileId: input.profileId,
      text: "",
      error:
        status.reason === "local_runtime_disabled"
          ? "Gemma 4 local text runtime is disabled in this Tauri build."
          : "Gemma 4 local text runtime is not available on this device.",
    };
  }

  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (input.signal?.aborted) {
    throw new Error(TAURI_LOCAL_RUNTIME_ABORTED_ERROR);
  }

  let chunkUnlisten: (() => void) | null = null;
  let completeUnlisten: (() => void) | null = null;
  let streamTimeout: ReturnType<typeof setTimeout> | null = null;
  let receivedChunkCount = 0;
  let abortRequested = false;
  let resolveCompletion: ((value: TauriLocalGemmaTextResult) => void) | null =
    null;

  const cleanup = () => {
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }
    if (chunkUnlisten) {
      chunkUnlisten();
      chunkUnlisten = null;
    }
    if (completeUnlisten) {
      completeUnlisten();
      completeUnlisten = null;
    }
    input.signal?.removeEventListener("abort", handleAbort);
  };
  const handleAbort = () => {
    abortRequested = true;
    void invokeTauri<boolean>("local_llm_cancel_stream", {
      request: {
        requestId,
      },
    }).catch(() => false);
  };
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const completionPromise = new Promise<TauriLocalGemmaTextResult>(
      (resolve) => {
        resolveCompletion = resolve;
      },
    );

    chunkUnlisten = await listen<TauriLocalGemmaTextChunkEvent>(
      "local-llm-chunk",
      (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId) {
          return;
        }
        receivedChunkCount += 1;
        input.onChunk?.(payload.accumulatedText, payload.chunk);
      },
    );

    completeUnlisten = await listen<TauriLocalGemmaTextCompleteEvent>(
      "local-llm-complete",
      (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId || !resolveCompletion) {
          return;
        }
        cleanup();
        const complete = async () => {
          const finalText = payload.text ?? "";
          if (abortRequested) {
            resolveCompletion?.({
              success: false,
              profileId: payload.profileId,
              text: "",
              error: TAURI_LOCAL_RUNTIME_ABORTED_ERROR,
            });
            return;
          }
          if (
            payload.success &&
            finalText.trim().length > 0 &&
            receivedChunkCount <= 1
          ) {
            await emitPseudoStreamingText({
              text: finalText,
              onChunk: input.onChunk,
            });
          }
          resolveCompletion?.({
            success: payload.success,
            profileId: payload.profileId,
            text: finalText,
            error: payload.error,
          });
        };
        void complete();
      },
    );

    streamTimeout = setTimeout(() => {
      if (!resolveCompletion) {
        return;
      }
      void invokeTauri<boolean>("local_llm_cancel_stream", {
        request: {
          requestId,
        },
      }).catch(() => false);
      cleanup();
      resolveCompletion({
        success: false,
        profileId: input.profileId,
        text: "",
        error: abortRequested
          ? TAURI_LOCAL_RUNTIME_ABORTED_ERROR
          : "local_llm_stream_timeout",
      });
    }, input.timeoutMs ?? 180_000);

    input.signal?.addEventListener("abort", handleAbort, { once: true });
    if (abortRequested) {
      throw new Error(TAURI_LOCAL_RUNTIME_ABORTED_ERROR);
    }

    await invokeTauri<void>("local_llm_generate_stream", {
      request: {
        requestId,
        profileId: input.profileId,
        prompt: input.prompt,
      },
    });
    const result = await completionPromise;
    if (result.error === TAURI_LOCAL_RUNTIME_ABORTED_ERROR) {
      throw new Error(TAURI_LOCAL_RUNTIME_ABORTED_ERROR);
    }
    return result;
  } catch (error) {
    cleanup();
    if (abortRequested) {
      throw new Error(TAURI_LOCAL_RUNTIME_ABORTED_ERROR);
    }
    if (input.allowNonStreamingFallback === false) {
      return {
        success: false,
        profileId: input.profileId,
        text: "",
        error:
          error instanceof Error ? error.message : "local_llm_stream_invoke_failed",
      };
    }
    return executeTauriLocalGemmaText(input);
  }
}

export function buildGemma4LocalSkillPrompt(input: {
  skillId: string;
  skillName?: string | null;
  skillDescription?: string | null;
  prompt?: string;
  dynamicParams?: Record<string, unknown>;
}): string {
  const sections = [
    "You are SmartAIHub executing a reviewed local-safe skill with Gemma 4.",
    `Skill ID: ${input.skillId}`,
  ];

  if (input.skillName?.trim()) {
    sections.push(`Skill name: ${input.skillName.trim()}`);
  }
  if (input.skillDescription?.trim()) {
    sections.push(`Skill description: ${input.skillDescription.trim()}`);
  }
  if (input.prompt?.trim()) {
    sections.push(`User prompt:\n${input.prompt.trim()}`);
  }
  if (input.dynamicParams && Object.keys(input.dynamicParams).length > 0) {
    sections.push(
      `Structured parameters:\n${JSON.stringify(input.dynamicParams, null, 2)}`,
    );
  }
  sections.push(
    "Return the final user-facing result only. Prefer concise, high-signal text unless the parameters explicitly require structured JSON.",
  );

  return sections.join("\n\n");
}

export async function executeTauriLocalSkill(
  input: ExecuteTauriLocalSkillInput,
): Promise<TauriLocalSkillExecutionResult> {
  if (!input.policy.localScriptManifest) {
    return {
      success: false,
      skillId: input.skillId,
      type: "text",
      error: "Reviewed local script manifest is missing for this skill.",
    };
  }

  const status = await getTauriLocalSkillRuntimeStatus();
  if (!status.supportsScriptBundle) {
    return {
      success: false,
      skillId: input.skillId,
      type: "text",
      error:
        status.reason === "unsafe_local_script_runtime_disabled" ||
        status.reason === "local_runtime_disabled"
          ? "Tauri local script execution is disabled in this build."
          : "Tauri local script execution is not available on this device.",
    };
  }

  const envelope = buildTauriLocalSkillExecutionEnvelope({
    skillId: input.skillId,
    localExecutionId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    runtimeKind: "script_bundle",
    params: {
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.dynamicParams ?? {}),
    },
    outputContract: {
      allowedKinds:
        input.policy.localScriptManifest.supportedOutputKinds ?? ["text", "json"],
      outputRootIds: input.policy.localScriptManifest.outputRoots,
    } satisfies LocalSkillOutputContract,
    metadata: {
      conversationId: input.conversationId ?? null,
      origin: input.origin ?? "chat",
    },
  });

  return invokeTauri<TauriLocalSkillExecutionResult>("local_skill_execute", {
    request: {
      skillId: input.skillId,
      skillFilePath: input.skillFilePath,
      reviewedEntry: input.policy.localScriptManifest.reviewedEntry,
      artifactDigestSha256: input.policy.localScriptManifest.artifactDigestSha256,
      permissionProfile: input.policy.localScriptManifest.permissionProfile,
      envelope,
    },
  });
}
