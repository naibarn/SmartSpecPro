import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";

import {
  canonicalProjectMemberships,
  canonicalProjects,
  canonicalProjectWorkspaceBindings,
  runnerNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  evaluateWorkspaceExecutionTarget,
  resolveWorkspaceDeploymentTarget,
  workspaceFactsFromSnapshot,
} from "./spec224WorkspaceSpecSet";

const PLATFORM_PROJECT_TYPES = ["platform-engineering", "platform-deployment"];

export type PlatformWorkspaceBindingCandidate = {
  runnerId: string;
  workspaceId: string;
  repositoryId: string;
  runnerProjectId: string;
  runnerDisplayName: string;
  deploymentTargetId: string | null;
};

export class PlatformWorkspaceBindingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PlatformWorkspaceBindingError";
  }
}

async function listOwnedPlatformProjects(input: {
  tenantId: string;
  actorId: number;
}) {
  return getDb()
    .select({
      projectId: canonicalProjects.projectId,
      title: canonicalProjects.title,
      projectType: canonicalProjects.projectType,
    })
    .from(canonicalProjects)
    .innerJoin(
      canonicalProjectMemberships,
      and(
        eq(canonicalProjectMemberships.tenantId, canonicalProjects.tenantId),
        eq(canonicalProjectMemberships.projectId, canonicalProjects.projectId),
        eq(canonicalProjectMemberships.principalId, `user:${input.actorId}`),
        eq(canonicalProjectMemberships.role, "owner"),
        eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
        isNull(canonicalProjectMemberships.revokedAt)
      )
    )
    .where(
      and(
        eq(canonicalProjects.tenantId, input.tenantId),
        eq(canonicalProjects.ownerPrincipalId, `user:${input.actorId}`),
        eq(canonicalProjects.lifecycle, "ACTIVE"),
        inArray(canonicalProjects.projectType, PLATFORM_PROJECT_TYPES)
      )
    );
}

async function currentRunnerWorkspace(input: {
  tenantId: string;
  actorId: number;
  runnerId: string;
  workspaceId: string;
}): Promise<PlatformWorkspaceBindingCandidate | null> {
  const now = new Date();
  const [runner] = await getDb()
    .select({
      runnerId: runnerNodes.runnerId,
      displayName: runnerNodes.displayName,
      currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
      currentSnapshotJson: runnerNodes.currentSnapshotJson,
      activeSessionId: runnerNodes.activeSessionId,
    })
    .from(runnerNodes)
    .where(
      and(
        eq(runnerNodes.tenantId, input.tenantId),
        eq(runnerNodes.runnerId, input.runnerId),
        eq(runnerNodes.trustState, "trusted"),
        eq(runnerNodes.status, "online"),
        isNull(runnerNodes.revokedAt),
        gt(runnerNodes.snapshotExpiresAt, now),
        lte(runnerNodes.snapshotObservedAt, now),
        or(
          isNull(runnerNodes.ownerUserId),
          eq(runnerNodes.ownerUserId, input.actorId)
        )
      )
    )
    .limit(1);
  if (
    !runner?.currentSnapshotRevision ||
    !runner.currentSnapshotJson ||
    !runner.activeSessionId
  )
    return null;

  const snapshot = runner.currentSnapshotJson as {
    runnerId?: unknown;
    runnerSessionId?: unknown;
  };
  if (
    snapshot.runnerId !== runner.runnerId ||
    snapshot.runnerSessionId !== runner.activeSessionId
  )
    return null;
  const workspace = workspaceFactsFromSnapshot(snapshot).find(
    candidate => candidate.workspaceId === input.workspaceId
  );
  if (!workspace?.projectId || !workspace.repositoryId) return null;
  return {
    runnerId: runner.runnerId,
    workspaceId: workspace.workspaceId,
    repositoryId: workspace.repositoryId,
    runnerProjectId: workspace.projectId,
    runnerDisplayName: runner.displayName,
    deploymentTargetId:
      resolveWorkspaceDeploymentTarget(workspace.repositoryId)?.id ?? null,
  };
}

export async function listPlatformWorkspaceBindingCandidates(input: {
  tenantId: string;
  actorId: number;
}) {
  const [projects, runners] = await Promise.all([
    listOwnedPlatformProjects(input),
    getDb()
      .select({
        runnerId: runnerNodes.runnerId,
        displayName: runnerNodes.displayName,
        currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
        currentSnapshotJson: runnerNodes.currentSnapshotJson,
        activeSessionId: runnerNodes.activeSessionId,
      })
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, input.tenantId),
          eq(runnerNodes.trustState, "trusted"),
          eq(runnerNodes.status, "online"),
          isNull(runnerNodes.revokedAt),
          gt(runnerNodes.snapshotExpiresAt, new Date()),
          lte(runnerNodes.snapshotObservedAt, new Date()),
          or(
            isNull(runnerNodes.ownerUserId),
            eq(runnerNodes.ownerUserId, input.actorId)
          )
        )
      ),
  ]);

  const workspaces = runners.flatMap(runner => {
    if (
      !runner.currentSnapshotRevision ||
      !runner.currentSnapshotJson ||
      !runner.activeSessionId
    )
      return [];
    const snapshot = runner.currentSnapshotJson as {
      runnerId?: unknown;
      runnerSessionId?: unknown;
    };
    if (
      snapshot.runnerId !== runner.runnerId ||
      snapshot.runnerSessionId !== runner.activeSessionId
    )
      return [];
    return workspaceFactsFromSnapshot(snapshot)
      .filter(workspace => workspace.projectId && workspace.repositoryId)
      .map(workspace => ({
        runnerId: runner.runnerId,
        workspaceId: workspace.workspaceId,
        repositoryId: workspace.repositoryId!,
        runnerProjectId: workspace.projectId!,
        runnerDisplayName: runner.displayName,
        deploymentTargetId:
          resolveWorkspaceDeploymentTarget(workspace.repositoryId)?.id ?? null,
      }));
  });
  return { projects, workspaces };
}

/** Bootstrap the single allowlisted Modular Core workspace as an owned platform Project. */
export async function createAndBindModularCoreWorkspace(input: {
  tenantId: string;
  actorId: number;
  runnerId: string;
  workspaceId: string;
}) {
  const workspace = await currentRunnerWorkspace(input);
  if (!workspace)
    throw new PlatformWorkspaceBindingError(
      "PLATFORM_RUNNER_WORKSPACE_NOT_CURRENT"
    );
  const target = resolveWorkspaceDeploymentTarget(workspace.repositoryId);
  if (target?.id !== "modular-debian-dev")
    throw new PlatformWorkspaceBindingError("MODULAR_CORE_REPOSITORY_REQUIRED");
  const targetAdmission = evaluateWorkspaceExecutionTarget({
    repositoryId: workspace.repositoryId,
    controlPlaneTargetId: process.env.SMARTSPEC_DEPLOYMENT_TARGET,
  });
  if (!targetAdmission.allowed)
    throw new PlatformWorkspaceBindingError(targetAdmission.code);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      workspace.runnerProjectId
    )
  )
    throw new PlatformWorkspaceBindingError(
      "MODULAR_CORE_PROJECT_ID_MUST_BE_UUID"
    );

  const projectId = workspace.runnerProjectId;
  const principalId = `user:${input.actorId}`;
  const db = getDb();
  return db.transaction(async tx => {
    const [existing] = await tx
      .select({
        projectId: canonicalProjects.projectId,
        title: canonicalProjects.title,
        projectType: canonicalProjects.projectType,
        ownerPrincipalId: canonicalProjects.ownerPrincipalId,
      })
      .from(canonicalProjects)
      .where(
        and(
          eq(canonicalProjects.tenantId, input.tenantId),
          eq(canonicalProjects.projectId, projectId)
        )
      )
      .for("update")
      .limit(1);

    if (
      existing &&
      (existing.projectType !== "platform-engineering" ||
        existing.ownerPrincipalId !== principalId)
    )
      throw new PlatformWorkspaceBindingError(
        "MODULAR_CORE_PROJECT_ID_ALREADY_OWNED"
      );

    const project =
      existing ??
      (
        await tx
          .insert(canonicalProjects)
          .values({
            tenantId: input.tenantId,
            projectId,
            projectType: "platform-engineering",
            title: "SmartAIHub Modular Core",
            ownerPrincipalId: principalId,
          })
          .returning({
            projectId: canonicalProjects.projectId,
            title: canonicalProjects.title,
            projectType: canonicalProjects.projectType,
            ownerPrincipalId: canonicalProjects.ownerPrincipalId,
          })
      )[0];
    if (!project)
      throw new PlatformWorkspaceBindingError(
        "MODULAR_CORE_PROJECT_CREATE_FAILED"
      );

    const [membership] = await tx
      .select({
        lifecycle: canonicalProjectMemberships.lifecycle,
        role: canonicalProjectMemberships.role,
      })
      .from(canonicalProjectMemberships)
      .where(
        and(
          eq(canonicalProjectMemberships.tenantId, input.tenantId),
          eq(canonicalProjectMemberships.projectId, projectId),
          eq(canonicalProjectMemberships.principalId, principalId)
        )
      )
      .for("update")
      .limit(1);
    if (
      membership &&
      (membership.lifecycle !== "ACTIVE" || membership.role !== "owner")
    )
      throw new PlatformWorkspaceBindingError(
        "MODULAR_CORE_OWNER_MEMBERSHIP_CONFLICT"
      );
    if (!membership)
      await tx.insert(canonicalProjectMemberships).values({
        tenantId: input.tenantId,
        projectId,
        principalId,
        role: "owner",
      });

    const prior = await tx
      .select()
      .from(canonicalProjectWorkspaceBindings)
      .where(
        and(
          eq(canonicalProjectWorkspaceBindings.tenantId, input.tenantId),
          eq(canonicalProjectWorkspaceBindings.runnerId, workspace.runnerId),
          eq(
            canonicalProjectWorkspaceBindings.workspaceId,
            workspace.workspaceId
          )
        )
      )
      .for("update");
    const exact = prior.find(
      row =>
        row.projectId === projectId &&
        row.repositoryId === workspace.repositoryId &&
        row.scope === "PLATFORM_ENGINEERING"
    );
    const conflicting = prior.some(
      row =>
        row.id !== exact?.id &&
        (row.lifecycle === "ACTIVE" || row.scope === "PLATFORM_ENGINEERING")
    );
    if (conflicting)
      throw new PlatformWorkspaceBindingError(
        "PLATFORM_RUNNER_WORKSPACE_ALREADY_BOUND"
      );
    if (!exact)
      await tx.insert(canonicalProjectWorkspaceBindings).values({
        tenantId: input.tenantId,
        projectId,
        repositoryId: workspace.repositoryId,
        scope: "PLATFORM_ENGINEERING",
        runnerId: workspace.runnerId,
        workspaceId: workspace.workspaceId,
        lifecycle: "ACTIVE",
        createdByPrincipalId: principalId,
      });
    else if (exact.lifecycle !== "ACTIVE" || exact.revokedAt)
      await tx
        .update(canonicalProjectWorkspaceBindings)
        .set({ lifecycle: "ACTIVE", revokedAt: null, updatedAt: new Date() })
        .where(eq(canonicalProjectWorkspaceBindings.id, exact.id));

    return {
      projectId,
      projectTitle: project.title,
      runnerId: workspace.runnerId,
      workspaceId: workspace.workspaceId,
      repositoryId: workspace.repositoryId,
      scope: "PLATFORM_ENGINEERING" as const,
      changed:
        !existing ||
        !membership ||
        !exact ||
        exact.lifecycle !== "ACTIVE" ||
        !!exact.revokedAt,
      deploymentTargetId: target.id,
      deploymentTargetDomain: target.domain,
    };
  });
}

export async function createPlatformWorkspaceBinding(input: {
  tenantId: string;
  actorId: number;
  projectId: string;
  runnerId: string;
  workspaceId: string;
}) {
  const [project] = (await listOwnedPlatformProjects(input)).filter(
    row => row.projectId === input.projectId
  );
  if (!project)
    throw new PlatformWorkspaceBindingError("PLATFORM_PROJECT_OWNER_REQUIRED");

  const workspace = await currentRunnerWorkspace(input);
  if (!workspace)
    throw new PlatformWorkspaceBindingError(
      "PLATFORM_RUNNER_WORKSPACE_NOT_CURRENT"
    );
  if (workspace.runnerProjectId !== project.projectId)
    throw new PlatformWorkspaceBindingError(
      "PLATFORM_RUNNER_PROJECT_ID_MISMATCH"
    );
  const targetAdmission = evaluateWorkspaceExecutionTarget({
    repositoryId: workspace.repositoryId,
    controlPlaneTargetId: process.env.SMARTSPEC_DEPLOYMENT_TARGET,
  });
  if (!targetAdmission.allowed)
    throw new PlatformWorkspaceBindingError(targetAdmission.code);

  const db = getDb();
  const result = await db.transaction(async tx => {
    const prior = await tx
      .select()
      .from(canonicalProjectWorkspaceBindings)
      .where(
        and(
          eq(canonicalProjectWorkspaceBindings.tenantId, input.tenantId),
          eq(canonicalProjectWorkspaceBindings.runnerId, input.runnerId),
          eq(canonicalProjectWorkspaceBindings.workspaceId, input.workspaceId)
        )
      )
      .for("update");

    const exact = prior.find(
      row =>
        row.projectId === project.projectId &&
        row.repositoryId === workspace.repositoryId &&
        row.scope === "PLATFORM_ENGINEERING"
    );
    const conflicting = prior.some(row => {
      const samePlatformIdentity =
        row.scope === "PLATFORM_ENGINEERING" &&
        row.projectId === project.projectId &&
        row.repositoryId === workspace.repositoryId;
      return (
        !samePlatformIdentity &&
        (row.lifecycle === "ACTIVE" || row.scope === "PLATFORM_ENGINEERING")
      );
    });
    if (conflicting)
      throw new PlatformWorkspaceBindingError(
        "PLATFORM_RUNNER_WORKSPACE_ALREADY_BOUND"
      );

    if (exact?.lifecycle === "ACTIVE" && !exact.revokedAt)
      return { changed: false, projectTitle: project.title };
    if (exact) {
      await tx
        .update(canonicalProjectWorkspaceBindings)
        .set({ lifecycle: "ACTIVE", revokedAt: null, updatedAt: new Date() })
        .where(eq(canonicalProjectWorkspaceBindings.id, exact.id));
      return { changed: true, projectTitle: project.title };
    }

    await tx.insert(canonicalProjectWorkspaceBindings).values({
      tenantId: input.tenantId,
      projectId: project.projectId,
      repositoryId: workspace.repositoryId,
      scope: "PLATFORM_ENGINEERING",
      runnerId: workspace.runnerId,
      workspaceId: workspace.workspaceId,
      lifecycle: "ACTIVE",
      createdByPrincipalId: `user:${input.actorId}`,
    });
    return { changed: true, projectTitle: project.title };
  });

  return {
    projectId: project.projectId,
    projectTitle: result.projectTitle,
    runnerId: workspace.runnerId,
    workspaceId: workspace.workspaceId,
    repositoryId: workspace.repositoryId,
    scope: "PLATFORM_ENGINEERING" as const,
    changed: result.changed,
  };
}
