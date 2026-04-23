import {
  detectBudgetProfile,
  scaleBudget,
} from "./promptComposer";
import type { ComposePromptInput } from "./promptComposer";
import type { ContextBudgetProfile } from "../../shared/contextEngine";

export type { ContextBudgetProfile };

export interface ContextBudgetAllocation {
  persona: number;
  scopedMemory: number;
  entityMemory: number;
  history: number;
}

export const CONTEXT_BUDGET_PROFILE_PRESETS: Record<
  ContextBudgetProfile,
  ContextBudgetAllocation
> = {
  balanced: { persona: 1200, scopedMemory: 3000, entityMemory: 1500, history: 5000 },
  follow_up: { persona: 800, scopedMemory: 2000, entityMemory: 1000, history: 6500 },
  personalized: { persona: 1200, scopedMemory: 4000, entityMemory: 2000, history: 3500 },
  retrieval: { persona: 800, scopedMemory: 5000, entityMemory: 1000, history: 3500 },
};

export function classifyContextBudgetProfile(
  objective: string,
  historyLength: number,
): ContextBudgetProfile {
  return detectBudgetProfile(objective, historyLength);
}

export function scaleContextBudgetProfile(
  profile: ContextBudgetProfile,
  totalBudget: number,
): ContextBudgetAllocation {
  return scaleBudget(profile, totalBudget);
}

export function detectContextBudgetProfileFromInput(
  input: Pick<ComposePromptInput, "objective"> & { historyLength: number },
): ContextBudgetProfile {
  return detectBudgetProfile(input.objective, input.historyLength);
}
