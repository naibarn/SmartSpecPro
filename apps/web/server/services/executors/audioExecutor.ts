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
  type AudioGenerationRequest,
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
        auditContext: input.traceId
          ? { traceId: input.traceId, source: "unified-orchestrator", stage: "audio-executor" }
          : undefined,
      };

      const userToken = (dp.userToken as string) || "";
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
const audioExecutor = new AudioGenerationExecutor();
registerExecutor(audioExecutor);
export { audioExecutor };
