import { resolveCatalogBackedPricing } from "../llmProviderCatalog";

export type ProbePricing = {
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  source: "mapping" | "catalog" | "default";
};

/** Use current billing prices, never a cheaper stale profile snapshot, for probe budgets. */
export function resolveProbePricing(input: {
  providerName: string;
  availableModels:
    | Array<{
        id: string;
        pricing?: { input?: number; output?: number } | null;
      }>
    | null
    | undefined;
  providerModelId: string;
  pricingInput?: string | number | null;
  pricingOutput?: string | number | null;
  isFree?: boolean | null;
  snapshot: { inputMicrosPerMillion: number; outputMicrosPerMillion: number };
}): ProbePricing {
  const current = resolveCatalogBackedPricing(input);
  const currentInputMicros = Math.ceil(current.pricingInput * 1_000_000);
  const currentOutputMicros = Math.ceil(current.pricingOutput * 1_000_000);
  return {
    inputMicrosPerMillion: Math.max(
      input.snapshot.inputMicrosPerMillion,
      currentInputMicros
    ),
    outputMicrosPerMillion: Math.max(
      input.snapshot.outputMicrosPerMillion,
      currentOutputMicros
    ),
    source: current.source,
  };
}
