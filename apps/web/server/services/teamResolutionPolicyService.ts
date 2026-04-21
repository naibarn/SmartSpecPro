import type { TeamResolutionDecision } from "../../shared/workOrchestrator";

export interface ResolveTeamForAutomationInput {
  explicitTeamId?: string | null;
  explicitTeamAuthorized?: boolean;
  caseOwnerType?: string | null;
  caseOwnerId?: string | null;
  requestDefaultQueueId?: string | null;
  requestDefaultOwnerType?: string | null;
  requestDefaultOwnerId?: string | null;
  tenantFallbackTeamId?: string | null;
  eligibleTeamIds?: readonly string[] | null;
  inactiveTeamIds?: readonly string[] | null;
  unauthorizedTeamIds?: readonly string[] | null;
}

type ResolvedSource = TeamResolutionDecision["source"];

interface Candidate {
  teamId: string;
  code: TeamResolutionDecision["code"];
  source: ResolvedSource;
  reason: string;
}

function normalizeTeamId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function setFrom(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map(value => value.trim()).filter(Boolean));
}

function checkCandidate(
  candidate: Candidate,
  input: ResolveTeamForAutomationInput,
): TeamResolutionDecision {
  const eligibleTeamIds = input.eligibleTeamIds ? setFrom(input.eligibleTeamIds) : null;
  const inactiveTeamIds = setFrom(input.inactiveTeamIds);
  const unauthorizedTeamIds = setFrom(input.unauthorizedTeamIds);

  if (inactiveTeamIds.has(candidate.teamId)) {
    return {
      status: "blocked",
      code: "inactive_team",
      teamId: candidate.teamId,
      source: candidate.source,
      reason: `Team ${candidate.teamId} is inactive`,
      diagnostics: { attemptedCode: candidate.code },
    };
  }
  if (unauthorizedTeamIds.has(candidate.teamId)) {
    return {
      status: "blocked",
      code: "unauthorized_team",
      teamId: candidate.teamId,
      source: candidate.source,
      reason: `Actor is not authorized to launch automation in team ${candidate.teamId}`,
      diagnostics: { attemptedCode: candidate.code },
    };
  }
  if (eligibleTeamIds && !eligibleTeamIds.has(candidate.teamId)) {
    return {
      status: "blocked",
      code: "unauthorized_team",
      teamId: candidate.teamId,
      source: candidate.source,
      reason: `Team ${candidate.teamId} is outside the eligible orchestration set`,
      diagnostics: { attemptedCode: candidate.code },
    };
  }
  return {
    status: "resolved",
    code: candidate.code,
    teamId: candidate.teamId,
    source: candidate.source,
    reason: candidate.reason,
    diagnostics: {},
  };
}

export function resolveTeamForAutomation(
  input: ResolveTeamForAutomationInput,
): TeamResolutionDecision {
  const explicitTeamId = normalizeTeamId(input.explicitTeamId);
  if (explicitTeamId && !input.explicitTeamAuthorized) {
    return {
      status: "blocked",
      code: "unauthorized_team",
      teamId: explicitTeamId,
      source: "plan_override",
      reason: "Explicit team override is not authorized",
      diagnostics: {},
    };
  }

  const candidates: Candidate[] = [];
  if (explicitTeamId) {
    candidates.push({
      teamId: explicitTeamId,
      code: "resolved_plan_override",
      source: "plan_override",
      reason: "Resolved from approved execution-plan team override",
    });
  }
  if (input.caseOwnerType === "queue") {
    const teamId = normalizeTeamId(input.caseOwnerId);
    if (teamId) {
      candidates.push({
        teamId,
        code: "resolved_case_owner",
        source: "case_owner",
        reason: "Resolved from current case queue owner",
      });
    }
  }
  const defaultQueueId = normalizeTeamId(input.requestDefaultQueueId);
  if (defaultQueueId) {
    candidates.push({
      teamId: defaultQueueId,
      code: "resolved_request_default_queue",
      source: "request_default_queue",
      reason: "Resolved from request default queue",
    });
  }
  if (input.requestDefaultOwnerType === "queue") {
    const teamId = normalizeTeamId(input.requestDefaultOwnerId);
    if (teamId) {
      candidates.push({
        teamId,
        code: "resolved_request_default_owner",
        source: "request_default_owner",
        reason: "Resolved from request queue-style default owner",
      });
    }
  }
  const fallbackTeamId = normalizeTeamId(input.tenantFallbackTeamId);
  if (fallbackTeamId) {
    candidates.push({
      teamId: fallbackTeamId,
      code: "resolved_tenant_fallback",
      source: "tenant_fallback",
      reason: "Resolved from tenant fallback orchestration team",
    });
  }

  for (const candidate of candidates) {
    const decision = checkCandidate(candidate, input);
    if (decision.status === "resolved") {
      return decision;
    }
    return decision;
  }

  return {
    status: "blocked",
    code: "missing_team",
    teamId: null,
    source: "none",
    reason: "No eligible orchestration team could be resolved",
    diagnostics: {},
  };
}
