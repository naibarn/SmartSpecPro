import crypto from "crypto";
import type { AutoTeamExecutionStageRow, AutoTeamRouteDecisionRow } from "../../drizzle/schema";

export interface AutoTeamLoopGuardInput {
  tenantId: string;
  runId: string;
  routeDecision: Pick<AutoTeamRouteDecisionRow, "routeClass" | "id">;
  recentStages: Pick<AutoTeamExecutionStageRow, "stageType" | "selectedSkillId" | "status" | "blockedReason" | "attempt">[];
  outputFingerprint?: string | null;
  budgetSpent?: number | null;
  threshold?: number;
}

export interface AutoTeamLoopGuardResult {
  triggered: boolean;
  reason: string | null;
  repeatCount: number;
  fingerprint: string;
}

export function evaluateAutoTeamLoopGuard(
  input: AutoTeamLoopGuardInput,
): AutoTeamLoopGuardResult {
  const threshold = input.threshold ?? 3;
  const lastStage = input.recentStages[input.recentStages.length - 1];
  const fingerprint = input.outputFingerprint ?? crypto.createHash("sha256").update(JSON.stringify({
    routeClass: input.routeDecision.routeClass,
    recentStages: input.recentStages.map((stage) => [stage.stageType, stage.selectedSkillId, stage.status, stage.blockedReason, stage.attempt]),
  })).digest("hex");
  const repeatCount = input.recentStages.reduce((count, stage, index, array) => {
    if (index === 0) return 1;
    const prev = array[index - 1];
    return stage.stageType === prev.stageType && stage.selectedSkillId === prev.selectedSkillId && stage.status === prev.status ? count + 1 : count;
  }, 1);

  const trigger =
    repeatCount >= threshold ||
    (input.budgetSpent ?? 0) > 0 && repeatCount >= Math.max(2, threshold - 1) ||
    Boolean(lastStage?.blockedReason && repeatCount >= 2);

  return {
    triggered: trigger,
    reason: trigger ? "loop_guard_triggered" : null,
    repeatCount,
    fingerprint,
  };
}
