import type {
  CapabilityExecutor,
  CapabilityFamily,
  ExecutorInput,
  ExecutorResult,
  RouteDecision,
} from "./types";
import { registerExecutor } from "./executorRegistry";
import {
  mediaGenerationService,
  DEFAULT_MODELS,
  type VideoGenerationRequest,
} from "../mediaGenerationService";

function extractUserPrompt(messages: ExecutorInput["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const content = messages[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textPart = content.find(
          (p: any) => p.type === "text" && typeof p.text === "string",
        );
        return (textPart as any)?.text || "";
      }
    }
  }
  return "";
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

      const userToken = (dp.userToken as string) || "";
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
      return {
        success: false,
        error: err?.message || String(err),
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
