/**
 * Intelligent Model Selector — Feature 041
 *
 * Section 02: computeModelPriority (pure scoring function)
 * Section 03 will add: selectBestLlmModel, describeRequirementsMatch
 */

/**
 * Minimum model data needed to compute a priority score.
 * Sourced from model_provider_map + llmProviders.availableModels JSON.
 */
export interface ModelPriorityInput {
  createdAt?: number | null;
  pricingInput?: string | number | null;
  pricingOutput?: string | number | null;
  isFree?: boolean | null;
  supportsFunctionTools?: boolean | null;
  supportsStructuredOutputs?: boolean | null;
  supportsWebSearch?: boolean | null;
  supportsCodeExecution?: boolean | null;
  supportsComputerUse?: boolean | null;
  supportsBackground?: boolean | null;
  supportsResponses?: boolean | null;
  supportsVision?: boolean | null;
}

const DAY_MS = 86_400_000;

type CapabilityFlag = keyof Pick<
  ModelPriorityInput,
  | "supportsFunctionTools"
  | "supportsStructuredOutputs"
  | "supportsWebSearch"
  | "supportsCodeExecution"
  | "supportsComputerUse"
  | "supportsBackground"
  | "supportsResponses"
  | "supportsVision"
>;

const CAPABILITY_FLAGS: CapabilityFlag[] = [
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
  "supportsVision",
];

function recencyScore(createdAt: number | null | undefined): number {
  if (createdAt == null) return 15;
  const ageMs = Date.now() - createdAt * 1000;
  const ageDays = ageMs / DAY_MS;
  if (ageDays <= 30) return 40;
  if (ageDays <= 90) return 30;
  if (ageDays <= 365) return 20;
  return 10;
}

function costScore(model: ModelPriorityInput): number {
  if (model.isFree) return 30;

  const input = parseFloat(String(model.pricingInput ?? ""));
  const output = parseFloat(String(model.pricingOutput ?? ""));

  if (isNaN(input) && isNaN(output)) return 15;

  const avg = isNaN(input)
    ? output
    : isNaN(output)
      ? input
      : (input + output) / 2;

  if (avg < 0.5) return 25;
  if (avg <= 2) return 20;
  if (avg <= 5) return 15;
  if (avg <= 15) return 10;
  return 5;
}

function capabilityScore(model: ModelPriorityInput): number {
  let count = 0;
  for (const flag of CAPABILITY_FLAGS) {
    if (model[flag] === true) count++;
  }
  return Math.floor((count / 8) * 30);
}

/**
 * Compute a priority score for a model.
 * Lower number = higher priority in ORDER BY priority ASC queries.
 * Range: 1–85 (formula minimum is 1, empirical max is 85).
 * Pure function, deterministic, no side effects.
 */
export function computeModelPriority(model: ModelPriorityInput): number {
  const total =
    recencyScore(model.createdAt) +
    costScore(model) +
    capabilityScore(model);
  return Math.max(1, Math.round(100 - total));
}
