import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const target = new URL(databaseUrl);
if (
  enabled &&
  (!/^(localhost|127\.0\.0\.1)$/.test(target.hostname) ||
    !/^spec224_[a-z0-9_-]*_test$/i.test(target.pathname.slice(1)))
) {
  throw new Error(
    "WORKSPACE_SCOPE_AUTHORITY_REQUIRES_DISPOSABLE_LOOPBACK_SPEC224_DATABASE"
  );
}
if (enabled) process.env.DATABASE_URL = databaseUrl;
const db = postgres(databaseUrl, { max: 4 });
const describeDb = enabled ? describe : describe.skip;
const migrationPath = resolve(
  import.meta.dirname,
  "../../../drizzle/0415_spec293_canonical_project_workspace_bindings.sql"
);
const tenantId = `scope-${randomUUID()}`.slice(0, 36);
const projectId = `project-${randomUUID()}`.slice(0, 36);
const creatorProjectId = `creator-${randomUUID()}`.slice(0, 36);
const runnerId = `runner-${randomUUID()}`;
const workspaceId = `workspace-${randomUUID()}`;
const creatorWorkspaceId = `creator-workspace-${randomUUID()}`;
const repositoryId = "smartspecpro";
const sessionId = `session-${randomUUID()}`;
let actorId = 0;
let otherActorId = 0;

async function provision() {
  const [owner] = await db`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`scope-owner-${tenantId}`}, 'admin', 'free', 0, false) RETURNING id
  `;
  const [other] = await db`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`scope-other-${tenantId}`}, 'admin', 'free', 0, false) RETURNING id
  `;
  actorId = Number(owner.id);
  otherActorId = Number(other.id);
  await db`
    INSERT INTO tenants ("id", "slug", "name", "ownerId", "isActive", "status", "plan", created_at, "createdAt", "updatedAt")
    VALUES (${tenantId}, ${tenantId}, 'SPEC-293 Workspace Scope Fixture', ${actorId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
  `;
  await db`UPDATE users SET "currentTenantId" = ${tenantId} WHERE id IN (${actorId}, ${otherActorId})`;
  await db`
    INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
    VALUES (${projectId}, ${tenantId}, 'platform-engineering', 'SmartAIHub Platform Engineering', ${`user:${actorId}`})
  `;
  await db`
    INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role, lifecycle)
    VALUES (${tenantId}, ${projectId}, ${`user:${actorId}`}, 'owner', 'ACTIVE')
  `;
  await db`
    INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
    VALUES (${creatorProjectId}, ${tenantId}, 'admin-creator', 'Admin Creator Project', ${`user:${actorId}`})
  `;
  await db`
    INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role, lifecycle)
    VALUES (${tenantId}, ${creatorProjectId}, ${`user:${actorId}`}, 'owner', 'ACTIVE')
  `;
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const snapshot = {
    runnerId,
    runnerSessionId: sessionId,
    workspaceIds: [workspaceId, creatorWorkspaceId],
    workspaces: [
      {
        workspaceId,
        projectId,
        repositoryId,
        displayName: "SmartSpecPro",
        kind: "project",
        gitHead: "a".repeat(40),
        gitBranch: "main",
        dirty: false,
      },
      {
        workspaceId: creatorWorkspaceId,
        projectId: "admin-creator-project",
        repositoryId: "admin-creator-repo",
        displayName: "SmartSpecPro",
        kind: "project",
        gitHead: "b".repeat(40),
        gitBranch: "main",
        dirty: false,
      },
    ],
  };
  await db`
    INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "displayName", "trustState", "status", "currentSnapshotRevision", "currentSnapshotJson", "snapshotObservedAt", "snapshotExpiresAt", "activeSessionId", "lastSeenAt")
    VALUES (${runnerId}, ${tenantId}, ${actorId}, 'local_device', 'local_device', 'Debian SmartAIHub Runner', 'trusted', 'online', 'snapshot-scope-1', ${db.json(snapshot)}, NOW(), ${expiresAt}, ${sessionId}, NOW())
  `;
  await db`
    INSERT INTO canonical_project_workspace_bindings (tenant_id, project_id, repository_id, scope, runner_id, workspace_id, created_by_principal_id)
    VALUES (${tenantId}, ${projectId}, ${repositoryId}, 'PLATFORM_ENGINEERING', ${runnerId}, ${workspaceId}, ${`user:${actorId}`})
  `;
  await db`
    INSERT INTO canonical_project_workspace_bindings (tenant_id, project_id, repository_id, scope, runner_id, workspace_id, created_by_principal_id)
    VALUES (${tenantId}, ${creatorProjectId}, 'admin-creator-repo', 'ADMIN_CREATOR', ${runnerId}, ${creatorWorkspaceId}, ${`user:${actorId}`})
  `;
}

afterAll(async () => {
  if (enabled) {
    await db`DELETE FROM canonical_projects WHERE tenant_id = ${tenantId}`;
    await db`DELETE FROM runner_nodes WHERE "runnerId" = ${runnerId}`;
    await db`UPDATE users SET "currentTenantId" = NULL WHERE id IN (${actorId}, ${otherActorId})`;
    await db`DELETE FROM tenants WHERE id = ${tenantId}`;
    await db`DELETE FROM users WHERE id IN (${actorId}, ${otherActorId})`;
  }
  await db.end();
});

describeDb(
  "SPEC-293 authorized platform workspace scope on the Task Control selection path",
  () => {
    it("requires project membership and current Runner/workspace identity before returning a selectable workspace", async () => {
      let relation =
        await db`SELECT to_regclass('public.canonical_project_workspace_bindings') AS binding_table`;
      if (!relation[0]?.binding_table) {
        await db.unsafe(`
          CREATE TABLE IF NOT EXISTS canonical_projects (
            project_id varchar(36) PRIMARY KEY,
            tenant_id varchar(36) NOT NULL,
            project_type varchar(40) NOT NULL,
            title varchar(200) NOT NULL,
            owner_principal_id varchar(160) NOT NULL,
            lifecycle varchar(24) NOT NULL DEFAULT 'ACTIVE',
            UNIQUE (tenant_id, project_id)
          );
          CREATE TABLE IF NOT EXISTS canonical_project_memberships (
            tenant_id varchar(36) NOT NULL,
            project_id varchar(36) NOT NULL,
            principal_id varchar(160) NOT NULL,
            role varchar(16) NOT NULL,
            lifecycle varchar(16) NOT NULL DEFAULT 'ACTIVE',
            revoked_at timestamptz,
            PRIMARY KEY (tenant_id, project_id, principal_id)
          );
        `);
        const migration = (await readFile(migrationPath, "utf8")).replace(
          /^\s*(?:BEGIN|COMMIT);\s*$/gim,
          ""
        );
        for (const statement of migration
          .split(";")
          .map(value => value.trim())
          .filter(Boolean)) {
          await db.unsafe(statement);
        }
        relation =
          await db`SELECT to_regclass('public.canonical_project_workspace_bindings') AS binding_table`;
      }
      if (!relation[0]?.binding_table)
        throw new Error("SPEC293_WORKSPACE_SCOPE_MIGRATION_NOT_APPLIED");
      await provision();
      const [{ runnerNodesRouter }, { spec226DevelopmentControlRouter }] =
        await Promise.all([
          import("../../routers/runnerNodes"),
          import("../../routers/spec226DevelopmentControl"),
        ]);
      const ownerContext = {
        tenantId,
        user: { id: actorId, role: "admin", currentTenantId: tenantId },
      } as never;
      const otherContext = {
        tenantId,
        user: { id: otherActorId, role: "admin", currentTenantId: tenantId },
      } as never;
      const ownerRunners = await runnerNodesRouter
        .createCaller(ownerContext)
        .list({ viewMode: "simple" });
      const ownerWorkspaces = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .availableWorkspaces({});
      const ownerMissionControl = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .projectMissionControl({});
      const otherRunners = await runnerNodesRouter
        .createCaller(otherContext)
        .list({ viewMode: "simple" });
      const otherWorkspaces = await spec226DevelopmentControlRouter
        .createCaller(otherContext)
        .availableWorkspaces({});

      const ownerWorkspaceProjections =
        ownerRunners.runners.find(row => row.runnerId === runnerId)
          ?.workspaces ?? [];
      expect(
        ownerWorkspaceProjections.find(
          workspace => workspace.scope === "PLATFORM_ENGINEERING"
        )
      ).toEqual({
        provenance: "platform_engineering_authorized",
        scope: "PLATFORM_ENGINEERING",
        displayName: "SmartAIHub Platform Engineering",
      });
      expect(
        ownerWorkspaceProjections.find(
          workspace => workspace.displayName === "SmartSpecPro"
        )
      ).toEqual({ provenance: "user_owned", displayName: "SmartSpecPro" });
      expect(
        ownerWorkspaces.workspaces.find(
          workspace => workspace.scope === "PLATFORM_ENGINEERING"
        )
      ).toEqual(
        expect.objectContaining({
          runnerId,
          workspaceId,
          scope: "PLATFORM_ENGINEERING",
          canonicalProjectId: projectId,
          canonicalProjectTitle: "SmartAIHub Platform Engineering",
          snapshotRevision: "snapshot-scope-1",
        })
      );
      expect(ownerMissionControl.workspaces.observed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "PLATFORM_ENGINEERING",
            canonicalProjectId: projectId,
            canonicalProjectTitle: "SmartAIHub Platform Engineering",
            repositoryId,
            hostId: runnerId,
            workspaceId,
            snapshotRevision: "snapshot-scope-1",
          }),
        ])
      );
      expect(
        ownerWorkspaces.workspaces.find(
          workspace => workspace.workspaceId === creatorWorkspaceId
        )
      ).not.toHaveProperty("scope");
      expect(otherRunners.runners.some(row => row.runnerId === runnerId)).toBe(
        false
      );
      expect(otherWorkspaces.workspaces).toEqual([]);
      const foreignTenantContext = {
        tenantId: `${tenantId}-foreign`,
        user: {
          id: actorId,
          role: "admin",
          currentTenantId: `${tenantId}-foreign`,
        },
      } as never;
      const foreignTenantWorkspaces = await spec226DevelopmentControlRouter
        .createCaller(foreignTenantContext)
        .availableWorkspaces({});
      expect(foreignTenantWorkspaces.workspaces).toEqual([]);

      await db`UPDATE canonical_project_memberships SET lifecycle = 'REVOKED', revoked_at = NOW() WHERE tenant_id = ${tenantId} AND project_id = ${projectId} AND principal_id = ${`user:${actorId}`}`;
      const revokedMembershipWorkspaces = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .availableWorkspaces({});
      expect(
        revokedMembershipWorkspaces.workspaces.some(
          workspace => workspace.scope === "PLATFORM_ENGINEERING"
        )
      ).toBe(false);

      await db`UPDATE canonical_project_memberships SET lifecycle = 'ACTIVE', revoked_at = NULL WHERE tenant_id = ${tenantId} AND project_id = ${projectId} AND principal_id = ${`user:${actorId}`}`;
      await db`UPDATE runner_nodes SET "currentSnapshotJson" = jsonb_set("currentSnapshotJson", '{workspaces,0,repositoryId}', '"different-repository"'::jsonb) WHERE "runnerId" = ${runnerId}`;
      const mismatchedWorkspaceList = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .availableWorkspaces({});
      expect(
        mismatchedWorkspaceList.workspaces.some(
          workspace => workspace.workspaceId === workspaceId
        )
      ).toBe(false);
      await db`UPDATE runner_nodes SET "currentSnapshotJson" = jsonb_set("currentSnapshotJson", '{workspaces,0,repositoryId}', ${db.json(repositoryId)}) WHERE "runnerId" = ${runnerId}`;
      await db`UPDATE runner_nodes SET "trustState" = 'revoked', status = 'revoked', "revokedAt" = NOW() WHERE "runnerId" = ${runnerId}`;
      const revokedRunnerWorkspaceList = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .availableWorkspaces({});
      expect(
        revokedRunnerWorkspaceList.workspaces.some(
          workspace => workspace.workspaceId === workspaceId
        )
      ).toBe(false);
      await db`UPDATE runner_nodes SET "trustState" = 'trusted', status = 'online', "revokedAt" = NULL WHERE "runnerId" = ${runnerId}`;
      await db`UPDATE runner_nodes SET "snapshotExpiresAt" = NOW() - INTERVAL '1 second' WHERE "runnerId" = ${runnerId}`;
      const staleWorkspaceList = await spec226DevelopmentControlRouter
        .createCaller(ownerContext)
        .availableWorkspaces({});
      expect(
        staleWorkspaceList.workspaces.some(
          workspace => workspace.workspaceId === workspaceId
        )
      ).toBe(false);
    }, 30_000);
  }
);
