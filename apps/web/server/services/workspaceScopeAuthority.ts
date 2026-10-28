import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  canonicalProjectMemberships,
  canonicalProjects,
  canonicalProjectWorkspaceBindings,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type AuthorizedWorkspaceScopeBinding = {
  tenantId: string;
  projectId: string;
  projectTitle: string;
  repositoryId: string;
  scope: string;
  runnerId: string;
  workspaceId: string;
  memberRole: "owner" | "editor";
};

export type WorkspaceScopeKey = Pick<
  AuthorizedWorkspaceScopeBinding,
  "tenantId" | "projectId" | "repositoryId" | "runnerId" | "workspaceId"
>;

export function workspaceScopeKey(value: WorkspaceScopeKey): string {
  return JSON.stringify([
    value.tenantId,
    value.projectId,
    value.repositoryId,
    value.runnerId,
    value.workspaceId,
  ]);
}

/**
 * Returns only persisted scope bindings whose canonical Project is active and
 * for which this actor has an active owner/editor membership. Runner claims do
 * not participate in establishing scope; callers must reconcile these records
 * with the current trusted Runner snapshot before presenting or using them.
 */
export async function listAuthorizedWorkspaceScopeBindings(input: {
  tenantId: string;
  actorId: number;
  scope?: string;
}): Promise<AuthorizedWorkspaceScopeBinding[]> {
  if (
    !input.tenantId.trim() ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId <= 0
  )
    return [];
  const db = getDb();
  const rows = await db
    .select({
      tenantId: canonicalProjectWorkspaceBindings.tenantId,
      projectId: canonicalProjectWorkspaceBindings.projectId,
      projectTitle: canonicalProjects.title,
      repositoryId: canonicalProjectWorkspaceBindings.repositoryId,
      scope: canonicalProjectWorkspaceBindings.scope,
      runnerId: canonicalProjectWorkspaceBindings.runnerId,
      workspaceId: canonicalProjectWorkspaceBindings.workspaceId,
      memberRole: canonicalProjectMemberships.role,
    })
    .from(canonicalProjectWorkspaceBindings)
    .innerJoin(
      canonicalProjects,
      and(
        eq(
          canonicalProjects.tenantId,
          canonicalProjectWorkspaceBindings.tenantId
        ),
        eq(
          canonicalProjects.projectId,
          canonicalProjectWorkspaceBindings.projectId
        ),
        eq(canonicalProjects.lifecycle, "ACTIVE")
      )
    )
    .innerJoin(
      canonicalProjectMemberships,
      and(
        eq(
          canonicalProjectMemberships.tenantId,
          canonicalProjectWorkspaceBindings.tenantId
        ),
        eq(
          canonicalProjectMemberships.projectId,
          canonicalProjectWorkspaceBindings.projectId
        ),
        eq(canonicalProjectMemberships.principalId, `user:${input.actorId}`),
        eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
        isNull(canonicalProjectMemberships.revokedAt),
        inArray(canonicalProjectMemberships.role, ["owner", "editor"])
      )
    )
    .where(
      and(
        eq(canonicalProjectWorkspaceBindings.tenantId, input.tenantId),
        eq(canonicalProjectWorkspaceBindings.lifecycle, "ACTIVE"),
        isNull(canonicalProjectWorkspaceBindings.revokedAt),
        ...(input.scope
          ? [eq(canonicalProjectWorkspaceBindings.scope, input.scope)]
          : [])
      )
    );
  return rows.filter(
    (row): row is typeof row & { memberRole: "owner" | "editor" } =>
      row.memberRole === "owner" || row.memberRole === "editor"
  );
}

/**
 * Lists persisted platform-bound workspace identities for fail-closed
 * filtering, including revoked historical bindings so they cannot fall back
 * to ordinary workspace presentation.
 */
export async function listRestrictedPlatformWorkspaceKeys(input: {
  tenantId: string;
}): Promise<WorkspaceScopeKey[]> {
  if (!input.tenantId.trim()) return [];
  const rows = await getDb()
    .select({
      tenantId: canonicalProjectWorkspaceBindings.tenantId,
      projectId: canonicalProjectWorkspaceBindings.projectId,
      repositoryId: canonicalProjectWorkspaceBindings.repositoryId,
      runnerId: canonicalProjectWorkspaceBindings.runnerId,
      workspaceId: canonicalProjectWorkspaceBindings.workspaceId,
    })
    .from(canonicalProjectWorkspaceBindings)
    .where(
      and(
        eq(canonicalProjectWorkspaceBindings.tenantId, input.tenantId),
        eq(canonicalProjectWorkspaceBindings.scope, "PLATFORM_ENGINEERING")
      )
    );
  return rows;
}

export function matchesWorkspaceScopeBinding<T extends WorkspaceScopeKey>(
  candidate: WorkspaceScopeKey,
  bindings: readonly T[]
): T | null {
  const key = workspaceScopeKey(candidate);
  return bindings.find(binding => workspaceScopeKey(binding) === key) ?? null;
}
