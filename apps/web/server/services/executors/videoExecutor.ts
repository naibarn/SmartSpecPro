import type {
  CapabilityExecutor,
  CapabilityFamily,
  ExecutorInput,
  ExecutorResult,
  RouteDecision,
} from "./types";
import { registerExecutor } from "./executorRegistry";
import { extractUserPrompt } from "./mediaExecutorHelpers";
import {
  mediaGenerationService,
  DEFAULT_MODELS,
  type VideoGenerationRequest,
} from "../mediaGenerationService";

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

      const prompt =
        (dp.prompt as string) || extractUserPrompt(input.messages) || "";
      const model =
        (dp.model as string) || DEFAULT_MODELS.video || undefined;

      const request: VideoGenerationRequest = {
        prompt,
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
