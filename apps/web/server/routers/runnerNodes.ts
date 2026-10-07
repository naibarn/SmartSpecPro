import { and, desc, eq, isNull, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { isRunnerWorkspaceConvergenceState } from "../services/runnerContracts";
import { runnerNodes } from "../../drizzle/schema";

function tenantRequired(ctx: {
  tenantId?: unknown;
  user: { currentTenantId?: unknown };
}): string {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  if (tenantId == null || !String(tenantId).trim())
    throw new Error("Tenant context is required");
  return String(tenantId);
}

type SafeInventoryEntry = {
  id: string;
  label: string;
  kind: "tool" | "capability";
  version: string | null;
  status: string;
  availability: string;
  auth: string | null;
  health: string | null;
  policy: string | null;
  reasonCodes: string[];
};

function boundedText(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function safeInventory(
  input: unknown,
  kind: SafeInventoryEntry["kind"]
): SafeInventoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 64).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const id = boundedText(raw[kind === "tool" ? "toolId" : "capabilityId"], 160);
    const label = boundedText(
      kind === "tool" ? raw.displayName ?? id : raw.implementationId ?? id,
      160
    );
    if (!id || !label) return [];
    const reasonCodes = Array.isArray(raw.reasonCodes)
      ? raw.reasonCodes
          .map(value => boundedText(value, 80))
          .filter((value): value is string => Boolean(value))
          .slice(0, 12)
      : [];
    return [
      {
        id,
        label,
        kind,
        version: boundedText(raw.version ?? raw.contractVersion, 80),
        status: boundedText(raw.trustState ?? raw.policyDecision, 80) ?? "unknown",
        availability: boundedText(raw.availabilityState, 80) ?? "unknown",
        auth: boundedText(raw.authState, 80),
        health: boundedText(raw.healthState, 80),
        policy: boundedText(raw.policyDecision, 80),
        reasonCodes,
      },
    ];
  });
}

export function safeWorkspaceIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map(value => value.trim())
        .filter(value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value))
    ),
  ].slice(0, 64);
}

export type SafeWorkspaceFact = {
  workspaceId: string;
  projectId: string | null;
  repositoryId: string | null;
  displayName: string | null;
  gitHead: string | null;
  gitBranch: string | null;
  dirty: boolean | null;
  taskId: string | null;
  convergenceState: string;
  convergenceCanonicalSha: string | null;
};

export function safeWorkspaceFacts(
  input: unknown,
  workspaceIds: string[]
): SafeWorkspaceFact[] {
  if (!Array.isArray(input)) return [];
  const allowedIds = new Set(workspaceIds);
  const seen = new Set<string>();
  return input.slice(0, 64).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const workspaceId = boundedText(raw.workspaceId, 160);
    if (!workspaceId || !allowedIds.has(workspaceId) || seen.has(workspaceId)) return [];
    seen.add(workspaceId);
    const gitHead = boundedText(raw.gitHead, 64);
    const gitBranch = boundedText(raw.gitBranch, 160);
    const projectId = boundedText(raw.projectId, 200);
    const repositoryId = boundedText(raw.repositoryId, 200);
    const taskId = boundedText(raw.taskId, 160);
    const convergenceState = isRunnerWorkspaceConvergenceState(raw.convergenceState)
      ? raw.convergenceState
      : "NOT_REPORTED";
    const rawConvergenceSha = boundedText(raw.convergenceCanonicalSha, 64);
    const convergenceCanonicalSha = rawConvergenceSha && /^[a-f0-9]{40,64}$/i.test(rawConvergenceSha) ? rawConvergenceSha : null;
    const safeIdentity = (value: string | null) => value && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) && !value.includes("://") && !value.includes("@") && !value.includes("//") && !value.includes("..") ? value : null;
    return [{
      workspaceId,
      projectId: safeIdentity(projectId),
      repositoryId: safeIdentity(repositoryId),
      displayName: boundedText(raw.displayName, 160),
      gitHead: gitHead && /^[a-f0-9]{40,64}$/i.test(gitHead) ? gitHead : null,
      gitBranch: gitBranch && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(gitBranch) && !gitBranch.includes("..") && !gitBranch.includes("//") ? gitBranch : null,
      dirty: typeof raw.dirty === "boolean" ? raw.dirty : null,
      taskId: taskId && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(taskId) ? taskId : null,
      convergenceState: convergenceState === "USER_WORKSPACE_CONVERGED" && !convergenceCanonicalSha ? "NOT_REPORTED" : convergenceState,
      convergenceCanonicalSha,
    }];
  });
}

export const runnerNodesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantRequired(ctx);
    const db = getDb();
    const rows = await db
      .select()
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, tenantId),
          or(
            isNull(runnerNodes.ownerUserId),
            eq(runnerNodes.ownerUserId, ctx.user.id)
          )
        )
      )
      .orderBy(desc(runnerNodes.updatedAt))
      .limit(100);
    return {
      runners: rows.map(row => {
        const snapshot = row.currentSnapshotJson as {
          toolInventory?: unknown[];
          capabilityInventory?: unknown[];
          workspaceIds?: unknown[];
          workspaces?: unknown[];
          platform?: {
            os: string;
            architecture: string;
            target: string;
          };
        } | null;
        const toolInventory = safeInventory(snapshot?.toolInventory, "tool");
        const capabilityInventory = safeInventory(
          snapshot?.capabilityInventory,
          "capability"
        );
        const workspaceIds = safeWorkspaceIds(snapshot?.workspaceIds);
        const workspaces = safeWorkspaceFacts(snapshot?.workspaces, workspaceIds);
        const snapshotExpired = Boolean(
          row.snapshotExpiresAt && row.snapshotExpiresAt.getTime() <= Date.now()
        );
        const displayState =
          row.trustState !== "trusted"
            ? "verification_pending"
            : row.status === "revoked"
              ? "revoked"
              : row.status === "offline"
                ? "runner_unavailable"
                : row.status === "degraded" || snapshotExpired
                  ? "reconciling"
                  : !row.currentSnapshotRevision
                    ? "waiting_for_compatible_runner"
                    : "ready";
        return {
          runnerId: row.runnerId,
          displayName: row.displayName,
          profile: row.profile,
          nodeKind: row.nodeKind,
          status: row.status,
          trustState: row.trustState,
          snapshotRevision: row.currentSnapshotRevision,
          snapshotExpiresAt: row.snapshotExpiresAt?.toISOString() ?? null,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
          platform: snapshot?.platform ?? null,
          displayState,
          toolCount: toolInventory.length,
          capabilityCount: capabilityInventory.length,
          workspaceIds,
          workspaces,
          toolInventory,
          capabilityInventory,
        };
      }),
    };
  }),
});
