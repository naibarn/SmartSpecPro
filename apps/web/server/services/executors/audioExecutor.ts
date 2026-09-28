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
  type AudioGenerationRequest,
} from "../mediaGenerationService";

export class AudioGenerationExecutor implements CapabilityExecutor {
  readonly id = "audio-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.audio"];

  canHandle(route: RouteDecision): boolean {
    return route.capability === "media.audio";
  }

  async execute(input: ExecutorInput): Promise<ExecutorResult> {
    const startMs = Date.now();
    try {
      const dp = input.dynamicParams || {};

      // Audio prefers dynamicParams.text over user message
      const text =
        (dp.text as string) || extractUserPrompt(input.messages) || "";
      const model =
        (dp.model as string) || DEFAULT_MODELS.audio || undefined;

      const request: AudioGenerationRequest = {
        text,
        model: model as any,
        voice: dp.voice as string | undefined,
        speed: dp.speed as number | undefined,
        apiConfig: dp.apiConfig as Record<string, string> | undefined,
        extraParams: dp.extraParams as Record<string, any> | undefined,
        publicUrl: dp.publicUrl as string | undefined,
        auditContext: {
          userId: input.userId,
          tenantId: input.tenantId,
          ...(input.traceId ? { traceId: input.traceId } : {}),
          source: "unified-orchestrator",
          stage: "audio-executor",
        },
      };

      const userToken = (dp.__serverUserToken as string) || "";
      if (!userToken) {
        console.warn("[audioExecutor] No server token available — media API call may fail");
      }
      const task = await mediaGenerationService.generateAudioAsync(
        request,
        userToken,
      );

      return {
        success: true,
        mediaJob: {
          mediaType: "audio",
          jobPayload: task,
        },
        modelUsed: task.model,
        inputTokens: 0,
        outputTokens: 0,
        attempts: [],
        totalDurationMs: Date.now() - startMs,
      };
    } catch (err: any) {
      console.error("[audioExecutor] dispatch failed:", err);
      return {
        success: false,
        error: "media_generation_failed",
        inputTokens: 0,
        outputTokens: 0,
        attempts: [],
        totalDurationMs: Date.now() - startMs,
      };
    }
  }
}

// Self-register
const audioExecutor = new AudioGenerationExecutor();
registerExecutor(audioExecutor);
export { audioExecutor };
