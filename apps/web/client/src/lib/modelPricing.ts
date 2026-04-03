/**
 * Model pricing utilities for the multi-provider system
 */

export interface ModelProvider {
  providerId: number;
  providerName: string;
  providerDisplayName?: string;
  providerModelId: string;
  pricingInput: string | number;
  pricingOutput: string | number;
  isFree: boolean;
  isEnabled: boolean;
  contextLength: number | null;
}

export interface AvailableModel {
  modelId: string;
  modelName: string;
  providers: ModelProvider[];
}

/**
 * Format model cost for display
 * Converts per-1M token pricing to per-1K token display
 */
export function formatModelCost(
  pricingInput: string | number,
  pricingOutput: string | number,
  isFree: boolean,
): string {
  if (isFree) return "Free";

  const input = Number(pricingInput) / 1000;
  const output = Number(pricingOutput) / 1000;

  if (input === 0 && output === 0) return "Free";

  return `$${input.toFixed(4)} / $${output.toFixed(4)} per 1K`;
}

/**
 * Get the cheapest provider for a model (free first, then by total cost)
 */
export function getCheapestProvider(providers: ModelProvider[]): ModelProvider | undefined {
  const enabled = providers.filter((p) => p.isEnabled);
  if (enabled.length === 0) return undefined;

  return enabled.sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    return (Number(a.pricingInput) + Number(a.pricingOutput)) - (Number(b.pricingInput) + Number(b.pricingOutput));
  })[0];
}

/**
 * Estimate credits for a request with given model/provider
 * Uses 1 credit = $0.001 conversion
 */
export function estimateCredits(
  pricingInput: string | number,
  pricingOutput: string | number,
  estimatedInputTokens: number = 1000,
  estimatedOutputTokens: number = 500,
): number {
  const costUsd =
    (estimatedInputTokens / 1_000_000) * Number(pricingInput) +
    (estimatedOutputTokens / 1_000_000) * Number(pricingOutput);
  return Math.max(1, Math.ceil(costUsd * 1000));
}
