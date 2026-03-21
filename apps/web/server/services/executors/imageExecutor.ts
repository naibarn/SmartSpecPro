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
  type ImageGenerationRequest,
} from "../mediaGenerationService";

export class ImageGenerationExecutor implements CapabilityExecutor {
  readonly id = "image-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.image"];

  canHandle(route: RouteDecision): boolean {
    return route.capability === "media.image";
  }

  async execute(input: ExecutorInput): Promise<ExecutorResult> {
    const startMs = Date.now();
    try {
      const dp = input.dynamicParams || {};
      const ep = input.executionPolicy || {};

      const prompt = extractUserPrompt(input.messages) || (dp.prompt as string) || "";
      const model = (dp.model as string) || (ep.defaultModel as string) || undefined;

      const request: ImageGenerationRequest = {
        prompt,
        model,
        aspectRatio: dp.aspectRatio as string | undefined,
        numImages: dp.numImages as number | undefined,
        resolution: dp.resolution as string | undefined,
        referenceImageUrls: dp.referenceImageUrls as string[] | undefined,
        referenceStyleUrl: dp.referenceStyleUrl as string | undefined,
        apiConfig: dp.apiConfig as Record<string, string> | undefined,
        extraParams: dp.extraParams as Record<string, any> | undefined,
        publicUrl: dp.publicUrl as string | undefined,
        auditContext: input.traceId
          ? { traceId: input.traceId, source: "unified-orchestrator", stage: "image-executor" }
          : undefined,
      };

      // U01: Use server-generated token, never client-supplied
      const userToken = (dp.__serverUserToken as string) || "";
      if (!userToken) {
        console.warn("[imageExecutor] No server token available — media API call may fail");
      }
      const response = await mediaGenerationService.generateImage(request, userToken);

      return {
        success: response.success,
        mediaJob: {
          mediaType: "image",
          jobPayload: {
            data: response.data,
            model: response.model,
            creditsUsed: response.creditsUsed,
          },
        },
        modelUsed: response.model,
        inputTokens: 0,
        outputTokens: 0,
        attempts: [],
        totalDurationMs: Date.now() - startMs,
      };
    } catch (err: any) {
      console.error("[imageExecutor] dispatch failed:", err);
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
const imageExecutor = new ImageGenerationExecutor();
registerExecutor(imageExecutor);
export { imageExecutor };
