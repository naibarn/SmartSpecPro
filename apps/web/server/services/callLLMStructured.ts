import { z } from "zod";
import type { Message } from "../_core/llm";
import { executeWithFallback, resolveProviders } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { auditLogger } from "./auditLogger";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";

// ── Types ────────────────────────────────────────────────────

export interface CallLLMStructuredParams<T> {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  zodSchema: z.ZodType<T>;
  maxRetries?: number; // default 1
  userId: number;
  tenantId: string;
  billingDescription?: string;
  billingMetadata?: Record<string, unknown>;
}

export interface CallLLMStructuredResult<T> {
  data: T;
  tokensUsed: number;
  creditsUsed: number;
}

// ── Error class ──────────────────────────────────────────────

export class LLMStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly zodErrors?: z.ZodError,
    public readonly tokensUsed?: number,
    public readonly creditsUsed?: number,
  ) {
    super(message);
    this.name = "LLMStructuredOutputError";
  }
}

// ── Helpers ──────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1].trim() : text.trim();
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ── Main function ────────────────────────────────────────────

export async function callLLMStructured<T>(
  params: CallLLMStructuredParams<T>,
): Promise<CallLLMStructuredResult<T>> {
  const {
    systemPrompt,
    userMessage,
    model = DEFAULT_MODEL,
    preferredProviderId,
    strictProviderPin,
    zodSchema,
    maxRetries = 1,
    userId,
    tenantId,
    billingDescription,
    billingMetadata,
  } = params;

  const augmentedSystemPrompt = `${systemPrompt}

You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanatory text, no trailing commas.
The JSON must strictly conform to the expected schema.`;

  let totalTokens = 0;
  let totalCredits = 0;
  let lastRawResponse = "";
  let lastZodError: z.ZodError | undefined;

  if (strictProviderPin && preferredProviderId) {
    const candidates = await resolveProviders(model).catch(() => []);
    const providerMatched = candidates.some((c) => c.providerId === preferredProviderId);
    if (!providerMatched) {
      throw new Error(`No providers available for model: ${model} with preferred provider ${preferredProviderId}`);
    }
  }

  // Wire task planner ONCE before the retry loop
  const plannerResult = await runPlanner({
    sourceType: "skill",
    userId,
    tenantId,
    conversationModel: model,
    skillSlug: (billingMetadata?.skillSlug as string) ?? undefined,
  });

  let effectiveModel = model;
  if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
    effectiveModel = plannerResult.resolvedModel;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0;

    const messages: Message[] = [
      { role: "system", content: augmentedSystemPrompt },
      {
        role: "user",
        content: isRetry
          ? `${userMessage}\n\nYour previous response was invalid JSON or did not match the expected schema. The error was: ${lastZodError ? lastZodError.message : "Invalid JSON syntax"}. Raw response (truncated): "${lastRawResponse.slice(0, 500)}". Please try again and return ONLY valid JSON.`
          : userMessage,
      },
    ];

    const result = await executeWithFallback({
      model: effectiveModel,
      messages,
      stream: false,
      userId,
      preferredProvider: strictProviderPin
        ? preferredProviderId
        : undefined,
    });

    if (result.type === "error") {
      throw new Error(result.error);
    }

    if (result.type === "fallback_required") {
      throw new Error(
        "LLM provider requires fallback consent, which is not supported in structured output mode",
      );
    }

    // Extract content and usage
    const content = result.response.choices[0]?.message?.content ?? "";
    const usage = result.response.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const costUsd = usage.cost ?? undefined;
    totalTokens += inputTokens + outputTokens;

    // Deduct credits for this attempt
    const { creditsUsed } = await deductCreditsForModel({
      userId,
      model,
      provider: result.providerName,
      inputTokens,
      outputTokens,
      costUsd,
      tenantId,
      description: billingDescription,
      metadata: {
        requestType: "structured_llm",
        structured: true,
        attempt: attempt + 1,
        ...(billingMetadata ?? {}),
      },
      sourceType: "skill",
    });
    totalCredits += creditsUsed;

    // Record step attempt for each retry (per-attempt tracking)
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: effectiveModel,
        provider: result.providerName,
        inputTokens,
        outputTokens,
        costUsd: costUsd?.toString(),
        snapshot: plannerResult.snapshot,
        creditsUsed,
      }).catch(() => {});
    }

    lastRawResponse = content;

    // Strip markdown fences and attempt JSON parse
    const cleaned = stripMarkdownFences(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // JSON parse failed — retry if we have attempts left
      lastZodError = undefined;
      if (attempt < maxRetries) continue;
      throw new LLMStructuredOutputError(
        `LLM returned invalid JSON after ${attempt + 1} attempt(s)`,
        content,
        undefined,
        totalTokens,
        totalCredits,
      );
    }

    // Validate against Zod schema
    const validation = zodSchema.safeParse(parsed);
    if (!validation.success) {
      lastZodError = validation.error;
      if (attempt < maxRetries) continue;
      throw new LLMStructuredOutputError(
        `LLM response failed schema validation after ${attempt + 1} attempt(s): ${validation.error.message}`,
        content,
        validation.error,
        totalTokens,
        totalCredits,
      );
    }

    // Success
    auditLogger.log({
      eventType: "llm_response",
      userId,
      model,
      metadata: {
        structured: true,
        attempts: attempt + 1,
        tenantId,
      },
    });

    return {
      data: validation.data,
      tokensUsed: totalTokens,
      creditsUsed: totalCredits,
    };
  }

  // This should be unreachable, but TypeScript needs it
  throw new LLMStructuredOutputError(
    "LLM structured output failed",
    lastRawResponse,
    lastZodError,
    totalTokens,
    totalCredits,
  );
}
