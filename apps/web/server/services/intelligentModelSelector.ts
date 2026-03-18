/**
 * Intelligent Model Selector — Feature 041
 *
 * Section 02: computeModelPriority (pure scoring function)
 * Section 03: selectBestLlmModel, describeRequirementsMatch
 */

import type { EnabledLlmModelRow } from "./enabledLlmModels";

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
  supportsThinking?: boolean | null;
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
  | "supportsThinking"
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
  "supportsThinking",
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
  return Math.floor((count / CAPABILITY_FLAGS.length) * 30);
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

// ─── Section 03: Capability-Aware Selector ───

/**
 * Requirements that a skill can declare for model selection.
 * All fields are optional. Only `true` boolean values act as filters.
 * `false` values are ignored (they do not exclude models that have the capability).
 */
export interface CapabilityRequirements {
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  /** Minimum context window size in tokens. */
  contextLength?: number;
}

const CAPABILITY_KEYS: ReadonlyArray<
  keyof Omit<CapabilityRequirements, "contextLength">
> = [
  "supportsVision",
  "supportsThinking",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
] as const;

/**
 * Given a set of capability requirements and a list of enabled model rows,
 * return the modelId of the best matching model, or null if none qualifies.
 *
 * Algorithm:
 * 1. Filter rows by boolean capability requirements (AND logic).
 *    Only `true` requirements filter; `false` requirements are ignored.
 * 2. If contextLength requirement is set, exclude rows where
 *    row.contextLength is null or row.contextLength < requirements.contextLength.
 * 3. Sort qualifying rows by priority ASC (lower number = higher priority).
 * 4. Return first row's modelId, or null.
 *
 * NOTE: disallowedModels filtering is deferred to v2.
 */
export function selectBestLlmModel(
  requirements: Partial<CapabilityRequirements>,
  rows: EnabledLlmModelRow[],
): string | null {
  if (rows.length === 0) {
    return null;
  }

  // Step 1: Filter by boolean capabilities (AND logic)
  let candidates = rows.filter((row) => {
    for (const key of CAPABILITY_KEYS) {
      if (requirements[key] === true) {
        if (row[key] !== true) {
          return false;
        }
      }
    }
    return true;
  });

  // Step 2: Filter by contextLength
  if (
    requirements.contextLength != null &&
    requirements.contextLength > 0
  ) {
    candidates = candidates.filter((row) => {
      if (row.contextLength == null) {
        return false;
      }
      return row.contextLength >= requirements.contextLength!;
    });
  }

  // Step 3: Sort by priority ASC (lower = higher priority)
  candidates.sort((a, b) => a.priority - b.priority);

  // Debug: log candidates for orchestrator troubleshooting
  if (candidates.length > 0) {
    console.log(`[ModelSelector] ${candidates.length} candidates for requirements ${JSON.stringify(requirements)}: ${candidates.slice(0, 5).map(c => `${c.modelId}(p${c.priority})`).join(", ")}`);
  }

  // Step 4: Return first match
  // TODO v2: apply disallowedModels filter here
  return candidates[0]?.modelId ?? null;
}

/**
 * Like selectBestLlmModel, but returns up to `maxCandidates` model IDs
 * sorted by priority ASC (cheapest first). Used for fallback chains.
 */
export function selectLlmModelCandidates(
  requirements: Partial<CapabilityRequirements>,
  rows: EnabledLlmModelRow[],
  maxCandidates: number = 5,
): string[] {
  if (rows.length === 0) return [];

  let candidates = rows.filter((row) => {
    for (const key of CAPABILITY_KEYS) {
      if (requirements[key] === true) {
        if (row[key] !== true) return false;
      }
    }
    return true;
  });

  if (requirements.contextLength != null && requirements.contextLength > 0) {
    candidates = candidates.filter(
      (row) => row.contextLength != null && row.contextLength >= requirements.contextLength!,
    );
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.slice(0, maxCandidates).map((r) => r.modelId);
}

/**
 * Human-readable description of which capabilities a row matches
 * and which it is missing, relative to given requirements.
 * Only boolean requirements set to `true` are evaluated.
 */
export function describeRequirementsMatch(
  requirements: Partial<CapabilityRequirements>,
  row: EnabledLlmModelRow,
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const key of CAPABILITY_KEYS) {
    if (requirements[key] !== true) {
      continue;
    }
    if (row[key] === true) {
      matched.push(key);
    } else {
      missing.push(key);
    }
  }

  if (
    requirements.contextLength != null &&
    requirements.contextLength > 0
  ) {
    if (
      row.contextLength != null &&
      row.contextLength >= requirements.contextLength
    ) {
      matched.push("contextLength");
    } else {
      missing.push("contextLength");
    }
  }

  return { matched, missing };
}
