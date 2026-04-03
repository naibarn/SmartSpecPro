import type { ApiStyle } from "../_core/llmRoutes";

export interface NormalizedLlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  providerReportedCostUsd?: number;
  providerReportedCreditsConsumed?: number;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeLlmUsage(data: any, apiStyle?: ApiStyle): NormalizedLlmUsage {
  if (!data || typeof data !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const usage = data.usage && typeof data.usage === "object"
    ? data.usage
    : data.response?.usage && typeof data.response.usage === "object"
      ? data.response.usage
      : {};

  if (apiStyle === "messages") {
    const inputTokens = asNumber((usage as any).input_tokens) ?? 0;
    const outputTokens = asNumber((usage as any).output_tokens) ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      providerReportedCostUsd: asNumber((usage as any).cost) ?? asNumber(data.cost),
    };
  }

  if (apiStyle === "responses") {
    const inputTokens =
      asNumber((usage as any).input_tokens) ??
      asNumber((usage as any).prompt_tokens) ??
      0;
    const outputTokens =
      asNumber((usage as any).output_tokens) ??
      asNumber((usage as any).completion_tokens) ??
      0;
    return {
      inputTokens,
      outputTokens,
      totalTokens:
        asNumber((usage as any).total_tokens) ??
        inputTokens + outputTokens,
      providerReportedCostUsd: asNumber((usage as any).cost) ?? asNumber(data.cost),
      providerReportedCreditsConsumed: asNumber(data.credits_consumed),
    };
  }

  const inputTokens =
    asNumber((usage as any).prompt_tokens) ??
    asNumber((usage as any).input_tokens) ??
    0;
  const outputTokens =
    asNumber((usage as any).completion_tokens) ??
    asNumber((usage as any).output_tokens) ??
    0;
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      asNumber((usage as any).total_tokens) ??
      inputTokens + outputTokens,
    providerReportedCostUsd: asNumber((usage as any).cost) ?? asNumber(data.cost),
  };
}
