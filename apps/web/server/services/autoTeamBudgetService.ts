import crypto from "crypto";
import type { AutoTeamRouteClass, AutoTeamStageType } from "../../shared/autoTeamExecution";

export interface AutoTeamBudgetDecision {
  allowed: boolean;
  creditsNeeded: number;
  creditsReserved: number;
  budgetKey: string | null;
  blockedReason: string | null;
  estimateSource: "route_default" | "explicit" | "heuristic";
}

export interface AutoTeamBudgetInput {
  tenantId: string;
  runId: string;
  stageId?: string | null;
  routeClass: AutoTeamRouteClass;
  stageType: AutoTeamStageType;
  objective?: string | null;
  requestedModel?: string | null;
  requestedProvider?: string | null;
  creditsAvailable?: number | null;
  creditsNeeded?: number | null;
  attempt?: number;
}

const ROUTE_CREDIT_DEFAULTS: Record<AutoTeamRouteClass, number> = {
  "media.video": 50,
  "media.image": 12,
  "agency.swarm": 40,
  "workflow.automation": 8,
  "research.synthesis": 4,
  "document.writing": 4,
  "unknown.blocked": 0,
};

export function estimateAutoTeamCredits(input: AutoTeamBudgetInput): number {
  if (typeof input.creditsNeeded === "number" && Number.isFinite(input.creditsNeeded)) {
    return Math.max(0, Math.round(input.creditsNeeded));
  }
  return ROUTE_CREDIT_DEFAULTS[input.routeClass] ?? 0;
}

export function buildAutoTeamBudgetKey(input: AutoTeamBudgetInput): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.tenantId,
        input.runId,
        input.stageId ?? "",
        input.routeClass,
        input.stageType,
        input.objective ?? "",
        input.requestedProvider ?? "",
        input.requestedModel ?? "",
        String(input.attempt ?? 1),
      ].join("|"),
    )
    .digest("hex");
}

export function assessAutoTeamBudget(
  input: AutoTeamBudgetInput,
): AutoTeamBudgetDecision {
  const creditsNeeded = estimateAutoTeamCredits(input);
  const budgetKey = buildAutoTeamBudgetKey(input);
  const creditsAvailable =
    typeof input.creditsAvailable === "number" && Number.isFinite(input.creditsAvailable)
      ? Math.max(0, Math.round(input.creditsAvailable))
      : null;

  if (creditsAvailable == null) {
    return {
      allowed: true,
      creditsNeeded,
      creditsReserved: creditsNeeded,
      budgetKey,
      blockedReason: null,
      estimateSource: typeof input.creditsNeeded === "number" ? "explicit" : "route_default",
    };
  }

  if (creditsNeeded > creditsAvailable) {
    return {
      allowed: false,
      creditsNeeded,
      creditsReserved: 0,
      budgetKey,
      blockedReason: "budget_exceeded",
      estimateSource: typeof input.creditsNeeded === "number" ? "explicit" : "route_default",
    };
  }

  return {
    allowed: true,
    creditsNeeded,
    creditsReserved: creditsNeeded,
    budgetKey,
    blockedReason: null,
    estimateSource: typeof input.creditsNeeded === "number" ? "explicit" : "route_default",
  };
}
