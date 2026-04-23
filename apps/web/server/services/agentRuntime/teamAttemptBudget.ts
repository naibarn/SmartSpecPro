export interface TeamAttemptBudgetInput {
  mandatoryStepCount: number;
  repairAllowancePerStep: number;
  reviewAllowancePerStep?: number;
  globalCap?: number | null;
}

export interface TeamAttemptBudgetResult {
  mandatoryStepCount: number;
  repairAllowancePerStep: number;
  reviewAllowancePerStep: number;
  minimumGuaranteedAttempts: number;
  effectiveCap: number | null;
  isCapSufficient: boolean;
  terminalReason: "plan_incomplete_cap_reached" | "budget_exhausted" | null;
}

export function computeTeamAttemptBudget(
  input: TeamAttemptBudgetInput,
): TeamAttemptBudgetResult {
  const mandatoryStepCount = Math.max(0, Math.trunc(input.mandatoryStepCount));
  const repairAllowancePerStep = Math.max(0, Math.trunc(input.repairAllowancePerStep));
  const reviewAllowancePerStep = Math.max(0, Math.trunc(input.reviewAllowancePerStep ?? 1));
  const minimumGuaranteedAttempts =
    mandatoryStepCount * (1 + repairAllowancePerStep + reviewAllowancePerStep);
  const effectiveCap =
    typeof input.globalCap === "number" && Number.isFinite(input.globalCap)
      ? Math.max(0, Math.trunc(input.globalCap))
      : null;
  const isCapSufficient =
    effectiveCap == null ? true : effectiveCap >= minimumGuaranteedAttempts;

  return {
    mandatoryStepCount,
    repairAllowancePerStep,
    reviewAllowancePerStep,
    minimumGuaranteedAttempts,
    effectiveCap,
    isCapSufficient,
    terminalReason: isCapSufficient
      ? null
      : effectiveCap === 0
        ? "budget_exhausted"
        : "plan_incomplete_cap_reached",
  };
}

export function describeTeamAttemptBudget(result: TeamAttemptBudgetResult): string {
  return [
    `steps=${result.mandatoryStepCount}`,
    `minimum=${result.minimumGuaranteedAttempts}`,
    `cap=${result.effectiveCap ?? "unbounded"}`,
    `sufficient=${result.isCapSufficient ? "yes" : "no"}`,
    result.terminalReason ? `terminal=${result.terminalReason}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

