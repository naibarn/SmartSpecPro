import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { runnerNodes, workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { workspaceFactsFromSnapshot } from "./spec224WorkspaceSpecSet";

type ProjectWorkspaceInput = {
  tenantId: string;
  actorId: number;
  now?: Date;
};

type RunnerAuthorityRow = {
  runnerId: string;
  tenantId: string;
  ownerUserId: number | null;
  profile: string;
  displayName: string;
  trustState: string;
  status: string;
  currentSnapshotRevision: string | null;
  currentSnapshotJson: unknown;
  snapshotObservedAt: Date | null;
  snapshotExpiresAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  activeSessionId: string | null;
};

function activeSessionProvider(snapshot: unknown, activeSession: boolean, now: Date): { provider: string; source: string } {
  if (!activeSession || !snapshot || typeof snapshot !== "object") return { provider: "UNKNOWN", source: "no_active_session_provider_fact" };
  const tools = (snapshot as { toolInventory?: unknown }).toolInventory;
  if (!Array.isArray(tools)) return { provider: "UNKNOWN", source: "no_active_session_provider_fact" };
  const activeAgents = tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const record = tool as Record<string, unknown>;
    if (!(["agent_cli", "agent_harness", "agent_runtime"].includes(String(record.kind)) &&
      ["codex", "claude"].includes(String(record.toolId).toLowerCase()) &&
      ["ready", "busy"].includes(String(record.trustState)) &&
      ["authenticated", "not_required"].includes(String(record.authState)) &&
      record.availabilityState === "busy" && typeof record.expiresAt === "string" &&
      Date.parse(record.expiresAt) > now.getTime())) return [];
    return [String(record.toolId).toLowerCase()];
  });
  return activeAgents.length === 1
    ? { provider: activeAgents[0], source: "trusted_runner_active_tool_inventory" }
    : { provider: "UNKNOWN", source: activeAgents.length ? "ambiguous_active_provider_facts" : "no_active_session_provider_fact" };
}

function freshEvidenceProjection(value: unknown, now: Date): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fact = value as Record<string, unknown>;
  const freshness = fact.freshness && typeof fact.freshness === "object"
    ? fact.freshness as Record<string, unknown> : null;
  const remote = fact.remote_observation && typeof fact.remote_observation === "object"
    ? fact.remote_observation as Record<string, unknown> : null;
  const remoteObservedAt = remote && typeof remote.observed_at === "string" ? Date.parse(remote.observed_at) : Number.NaN;
  const remoteTtl = remote && typeof remote.freshness_ttl_seconds === "number" ? remote.freshness_ttl_seconds : Number.NaN;
  const nestedRemoteStale = Boolean(remote && remote.status === "OBSERVED" &&
    (!Number.isFinite(remoteObservedAt) || !Number.isFinite(remoteTtl) || remoteTtl < 0 ||
      now.getTime() < remoteObservedAt || now.getTime() - remoteObservedAt > remoteTtl * 1000));
  if (!freshness && !remote) return fact;
  const observedAt = freshness && typeof freshness.observed_at === "string" ? Date.parse(freshness.observed_at) : Number.NaN;
  const ttl = freshness && typeof freshness.ttl_seconds === "number" ? freshness.ttl_seconds : Number.NaN;
  const directStale = Boolean(freshness && (!Number.isFinite(observedAt) || !Number.isFinite(ttl) || ttl < 0 ||
    now.getTime() < observedAt || now.getTime() - observedAt > ttl * 1000));
  if (nestedRemoteStale) {
    const aheadBehind = fact.ahead_behind && typeof fact.ahead_behind === "object"
      ? fact.ahead_behind as Record<string, unknown> : null;
    return { ...fact,
      ahead_behind: aheadBehind ? { ...aheadBehind, state: "STALE", ahead: null, behind: null,
        freshness: { state: "STALE", observed_at: remote?.observed_at, ttl_seconds: remote?.freshness_ttl_seconds } } : aheadBehind,
      remote_observation: { ...(remote ?? {}), status: "STALE", reason: "remote_observation_expired" } };
  }
  if (directStale) {
    return { ...fact, state: "STALE", count: null,
      freshness: { ...freshness, state: "STALE" }, reason: "remote_observation_expired" };
  }
  return fact;
}

function freshCanonicalProjection(value: unknown, now: Date): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fact = value as Record<string, unknown>;
  const remote = fact.remote_observation && typeof fact.remote_observation === "object"
    ? fact.remote_observation as Record<string, unknown> : null;
  if (!remote || remote.status !== "OBSERVED") return fact;
  const observedAt = typeof remote.observed_at === "string" ? Date.parse(remote.observed_at) : Number.NaN;
  const ttl = typeof remote.freshness_ttl_seconds === "number" ? remote.freshness_ttl_seconds : Number.NaN;
  if (!Number.isFinite(observedAt) || !Number.isFinite(ttl) || ttl < 0 || now.getTime() < observedAt || now.getTime() - observedAt > ttl * 1000) {
    return { ...fact, verification_state: "STALE",
      remote_observation: { ...remote, status: "STALE", reason: "remote_observation_expired" } };
  }
  return fact;
}

function freshRemoteWorkspaceStates(value: unknown, now: Date): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const row = value as Record<string, unknown>;
    if (typeof row.remote_observed_at !== "string") return row;
    const observedAt = Date.parse(row.remote_observed_at);
    const ttl = typeof row.freshness_ttl_seconds === "number" ? row.freshness_ttl_seconds : Number.NaN;
    if (!Number.isFinite(observedAt) || !Number.isFinite(ttl) || ttl < 0 ||
        now.getTime() < observedAt || now.getTime() - observedAt > ttl * 1000) {
      return { ...row, push_state: "STALE", integration_state: "STALE", unpushed_commit_count: null,
        unintegrated_commit_count: null, patch_equivalent_commit_count: null, freshness: "STALE" };
    }
    return row;
  });
}

export function projectRunnerWorkspaceAuthority(input: {
  tenantId: string;
  actorId: number;
  rows: RunnerAuthorityRow[];
  now: Date;
  localMissionControl?: Record<string, unknown> | null;
  localAuthorityStatus?: "OBSERVED" | "STALE" | "UNAVAILABLE";
  localAuthorityObservedAt?: Date | null;
}) {
  const { tenantId, rows, now } = input;
  const workspaceRows = rows.flatMap((runner) => {
    const snapshot = runner.currentSnapshotJson as { runnerSessionId?: unknown } | null;
    const expiresAt = runner.snapshotExpiresAt;
    const snapshotFresh = Boolean(expiresAt && expiresAt > now && runner.snapshotObservedAt && runner.snapshotObservedAt <= now);
    const trust = runner.revokedAt ? "REVOKED" : runner.trustState === "trusted" ? "TRUSTED" : "UNTRUSTED";
    const hostState = trust === "REVOKED" ? "REVOKED" : !snapshotFresh ? "STALE" : runner.status === "online" ? "ONLINE" : runner.status.toUpperCase();
    const activeSession = snapshotFresh && runner.status === "online" && runner.trustState === "trusted" &&
      Boolean(runner.activeSessionId && snapshot?.runnerSessionId === runner.activeSessionId);
    const providerFact = activeSessionProvider(snapshot, activeSession, now);
    return workspaceFactsFromSnapshot(snapshot).map((workspace) => ({
      authorityId: "runner-control-plane",
      tenantId: runner.tenantId,
      projectId: workspace.projectId,
      repositoryId: workspace.repositoryId,
      hostId: runner.runnerId,
      runnerId: runner.runnerId,
      agentIdentity: activeSession
        ? providerFact.provider === "UNKNOWN" ? runner.runnerId : providerFact.provider
        : "UNKNOWN",
      agentIdentityResolutionSource: activeSession
        ? providerFact.provider === "UNKNOWN" ? "trusted_runner_registration" : providerFact.source
        : "no_active_session_provider_fact",
      provider: activeSession ? providerFact.provider : "UNKNOWN",
      providerResolutionSource: providerFact.source,
      runnerProfile: runner.profile,
      workspaceId: workspace.workspaceId,
      displayName: workspace.displayName ?? runner.displayName,
      observedSha: workspace.gitHead,
      branch: workspace.gitBranch,
      dirty: workspace.dirty,
      ownerUserId: runner.ownerUserId,
      sessionId: activeSession ? runner.activeSessionId : null,
      sessionState: activeSession ? "ACTIVE" : runner.activeSessionId ? "STALE_OR_UNBOUND" : "NONE",
      trust,
      hostState,
      factSource: "trusted_runner_snapshot",
      observedAt: runner.snapshotObservedAt?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      snapshotRevision: runner.currentSnapshotRevision,
      authorityLevel: trust === "TRUSTED" ? "TRUSTED_RUNNER" : trust,
      authorityEligible: trust === "TRUSTED" && snapshotFresh,
      factFreshness: snapshotFresh ? "FRESH" : "STALE",
      contentFingerprint: workspace.contentFingerprint,
      convergenceState: "NOT_REPORTED" as const,
      localPath: null,
    }));
  });

  const byWorkspace = new Map<string, typeof workspaceRows>();
  for (const row of workspaceRows) {
    // Workspace IDs are opaque and may be reused across repositories. Keep
    // host claims for one repository together so contradictory project bindings
    // remain visible as conflicts instead of being silently split apart.
    const key = JSON.stringify([row.tenantId, row.repositoryId, row.workspaceId]);
    byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), row]);
  }
  const workspaces = [...byWorkspace.values()].map((facts) => {
    const eligibleFacts = facts.filter((fact) => fact.authorityEligible);
    const ineligibleFacts = facts.filter((fact) => !fact.authorityEligible);
    const identities = new Set(eligibleFacts.map((fact) => JSON.stringify([fact.projectId, fact.repositoryId])));
    const comparableFields = ["observedSha", "branch", "dirty", "contentFingerprint"] as const;
    const conflictingFields = comparableFields.filter((field) =>
      new Set(eligibleFacts.map((fact) => fact[field])).size > 1
    );
    const missingBinding = eligibleFacts.some((fact) => !fact.projectId || !fact.repositoryId);
    const reasons = [
      ...(identities.size > 1 ? ["TRUSTED_FACTS_DISAGREE_ON_PROJECT_OR_REPOSITORY"] : []),
      ...(conflictingFields.length ? ["TRUSTED_FACTS_DISAGREE_ON_WORKSPACE_STATE"] : []),
    ];
    const state = reasons.length
      ? "CONFLICT"
      : missingBinding
        ? "UNBOUND"
        : eligibleFacts.length
          ? "OBSERVED"
          : facts.some((fact) => fact.hostState === "STALE")
            ? "STALE"
            : "UNTRUSTED";
    const agreedWorkspaceState = eligibleFacts.length && !conflictingFields.length
      ? Object.fromEntries(comparableFields.map((field) => [field, eligibleFacts[0][field]]))
      : null;
    const userWorkspace = input.localMissionControl?.user_workspace &&
      typeof input.localMissionControl.user_workspace === "object"
      ? input.localMissionControl.user_workspace as Record<string, unknown>
      : null;
    const receiptCandidate = userWorkspace?.convergence_receipt && typeof userWorkspace.convergence_receipt === "object"
      ? userWorkspace.convergence_receipt as Record<string, unknown> : null;
    const canonicalReceipt = receiptCandidate?.workspace_id === facts[0].workspaceId ? receiptCandidate : null;
    return {
      tenantId: facts[0].tenantId,
      projectId: identities.size === 1 ? eligibleFacts[0].projectId : null,
      repositoryId: eligibleFacts.length ? eligibleFacts[0].repositoryId : null,
      workspaceId: facts[0].workspaceId,
      state,
      hosts: facts,
      reconciliation: {
        status: reasons.length ? "CONFLICT" : eligibleFacts.length ? "RESOLVED_BY_ELIGIBILITY_AND_AGREEMENT" : state,
        policy: "TRUSTED_RUNNER_FACTS_SAME_AUTHORITY; FRESH_FACTS_ONLY; DIVERGENT_RUNNER_GENERATIONS_ARE_NOT_COMPARABLE",
        reasons,
        conflictingFields,
        eligibleHostIds: eligibleFacts.map((fact) => fact.hostId),
        ignoredClaims: ineligibleFacts.map((fact) => ({
          hostId: fact.hostId,
          trust: fact.trust,
          authorityLevel: fact.authorityLevel,
          freshness: fact.factFreshness,
          generation: fact.snapshotRevision,
          source: fact.factSource,
        })),
        agreedWorkspaceState: reasons.length ? null : agreedWorkspaceState,
        canonicalReceipt,
        selectedFact: null,
      },
    };
  });
  const sessions = workspaceRows.filter((row) => row.sessionState === "ACTIVE");
  const local = input.localAuthorityStatus && input.localAuthorityStatus !== "OBSERVED"
    ? null : input.localMissionControl;
  const localSessionProjection = local?.sessions && typeof local.sessions === "object"
    ? local.sessions as Record<string, unknown> : null;
  const localActiveSessions = localSessionProjection && Array.isArray(localSessionProjection.active)
    ? localSessionProjection.active.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const activeSessionsById = new Map<string, Record<string, unknown>>();
  for (const row of [...sessions, ...localActiveSessions]) {
    const id = typeof row.sessionId === "string" ? row.sessionId
      : typeof row.session_id === "string" ? row.session_id : null;
    if (id) activeSessionsById.set(id, row);
  }
  const activeSessions = [...activeSessionsById.values()];
  const localDevelopment = local?.development_state && typeof local.development_state === "object"
    ? local.development_state as Record<string, unknown> : null;
  const localUserWorkspace = local?.user_workspace && typeof local.user_workspace === "object"
    ? local.user_workspace as Record<string, unknown> : null;
  const canonical = freshCanonicalProjection(local?.repository, now) ?? { status: "UNKNOWN", reason: "local_authority_snapshot_unavailable" };
  const userWorkspace = freshEvidenceProjection(localUserWorkspace, now) ?? { state: "UNKNOWN", reason: "local_authority_snapshot_unavailable" };
  const unpushed = freshEvidenceProjection(localDevelopment?.unpushed_intended_commits, now) ?? { state: "UNKNOWN", count: null };
  const pushed = freshEvidenceProjection(localDevelopment?.pushed_unintegrated_work, now) ?? { state: "UNKNOWN", count: null };
  const integrated = freshEvidenceProjection(localDevelopment?.integrated_work, now) ?? { state: "UNKNOWN", count: null };
  const patchEquivalent = freshEvidenceProjection(localDevelopment?.semantic_equivalent_integration, now) ?? { state: "UNKNOWN", count: null };
  const developmentIntegration = localDevelopment ? { ...localDevelopment,
    unpushed_intended_commits: unpushed,
    pushed_unintegrated_work: pushed,
    integrated_work: integrated,
    semantic_equivalent_integration: patchEquivalent,
    remote_workspace_states: freshRemoteWorkspaceStates(localDevelopment.remote_workspace_states, now),
  } : { state: "UNKNOWN", reason: "local_authority_snapshot_unavailable" };
  return {
    tenantId,
    generatedAt: now.toISOString(),
    authority: "runner-control-plane",
    workspaces: { count: workspaceRows.length, observed: workspaceRows },
    workspaceGroups: { count: workspaces.length, observed: workspaces },
    canonical,
    userWorkspace,
    developmentIntegration,
    worktreeLifecycle: local?.worktrees ?? { state: "UNKNOWN", reason: "local_authority_snapshot_unavailable" },
    production: local?.production ?? { status: "UNKNOWN", reason: "SPEC-295 normalized evidence unavailable" },
    localAuthorityStatus: input.localAuthorityStatus ?? "UNAVAILABLE",
    localAuthorityObservedAt: input.localAuthorityObservedAt?.toISOString() ?? null,
    hosts: { count: rows.length, observed: rows.map((row) => ({
      hostId: row.runnerId,
      agentIdentity: row.runnerId,
      provider: "UNKNOWN",
      runnerProfile: row.profile,
      ownerUserId: row.ownerUserId,
      trust: row.revokedAt ? "REVOKED" : row.trustState === "trusted" ? "TRUSTED" : "UNTRUSTED",
      status: row.status,
      activeSessionId: row.activeSessionId,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    })) },
    sessions: { activeCount: activeSessions.length, active: activeSessions },
    workspaceConflicts: workspaces.filter((row) => row.state === "CONFLICT"),
    pushState: pushed,
    integrationState: integrated,
    semanticEquivalentIntegration: patchEquivalent,
    convergenceReceipt: localUserWorkspace?.convergence_receipt ?? null,
    recoveryState: localDevelopment?.recovery_pending ?? { state: "UNKNOWN", reason: "Recovery receipts are stored by the local Workspace Authority registry" },
  };
}

/** Tenant and owner scoped cross-host projection over authenticated Runner snapshots. */
export async function getWorkspaceAuthorityProjectReadModel(input: ProjectWorkspaceInput) {
  if (!input.tenantId.trim() || !Number.isSafeInteger(input.actorId) || input.actorId <= 0)
    throw new Error("WORKSPACE_AUTHORITY_SCOPE_INVALID");
  const now = input.now ?? new Date();
  const db = getDb();
  const rows = await db.select({
    runnerId: runnerNodes.runnerId,
    tenantId: runnerNodes.tenantId,
    ownerUserId: runnerNodes.ownerUserId,
    nodeKind: runnerNodes.nodeKind,
    profile: runnerNodes.profile,
    displayName: runnerNodes.displayName,
    trustState: runnerNodes.trustState,
    status: runnerNodes.status,
    currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
    currentSnapshotJson: runnerNodes.currentSnapshotJson,
    snapshotObservedAt: runnerNodes.snapshotObservedAt,
    snapshotExpiresAt: runnerNodes.snapshotExpiresAt,
    lastSeenAt: runnerNodes.lastSeenAt,
    revokedAt: runnerNodes.revokedAt,
    activeSessionId: runnerNodes.activeSessionId,
  }).from(runnerNodes).where(and(
    eq(runnerNodes.tenantId, input.tenantId),
    or(isNull(runnerNodes.ownerUserId), eq(runnerNodes.ownerUserId, input.actorId)),
  ));

  const [latestAudit] = await db.select({ outputJson: workerJobs.outputJson, finishedAt: workerJobs.finishedAt })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.tenantId, input.tenantId),
      eq(workerJobs.jobType, "workspace.authority.audit"),
      inArray(workerJobs.status, ["completed", "succeeded"]),
    ))
    .orderBy(desc(workerJobs.finishedAt))
    .limit(1);
  const jobOutput = latestAudit?.outputJson && typeof latestAudit.outputJson === "object"
    ? latestAudit.outputJson as Record<string, unknown> : null;
  const auditOutput = jobOutput?.output && typeof jobOutput.output === "object"
    ? jobOutput.output as Record<string, unknown> : jobOutput;
  const localAudit = auditOutput?.localWorkspaceAudit && typeof auditOutput.localWorkspaceAudit === "object"
    ? auditOutput.localWorkspaceAudit as Record<string, unknown> : null;
  const missionControlEvidence = localAudit?.missionControl && typeof localAudit.missionControl === "object"
    ? localAudit.missionControl as Record<string, unknown> : null;
  const localMissionControl = missionControlEvidence?.status === "OBSERVED" && missionControlEvidence.result && typeof missionControlEvidence.result === "object"
    ? missionControlEvidence.result as Record<string, unknown> : null;
  const auditAgeMs = latestAudit?.finishedAt ? now.getTime() - latestAudit.finishedAt.getTime() : null;
  const localAuthorityStatus = auditAgeMs === null
    ? "UNAVAILABLE"
    : auditAgeMs < 0 || auditAgeMs > 15 * 60_000 || !localMissionControl
      ? "STALE"
      : "OBSERVED";

  return projectRunnerWorkspaceAuthority({ tenantId: input.tenantId, actorId: input.actorId, rows, now,
    localMissionControl: localAuthorityStatus === "OBSERVED" ? localMissionControl : null,
    localAuthorityStatus, localAuthorityObservedAt: latestAudit?.finishedAt ?? null,
  });
}
