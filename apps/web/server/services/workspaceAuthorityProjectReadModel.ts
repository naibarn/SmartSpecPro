import { and, eq, isNull, or } from "drizzle-orm";

import { runnerNodes } from "../../drizzle/schema";
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

export function projectRunnerWorkspaceAuthority(input: {
  tenantId: string;
  actorId: number;
  rows: RunnerAuthorityRow[];
  now: Date;
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
      agentIdentity: activeSession ? providerFact.provider : "UNKNOWN",
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
      contentFingerprint: workspace.contentFingerprint,
      convergenceState: "NOT_REPORTED" as const,
      localPath: null,
    }));
  });

  const byWorkspace = new Map<string, typeof workspaceRows>();
  for (const row of workspaceRows) {
    const key = row.workspaceId;
    byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), row]);
  }
  const workspaces = [...byWorkspace.values()].map((facts) => {
    const identities = new Set(facts.map((fact) => JSON.stringify([fact.projectId, fact.repositoryId])));
    const workspaceStates = new Set(facts.map((fact) => JSON.stringify([fact.observedSha, fact.branch, fact.dirty, fact.contentFingerprint])));
    const missingBinding = facts.some((fact) => !fact.projectId || !fact.repositoryId);
    const state = identities.size > 1 || workspaceStates.size > 1
      ? "CONFLICT"
      : missingBinding
        ? "UNBOUND"
        : facts.some((fact) => fact.hostState === "STALE")
          ? "STALE"
          : "OBSERVED";
    return { state, hosts: facts };
  });
  const sessions = workspaceRows.filter((row) => row.sessionState === "ACTIVE");
  return {
    tenantId,
    generatedAt: now.toISOString(),
    authority: "runner-control-plane",
    workspaces: { count: workspaceRows.length, observed: workspaceRows },
    workspaceGroups: { count: workspaces.length, observed: workspaces },
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
    sessions: { activeCount: sessions.length, active: sessions },
    workspaceConflicts: workspaces.filter((row) => row.state === "CONFLICT"),
    pushState: { state: "UNKNOWN", reason: "Runner snapshots do not publish upstream parity" },
    integrationState: { state: "UNKNOWN", reason: "No canonical integration receipt is attached to this Runner snapshot" },
    convergenceReceipt: null,
    recoveryState: { state: "UNKNOWN", reason: "Recovery receipts are stored by the local Workspace Authority registry" },
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

  return projectRunnerWorkspaceAuthority({ tenantId: input.tenantId, actorId: input.actorId, rows, now });
}
