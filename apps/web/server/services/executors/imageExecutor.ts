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
  type ImageGenerationRequest,
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

      const userToken = (dp.userToken as string) || "";
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
const imageExecutor = new ImageGenerationExecutor();
registerExecutor(imageExecutor);
export { imageExecutor };
