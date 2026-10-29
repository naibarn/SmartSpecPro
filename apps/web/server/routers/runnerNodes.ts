import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { isRunnerWorkspaceConvergenceState } from "../services/runnerContracts";
import { runnerNodes } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
  CLOUDFLARE_STAGING_EXECUTOR_PROFILE,
  CLOUDFLARE_STAGING_EXECUTOR_TARGET,
  validateCloudflareStagingExecutorRegistration,
} from "../services/cloudflareStagingExecutorIdentityService";
import { getRunnerCompanionState } from "../services/runnerCompanionViewState";
import { projectRunnerDisplayName, projectRunnerWorkspacePresentation } from "../../shared/projectIdentityPresentation";
import { runnerReadinessForDisplay } from "../services/runnerGateway";
import { defaultSpec224AuthorizationService } from "../services/spec224AuthorizationService";
import { listAuthorizedWorkspaceScopeBindings, listRestrictedPlatformWorkspaceKeys, workspaceScopeKey } from "../services/workspaceScopeAuthority";

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
  rootId: string | null;
  kind: "workspace" | "project" | null;
  displayName: string | null;
  gitHead: string | null;
  gitBranch: string | null;
  dirty: boolean | null;
  dirtyPaths: string[] | null;
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
    const dirtyPaths = Array.isArray(raw.dirtyPaths) && raw.dirtyPaths.length <= 4_096 && raw.dirtyPaths.every(path =>
      typeof path === "string" && path.length > 0 && path.length <= 512 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(part => !part || part === "." || part === "..")
    ) ? [...new Set(raw.dirtyPaths as string[])] : null;
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
      rootId: typeof raw.rootId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(raw.rootId) && !raw.rootId.includes("..") ? raw.rootId : null,
      kind: raw.kind === "workspace" || raw.kind === "project" ? raw.kind : null,
      displayName: boundedText(raw.displayName, 160),
      gitHead: gitHead && /^[a-f0-9]{40,64}$/i.test(gitHead) ? gitHead : null,
      gitBranch: gitBranch && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(gitBranch) && !gitBranch.includes("..") && !gitBranch.includes("//") ? gitBranch : null,
      dirty: typeof raw.dirty === "boolean" ? raw.dirty : null,
      dirtyPaths,
      taskId: taskId && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(taskId) ? taskId : null,
      convergenceState: convergenceState === "USER_WORKSPACE_CONVERGED" && !convergenceCanonicalSha ? "NOT_REPORTED" : convergenceState,
      convergenceCanonicalSha,
    }];
  });
}

export type SafeRunWorkspaceLifecycle = "ACTIVE" | "RECOVERY_REQUIRED" | "COMPLETED" | "CANCELLED" | "FAILED";

export function safeRunWorkspaceFacts(input: unknown, sourceWorkspaces?: SafeWorkspaceFact[]) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const sources = sourceWorkspaces ? new Map(sourceWorkspaces.map(workspace => [workspace.workspaceId, workspace])) : null;
  return input.slice(0, 64).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const identity = (value: unknown, max = 160) => typeof value === "string" && value.length <= max &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) && !value.includes("..") ? value : null;
    const workspaceId = identity(raw.workspaceId);
    const runId = identity(raw.runId);
    const sourceWorkspaceId = identity(raw.sourceWorkspaceId);
    const attemptId = raw.attemptId;
    const projectId = raw.projectId == null ? null : identity(raw.projectId, 200);
    const source = sources?.get(sourceWorkspaceId ?? "");
    const lifecycle = raw.lifecycle;
    const lifecycles: readonly SafeRunWorkspaceLifecycle[] = ["ACTIVE", "RECOVERY_REQUIRED", "COMPLETED", "CANCELLED", "FAILED"];
    if (!workspaceId || !runId || !sourceWorkspaceId || seen.has(workspaceId) ||
      !Number.isSafeInteger(attemptId) || (attemptId as number) < 1 ||
      (raw.projectId != null && !projectId) ||
      typeof lifecycle !== "string" || !lifecycles.includes(lifecycle as SafeRunWorkspaceLifecycle)) return [];
    if (sources && (!source || source.projectId !== projectId)) return [];
    seen.add(workspaceId);
    return [{ workspaceId, runId, attemptId: attemptId as number, sourceWorkspaceId, projectId, lifecycle: lifecycle as SafeRunWorkspaceLifecycle }];
  });
}

export const runnerNodesRouter = router({
  companionState: protectedProcedure.query(({ ctx }) => getRunnerCompanionState({
    tenantId: tenantRequired(ctx),
    userId: ctx.user.id,
  })),

  list: protectedProcedure
    .input(z.object({ viewMode: z.enum(["simple", "developer"]).default("simple") }).optional())
    .query(async ({ ctx, input }) => {
    const tenantId = tenantRequired(ctx);
    const viewMode = input?.viewMode ?? "simple";
    const db = getDb();
    const [rows, authorizedPlatformBindings, restrictedPlatformKeys] = await Promise.all([db
      .select()
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, tenantId),
          ne(runnerNodes.profile, CLOUDFLARE_STAGING_EXECUTOR_PROFILE),
          or(
            isNull(runnerNodes.ownerUserId),
            eq(runnerNodes.ownerUserId, ctx.user.id)
          )
        )
      )
      .orderBy(desc(runnerNodes.updatedAt))
      .limit(100),
      listAuthorizedWorkspaceScopeBindings({ tenantId, actorId: ctx.user.id, scope: "PLATFORM_ENGINEERING" }),
      listRestrictedPlatformWorkspaceKeys({ tenantId }),
    ]);
    const authorizedPlatformBindingKeys = new Set(authorizedPlatformBindings.map(workspaceScopeKey));
    const restrictedPlatformWorkspaceKeys = new Set(restrictedPlatformKeys.map(binding => JSON.stringify([binding.tenantId, binding.runnerId, binding.workspaceId])));
    return {
      runners: rows.map(row => {
        const snapshot = row.currentSnapshotJson as {
          toolInventory?: unknown[];
          capabilityInventory?: unknown[];
          workspaceIds?: unknown[];
          workspaces?: unknown[];
          runWorkspaces?: unknown[];
          platform?: {
            os: string;
            architecture: string;
            target: string;
            machineName?: string | null;
          };
        } | null;
        const toolInventory = safeInventory(snapshot?.toolInventory, "tool");
        const capabilityInventory = safeInventory(
          snapshot?.capabilityInventory,
          "capability"
        );
        const workspaceIds = safeWorkspaceIds(snapshot?.workspaceIds);
        const workspaces = safeWorkspaceFacts(snapshot?.workspaces, workspaceIds).flatMap(workspace => {
          const restricted = restrictedPlatformWorkspaceKeys.has(JSON.stringify([tenantId, row.runnerId, workspace.workspaceId]));
          const scopeKey = workspaceScopeKey({ tenantId, projectId: workspace.projectId ?? "", repositoryId: workspace.repositoryId ?? "", runnerId: row.runnerId, workspaceId: workspace.workspaceId });
          const authorizedBinding = authorizedPlatformBindingKeys.has(scopeKey)
            ? authorizedPlatformBindings.find(binding => workspaceScopeKey(binding) === scopeKey) ?? null
            : null;
        const currentTrustedRunner = row.trustState === "trusted" && row.status === "online" && !row.revokedAt &&
            Boolean(snapshot?.runnerId === row.runnerId && row.activeSessionId && snapshot?.runnerSessionId === row.activeSessionId &&
              row.currentSnapshotRevision && row.snapshotExpiresAt && row.snapshotExpiresAt > new Date() &&
              row.snapshotObservedAt && row.snapshotObservedAt <= new Date());
          const currentPlatformBinding = Boolean(authorizedBinding && currentTrustedRunner &&
            authorizedBinding.projectId === workspace.projectId && authorizedBinding.repositoryId === workspace.repositoryId);
          if (restricted && !currentPlatformBinding) return [];
          const presented = projectRunnerWorkspacePresentation({
            actorId: ctx.user.id,
            ownerUserId: row.ownerUserId,
            runnerProfile: row.profile,
            nodeKind: row.nodeKind,
            mode: viewMode,
            ...workspace,
          });
          if (!currentPlatformBinding || !authorizedBinding) return [presented];
          return [{
            ...presented,
            provenance: "platform_engineering_authorized" as const,
            scope: "PLATFORM_ENGINEERING" as const,
            displayName: authorizedBinding.projectTitle,
            ...(viewMode === "developer" ? {
              workspaceId: workspace.workspaceId,
              ...(workspace.rootId ? { rootId: workspace.rootId } : {}),
              ...(workspace.kind ? { kind: workspace.kind } : {}),
              ...(workspace.projectId ? { projectId: workspace.projectId } : {}),
              ...(workspace.repositoryId ? { repositoryId: workspace.repositoryId } : {}),
              ...(workspace.gitHead ? { gitHead: workspace.gitHead } : {}),
              ...(workspace.gitBranch ? { gitBranch: workspace.gitBranch } : {}),
              dirty: workspace.dirty,
              dirtyPaths: workspace.dirtyPaths,
            } : {}),
          }];
        });
        const runWorkspaces = viewMode === "developer" && row.profile === "local_device" && row.ownerUserId === ctx.user.id
          ? safeRunWorkspaceFacts(snapshot?.runWorkspaces, safeWorkspaceFacts(snapshot?.workspaces, workspaceIds))
          : [];
        const snapshotExpired = Boolean(
          row.snapshotExpiresAt && row.snapshotExpiresAt.getTime() <= Date.now()
        );
        const snapshotReadiness = runnerReadinessForDisplay({
          status: row.status,
          profile: row.profile,
          revokedAt: row.revokedAt,
          lastSeenAt: row.lastSeenAt,
          snapshotObservedAt: row.snapshotObservedAt,
          snapshotExpiresAt: row.snapshotExpiresAt,
          activeSessionId: row.activeSessionId,
          currentSnapshotJson: row.currentSnapshotJson,
        });
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
          displayName: projectRunnerDisplayName({
            actorId: ctx.user.id,
            ownerUserId: row.ownerUserId,
            runnerProfile: row.profile,
            nodeKind: row.nodeKind,
            displayName: row.displayName,
          }),
          profile: row.profile,
          nodeKind: row.nodeKind,
          status: row.status,
          trustState: row.trustState,
          snapshotRevision: row.currentSnapshotRevision,
          snapshotExpiresAt: row.snapshotExpiresAt?.toISOString() ?? null,
          capabilitySnapshotPersisted: Boolean(row.currentSnapshotRevision && row.currentSnapshotJson),
          capabilitySnapshotCurrent: snapshotReadiness.snapshotCurrent,
          capabilityAckState: !row.currentSnapshotRevision
            ? "missing"
            : snapshotReadiness.snapshotCurrent
              ? "applied"
              : "stale",
          readinessStatus: snapshotReadiness.status,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
          platform: snapshot?.platform ? {
            ...snapshot.platform,
            machineName: row.profile === "local_device" && row.ownerUserId === ctx.user.id
              ? snapshot.platform.machineName ?? null
              : null,
          } : null,
          displayState,
          toolCount: toolInventory.length,
          capabilityCount: capabilityInventory.length,
          workspaceCount: workspaceIds.length,
          workspaces,
          runWorkspaces,
          toolInventory,
          capabilityInventory,
        };
      }),
    };
  }),

  workspaceReadiness: protectedProcedure
    .input(z.object({
      runnerId: z.string().trim().min(1).max(160),
      workspaceId: z.string().trim().min(1).max(200),
      provider: z.enum(["codex", "claude_code", "microsoft_copilot"]).default("codex"),
    }))
    .query(async ({ ctx, input }) => defaultSpec224AuthorizationService.runnerReadiness({
      context: { tenantId: tenantRequired(ctx), actorId: ctx.user.id },
      runnerId: input.runnerId,
      workspaceId: input.workspaceId,
    })),

  registerCloudflareStagingExecutor: adminProcedure
    .input(z.object({
      tenantId: z.string().trim().min(1).max(36),
      executorId: z.string().trim().min(1).max(128),
      publicKey: z.string().trim().min(1).max(4096),
      expiresAt: z.string().datetime({ offset: true }),
    }))
    .mutation(async ({ ctx, input }) => {
      let registration: ReturnType<typeof validateCloudflareStagingExecutorRegistration>;
      try {
        registration = validateCloudflareStagingExecutorRegistration({
          executorId: input.executorId,
          publicKey: input.publicKey,
          expiresAt: new Date(input.expiresAt),
        });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid executor registration" });
      }
      const db = getDb();
      const [created] = await db.insert(runnerNodes).values({
        runnerId: registration.executorId,
        tenantId: input.tenantId,
        ownerUserId: ctx.user.id,
        nodeKind: "service_executor",
        profile: CLOUDFLARE_STAGING_EXECUTOR_PROFILE,
        deviceId: null,
        displayName: "Cloudflare Staging Deployment Executor",
        trustState: "trusted",
        status: "registered",
        currentSnapshotRevision: `ed25519:${registration.fingerprint.slice(0, 24)}`,
        currentSnapshotJson: {
          cloudflareStagingExecutor: {
            version: 1,
            publicKey: registration.publicKey,
            fingerprint: registration.fingerprint,
            target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
            capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
          },
        },
        snapshotObservedAt: new Date(),
        snapshotExpiresAt: registration.expiresAt,
      }).onConflictDoNothing().returning({ runnerId: runnerNodes.runnerId });
      if (!created) throw new TRPCError({ code: "CONFLICT", message: "Executor ID is already registered" });
      return {
        executorId: registration.executorId,
        tenantId: input.tenantId,
        target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
        capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
        publicKeyFingerprint: registration.fingerprint,
        expiresAt: registration.expiresAt.toISOString(),
      };
    }),

  revokeCloudflareStagingExecutor: adminProcedure
    .input(z.object({ executorId: z.string().trim().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const now = new Date();
      const [revoked] = await getDb().update(runnerNodes).set({
        status: "revoked",
        trustState: "revoked",
        revokedAt: now,
        updatedAt: now,
      }).where(and(
        eq(runnerNodes.runnerId, input.executorId),
        eq(runnerNodes.profile, CLOUDFLARE_STAGING_EXECUTOR_PROFILE),
        isNull(runnerNodes.revokedAt),
      )).returning({ runnerId: runnerNodes.runnerId });
      return { revoked: Boolean(revoked) };
    }),
});
