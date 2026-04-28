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

export function estimateAutoTeamMediaPipelineCredits(input: {
  mediaType: "image" | "video";
  clipCount?: number | null;
  includeComposition?: boolean;
  includeProbe?: boolean;
  includeFinalReview?: boolean;
}): number {
  if (input.mediaType === "image") {
    return ROUTE_CREDIT_DEFAULTS["media.image"];
  }
  const clipCount =
    typeof input.clipCount === "number" && Number.isFinite(input.clipCount)
      ? Math.max(1, Math.ceil(input.clipCount))
      : 1;
  const compositionCredits = input.includeComposition === false ? 0 : ROUTE_CREDIT_DEFAULTS["workflow.automation"];
  const probeCredits = input.includeProbe === false ? 0 : ROUTE_CREDIT_DEFAULTS["research.synthesis"];
  const reviewCredits = input.includeFinalReview === false ? 0 : ROUTE_CREDIT_DEFAULTS["document.writing"];
  return (
    clipCount * ROUTE_CREDIT_DEFAULTS["media.video"] +
    compositionCredits +
    probeCredits +
    reviewCredits
  );
}

export function estimateAutoTeamRequestedVideoSeconds(text: string): number {
  const normalized = text.toLowerCase();
  const minuteRangeMatch =
    /(\d+(?:\.\d+)?)\s*(?:-|–|to|ถึง)\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|นาที)/i.exec(normalized);
  if (minuteRangeMatch) {
    return Math.max(10, Math.ceil(Number(minuteRangeMatch[2]) * 60));
  }
  const secondRangeMatch =
    /(\d+(?:\.\d+)?)\s*(?:-|–|to|ถึง)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|วินาที)/i.exec(normalized);
  if (secondRangeMatch) {
    return Math.max(10, Math.ceil(Number(secondRangeMatch[2])));
  }
  const atLeastMinuteMatch =
    /(?:at least|no less than|minimum|more than|over|longer than|อย่างน้อย|ไม่น้อยกว่า|มากกว่า|เกิน)\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|นาที)/i.exec(normalized);
  if (atLeastMinuteMatch) {
    return Math.max(10, Math.ceil(Number(atLeastMinuteMatch[1]) * 60 + 10));
  }
  const atLeastSecondMatch =
    /(?:at least|no less than|minimum|more than|over|longer than|อย่างน้อย|ไม่น้อยกว่า|มากกว่า|เกิน)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|วินาที)/i.exec(normalized);
  if (atLeastSecondMatch) {
    return Math.max(10, Math.ceil(Number(atLeastSecondMatch[1]) + 5));
  }
  const minuteMatch =
    /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|นาที)/i.exec(normalized);
  if (minuteMatch) {
    return Math.max(10, Math.ceil(Number(minuteMatch[1]) * 60));
  }
  const secondMatch =
    /(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|วินาที)/i.exec(normalized);
  if (secondMatch) {
    return Math.max(10, Math.ceil(Number(secondMatch[1])));
  }
  if (/เกิน\s*1\s*นาที|over\s*1\s*minute|longer than\s*1\s*minute/i.test(normalized)) {
    return 70;
  }
  return /video|วีดีโอ|วิดีโอ|clip|คลิป|reel|movie|film/i.test(normalized) ? 60 : 0;
}

export function estimateAutoTeamVideoClipCount(input: {
  text: string;
  clipDurationSeconds?: number | null;
}): { requestedVideoSeconds: number; clipDurationSeconds: number; clipCount: number } {
  const requestedVideoSeconds = estimateAutoTeamRequestedVideoSeconds(input.text);
  const clipDurationSeconds =
    typeof input.clipDurationSeconds === "number" && Number.isFinite(input.clipDurationSeconds)
      ? Math.max(1, Math.ceil(input.clipDurationSeconds))
      : 10;
  return {
    requestedVideoSeconds,
    clipDurationSeconds,
    clipCount: requestedVideoSeconds > 0
      ? Math.max(1, Math.ceil(Math.max(10, requestedVideoSeconds) / clipDurationSeconds))
      : 0,
  };
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
