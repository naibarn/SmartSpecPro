import type { AutoTeamAccessDecision } from "../../shared/autoTeamExecution";

export interface AutoTeamCallerContext {
  tenantId: string;
  userId?: number | null;
  isTenantAdmin?: boolean;
  isDebugUser?: boolean;
  teamIds?: string[] | null;
  roomIds?: string[] | null;
  runIds?: string[] | null;
}

export interface AutoTeamResourceContext {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  reviewerPersonaId?: string | null;
  artifactId?: string | null;
}

function scopeDecision(
  scope: AutoTeamAccessDecision["scope"],
  allowed: boolean,
  reason: string | null,
  redactedReason: string | null = reason,
): AutoTeamAccessDecision {
  return {
    allowed,
    scope,
    blockedReason: allowed ? null : reason,
    redactedReason: allowed ? null : redactedReason,
  };
}

export function assertAutoTeamAccess(
  caller: AutoTeamCallerContext,
  resource: AutoTeamResourceContext,
): AutoTeamAccessDecision {
  if (caller.tenantId !== resource.tenantId) {
    return scopeDecision("tenant", false, "cross_tenant_access_denied", "not_found");
  }
  if (caller.isTenantAdmin || caller.isDebugUser) {
    return scopeDecision("tenant", true, null);
  }
  if (resource.runId && caller.runIds?.includes(resource.runId)) {
    return scopeDecision("run", true, null);
  }
  if (resource.roomId && caller.roomIds?.includes(resource.roomId)) {
    return scopeDecision("room", true, null);
  }
  if (resource.teamId && caller.teamIds?.includes(resource.teamId)) {
    return scopeDecision("team", true, null);
  }
  return scopeDecision("tenant", false, "forbidden", "forbidden");
}

export function canReadAutoTeamArtifacts(
  caller: AutoTeamCallerContext,
  resource: AutoTeamResourceContext,
): AutoTeamAccessDecision {
  const decision = assertAutoTeamAccess(caller, resource);
  if (!decision.allowed) return { ...decision, scope: "artifact" };
  return { ...decision, scope: "artifact" };
}

export function canManageAutoTeamRun(
  caller: AutoTeamCallerContext,
  resource: AutoTeamResourceContext,
): AutoTeamAccessDecision {
  const decision = assertAutoTeamAccess(caller, resource);
  if (!decision.allowed) return { ...decision, scope: "run" };
  return { ...decision, scope: "run" };
}

export function isAutoTeamDebugVisible(caller: AutoTeamCallerContext): boolean {
  return Boolean(caller.isTenantAdmin || caller.isDebugUser);
}
