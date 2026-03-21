import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { registerExecutor } from "./executorRegistry";
import type {
  CapabilityExecutor,
  CapabilityFamily,
  ExecutorInput,
  ExecutorResult,
  RouteDecision,
} from "./types";

const HANDLED_CAPABILITIES: readonly CapabilityFamily[] = [
  "writing.article",
  "writing.review",
];

export function parseNextSpeakerHint(
  content: string,
): { cleaned: string; hint?: string } {
  const match = content.match(/\[NEXT:\s*([^\]]+)\]/i);
  if (match) {
    return {
      cleaned: content.replace(match[0], "").trimEnd(),
      hint: match[1].trim(),
    };
  }
  return { cleaned: content };
}

export class TextSkillExecutor implements CapabilityExecutor {
  readonly id = "text-skill-executor";
  readonly capabilities = HANDLED_CAPABILITIES;

  canHandle(route: RouteDecision): boolean {
    return (
      route.capability === "writing.article" ||
      route.capability === "writing.review"
    );
  }

  async execute(input: ExecutorInput): Promise<ExecutorResult> {
    // Model selection: dynamic override takes priority
    const policy = input.dynamicModelOverride
      ? { ...input.executionPolicy, modelId: input.dynamicModelOverride }
      : input.executionPolicy;

    const llmResult = await executeSkillLlmWithFallback({
      messages: input.messages,
      skillSlug: input.skillSlug,
      userId: input.userId,
      executionPolicy: policy as any,
      extraBodyParams: input.extraBodyParams,
      enableThinking: input.enableThinking,
      stream: input.stream,
    });

    if (!llmResult.success) {
      return {
        success: false,
        error: llmResult.error,
        inputTokens: llmResult.inputTokens ?? 0,
        outputTokens: llmResult.outputTokens ?? 0,
        attempts: llmResult.attempts,
        totalDurationMs: llmResult.totalDurationMs,
      };
    }

    // Parse next-speaker hint from content
    const rawContent = llmResult.content ?? "";
    const { cleaned, hint } = parseNextSpeakerHint(rawContent);

    return {
      success: true,
      content: cleaned,
      modelUsed: llmResult.modelId,
      inputTokens: llmResult.inputTokens ?? 0,
      outputTokens: llmResult.outputTokens ?? 0,
      attempts: llmResult.attempts,
      totalDurationMs: llmResult.totalDurationMs,
      nextSpeakerHint: hint,
    };
  }
}

// Self-register
const textSkillExecutor = new TextSkillExecutor();
registerExecutor(textSkillExecutor);

export { textSkillExecutor };
