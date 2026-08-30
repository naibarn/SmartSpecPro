import { deductCreditsForModel } from "./creditService";

export interface VerticalDramaLlmCallBillingInput {
  userId: number;
  tenantId?: string;
  seriesId?: number;
  jobId?: string;
  runId: string;
  attemptKey: string;
  skillSlug: string;
  stage: string;
  round: number;
  attempt: number;
  model: string;
  provider?: string;
  providerCallId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  scope?: {
    episodeNumbers?: number[];
    episodeNumber?: number;
    shotNumbers?: number[];
  };
  metadata?: Record<string, unknown>;
}

/**
 * The only billing entry point for a physical Vertical Drama LLM attempt.
 *
 * attemptKey is deliberately supplied by the caller: a worker redelivery
 * reuses it, while an automatic repair/re-run must create a new key and is
 * therefore charged again. This function never turns a missing skill/model
 * into an unbilled call and never swallows a ledger failure.
 */
export async function chargeVerticalDramaLlmCall(
  input: VerticalDramaLlmCallBillingInput,
): Promise<{ creditsUsed: number; wasFree: boolean }> {
  const skillSlug = input.skillSlug.trim();
  const model = input.model.trim();
  const attemptKey = input.attemptKey.trim();
  if (!skillSlug) throw new Error("Skill billing requires skillSlug");
  if (!model) throw new Error("LLM billing requires the actual model");
  if (!attemptKey) throw new Error("LLM billing requires attemptKey");

  return deductCreditsForModel({
    userId: input.userId,
    tenantId: input.tenantId,
    model,
    provider: input.provider,
    inputTokens: Math.max(0, Math.trunc(input.inputTokens)),
    outputTokens: Math.max(0, Math.trunc(input.outputTokens)),
    costUsd: input.costUsd,
    description: "Skill run: " + skillSlug + " (" + input.stage + ", round " + input.round + ", attempt " + input.attempt + ")",
    idempotencyKey: attemptKey,
    skillRunId: attemptKey,
    contextRef: input.seriesId == null ? undefined : {
      contextType: "series",
      sourceType: "vertical_drama_series",
      sourceId: input.seriesId,
      stageLabel: input.stage,
      attemptKey,
    },
    skillSlug,
    sourceType: "skill",
    metadata: {
      feature: "vertical_drama",
      runId: input.runId,
      jobId: input.jobId ?? null,
      seriesId: input.seriesId ?? null,
      stage: input.stage,
      round: input.round,
      attempt: input.attempt,
      actualModel: model,
      providerCallId: input.providerCallId ?? null,
      scope: input.scope ?? null,
      ...(input.metadata ?? {}),
    },
  });
}
