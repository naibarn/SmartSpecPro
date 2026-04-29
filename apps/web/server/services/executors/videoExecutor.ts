import type {
  CapabilityExecutor,
  CapabilityFamily,
  ExecutorInput,
  ExecutorResult,
  RouteDecision,
} from "./types";
import { registerExecutor } from "./executorRegistry";
import { extractUserPrompt } from "./mediaExecutorHelpers";
import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { parsePromptResponse } from "../promptEnhancementService";
import {
  mediaGenerationService,
  DEFAULT_MODELS,
  normalizeMediaPrompt,
  type VideoGenerationRequest,
} from "../mediaGenerationService";

const AUTO_TEAM_RAW_CONTEXT_MARKERS = [
  "[OBJECTIVE]",
  "Auto-team execution context",
  "Run objective:",
  "Current work item:",
  "Plan step focus:",
];

function classifyVideoGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /(?:not configured|api key not configured|no api key|base url not configured|connection not configured|provider has no api key|KNPLabs not configured)/i.test(
      message,
    )
  ) {
    return "media_provider_not_configured";
  }
  if (/\b(?:401|403|unauthorized|forbidden|invalid api key|authentication failed)\b/i.test(message)) {
    return "media_provider_auth_failed";
  }
  return "media_generation_failed";
}

function shouldRefineAutoTeamVideoPrompt(input: ExecutorInput, prompt: string): boolean {
  if (input.channel !== "team_room") return false;
  const dp = input.dynamicParams || {};
  if (typeof dp.__autoTeamPromptSkillId === "string" && dp.__autoTeamPromptSkillId.trim()) {
    return false;
  }
  if (typeof dp.__autoTeamPromptChainFrom === "string" && dp.__autoTeamPromptChainFrom.trim()) {
    return false;
  }
  return AUTO_TEAM_RAW_CONTEXT_MARKERS.some((marker) => prompt.includes(marker));
}

function extractProviderReadyPrompt(content: string, fallback: string): string {
  const trimmed = content.trim();
  if (!trimmed) return fallback;

  const jsonCandidates = new Set<string>([trimmed]);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) jsonCandidates.add(fenced[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonCandidates.add(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      for (const key of ["prompt", "videoPrompt", "promptEn", "promptTh"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) {
          return normalizeMediaPrompt(value) || value.trim();
        }
      }
    } catch {
      // Try the next candidate, then text parsing below.
    }
  }

  const parsed = parsePromptResponse(trimmed);
  const prompt = parsed.promptEn.trim() || parsed.promptTh.trim() || trimmed;
  return normalizeMediaPrompt(prompt) || prompt;
}

async function refineAutoTeamVideoPromptIfNeeded(
  input: ExecutorInput,
  prompt: string,
): Promise<{ prompt: string; promptSkillId: string | null; modelId: string | null }> {
  if (!shouldRefineAutoTeamVideoPrompt(input, prompt)) {
    return { prompt, promptSkillId: null, modelId: null };
  }

  const result = await executeSkillLlmWithFallback({
    skillSlug: "video-prompt-engineer",
    userId: input.userId,
    executionPolicy: {
      modelId: null,
      allowFreeModels: true,
      modelSource: "system_default",
    },
    maxTokens: 1200,
    temperature: 0.4,
    messages: [
      {
        role: "user",
        content: [
          "Create a provider-ready video generation prompt for KIE/Veo from this auto-team context.",
          "Return only the final prompt text or JSON with a prompt field.",
          "Do not include internal labels such as [OBJECTIVE], Run objective, Current work item, or Plan step focus.",
          "Preserve the user's requested language, factual goal, duration, and visual continuity.",
          "",
          prompt.slice(0, 8000),
        ].join("\n"),
      },
    ],
  });

  if (!result.success || !result.content?.trim()) {
    return { prompt, promptSkillId: "video-prompt-engineer", modelId: result.modelId ?? null };
  }

  return {
    prompt: extractProviderReadyPrompt(result.content, prompt),
    promptSkillId: "video-prompt-engineer",
    modelId: result.modelId ?? null,
  };
}

export class VideoGenerationExecutor implements CapabilityExecutor {
  readonly id = "video-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.video"];

  canHandle(route: RouteDecision): boolean {
    return route.capability === "media.video";
  }

  async execute(input: ExecutorInput): Promise<ExecutorResult> {
    const startMs = Date.now();
    try {
      const dp = input.dynamicParams || {};

      const promptInput =
        (dp.prompt as string) || extractUserPrompt(input.messages) || "";
      const refinedPrompt = await refineAutoTeamVideoPromptIfNeeded(input, promptInput);
      const model =
        (dp.model as string) || DEFAULT_MODELS.video || undefined;

      const request: VideoGenerationRequest = {
        prompt: refinedPrompt.prompt,
        model,
        duration: dp.duration as number | undefined,
        aspectRatio: dp.aspectRatio as string | undefined,
        fps: dp.fps as number | undefined,
        resolution: dp.resolution as string | undefined,
        referenceImageUrls: dp.referenceImageUrls as string[] | undefined,
        referenceVideoUrl: dp.referenceVideoUrl as string | undefined,
        apiConfig: dp.apiConfig as Record<string, string> | undefined,
        extraParams: dp.extraParams as Record<string, any> | undefined,
        publicUrl: dp.publicUrl as string | undefined,
        auditContext: input.traceId
          ? { traceId: input.traceId, source: "unified-orchestrator", stage: "video-executor" }
          : undefined,
      };

      const userToken = (dp.__serverUserToken as string) || "";
      if (!userToken) {
        console.warn("[videoExecutor] No server token available — media API call may fail");
      }
      const task = await mediaGenerationService.generateVideoAsync(
        request,
        userToken,
      );

      return {
        success: true,
        mediaJob: {
          mediaType: "video",
          jobPayload: task,
        },
        modelUsed: task.model,
        inputTokens: 0,
        outputTokens: 0,
        attempts: [],
        totalDurationMs: Date.now() - startMs,
        metadata: refinedPrompt.promptSkillId
          ? {
              promptSkillId: refinedPrompt.promptSkillId,
              promptSkillModelId: refinedPrompt.modelId,
              providerReadyPromptApplied: true,
            }
          : undefined,
      };
    } catch (err: any) {
      console.error("[videoExecutor] dispatch failed:", err);
      return {
        success: false,
        error: classifyVideoGenerationError(err),
        inputTokens: 0,
        outputTokens: 0,
        attempts: [],
        totalDurationMs: Date.now() - startMs,
      };
    }
  }
}

// Self-register
const videoExecutor = new VideoGenerationExecutor();
registerExecutor(videoExecutor);
export { videoExecutor };
