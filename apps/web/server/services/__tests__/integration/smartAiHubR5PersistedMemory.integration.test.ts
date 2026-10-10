import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("../../queryEmbeddingService", () => ({
  generateQueryEmbedding: vi.fn(async () => null),
}));

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, closeDb } from "../../../db";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  conversations,
  entityMemories,
  personaTemplates,
  scopedMemories,
  tenants,
  users,
} from "../../../../drizzle/schema";
import { buildChatContext } from "../../executors/contextBuilder";
import { SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION } from "../../smartAiHubRuntimeContext";

const enabled = process.env.SMARTAIHUB_R5_PERSISTED_ACCEPTANCE === "1";
const describePersisted = describe.skipIf(!enabled);
const TEST_DB_NAME = "miniapp_r5_test";
const markers = {
  projectA: "R5_CONTEXT_PROJECT_A_SECRET",
  projectB: "R5_CONTEXT_PROJECT_B_SECRET",
  sharedProject: "R5_SHARED_PROJECT_MEMORY_OK",
  secondUserGlobal: "R5_SECOND_USER_GLOBAL_OK",
  projectAGlobal: "R5_CONTEXT_GLOBAL_OK",
  entityA: "R5_CONTEXT_ENTITY_A_SECRET",
  entityB: "R5_CONTEXT_ENTITY_B_SECRET",
  entityGlobal: "R5_CONTEXT_ENTITY_GLOBAL_OK",
};

function assertApprovedLoopbackDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL_REQUIRED_FOR_R5_PERSISTED_ACCEPTANCE");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || databaseName !== TEST_DB_NAME) {
    throw new Error("R5_PERSISTED_ACCEPTANCE_REQUIRES_APPROVED_LOOPBACK_DATABASE");
  }
  if (process.env.SMARTAIHUB_R5_DISPOSABLE_DB_CONFIRMED !== "1") {
    throw new Error("R5_DISPOSABLE_DATABASE_CONFIRMATION_REQUIRED");
  }
}

describePersisted("SPEC-269 persisted Project memory acceptance", () => {
  const suffix = randomUUID();
  const tenantId = suffix;
  const foreignTenantId = randomUUID();
  const userOpenId = `r5-user-${suffix}`;
  const secondUserOpenId = `r5-second-user-${suffix}`;
  const foreignUserOpenId = `r5-foreign-user-${suffix}`;
  const appId = `r5-app-${suffix}`;
  const secondAppId = `r5-second-app-${suffix}`;
  const foreignAppId = `r5-foreign-app-${suffix}`;
  const projectAId = crypto.randomUUID();
  const projectBId = crypto.randomUUID();
  const foreignProjectId = crypto.randomUUID();
  const personaId = crypto.randomUUID();
  const secondPersonaId = crypto.randomUUID();
  const foreignPersonaId = crypto.randomUUID();
  const conversationId = 200_000_000 + Number.parseInt(suffix.replaceAll("-", "").slice(0, 8), 16) % 1_800_000_000;
  const foreignConversationId = conversationId + 1;
  const secondConversationId = conversationId + 2;
  let userId = 0;
  let secondUserId = 0;
  let foreignUserId = 0;

  beforeAll(async () => {
    assertApprovedLoopbackDatabase();
    const db = getDb();
    await db.insert(tenants).values({ id: tenantId, slug: `r5-${suffix}`, name: "R5 synthetic acceptance tenant" });
    const [user] = await db.insert(users).values({ openId: userOpenId, name: "R5 synthetic user", currentTenantId: tenantId }).returning({ id: users.id });
    userId = user.id;
    const [secondUser] = await db.insert(users).values({ openId: secondUserOpenId, name: "R5 synthetic second user", currentTenantId: tenantId }).returning({ id: users.id });
    secondUserId = secondUser.id;
    await db.insert(tenants).values({ id: foreignTenantId, slug: `r5-foreign-${suffix}`, name: "R5 synthetic foreign tenant" });
    const [foreignUser] = await db.insert(users).values({ openId: foreignUserOpenId, name: "R5 synthetic foreign user", currentTenantId: foreignTenantId }).returning({ id: users.id });
    foreignUserId = foreignUser.id;
    await db.insert(appIdentities).values({
      appId,
      publicAppId: `public-${appId}`,
      tenantId,
      publisherRef: "r5-test-publisher",
      canonicalProductId: "r5-test-product",
      lifecycle: "active",
    });
    await db.insert(appIdentities).values({
      appId: secondAppId,
      publicAppId: `public-${secondAppId}`,
      tenantId,
      publisherRef: "r5-test-publisher",
      canonicalProductId: "r5-test-product",
      lifecycle: "active",
    });
    await db.insert(appIdentities).values({
      appId: foreignAppId,
      publicAppId: `public-${foreignAppId}`,
      tenantId: foreignTenantId,
      publisherRef: "r5-test-publisher",
      canonicalProductId: "r5-test-product",
      lifecycle: "active",
    });
    await db.insert(canonicalProjects).values([
      { projectId: projectAId, tenantId, projectType: "test", title: "R5 Project A", ownerPrincipalId: `user:${userId}` },
      { projectId: projectBId, tenantId, projectType: "test", title: "R5 Project B", ownerPrincipalId: `user:${userId}` },
    ]);
    await db.insert(canonicalProjects).values({ projectId: foreignProjectId, tenantId: foreignTenantId, projectType: "test", title: "R5 Foreign Project", ownerPrincipalId: `user:${foreignUserId}` });
    await db.insert(canonicalProjectMemberships).values({
      tenantId,
      projectId: projectAId,
      principalId: `user:${userId}`,
      role: "viewer",
      lifecycle: "ACTIVE",
    });
    await db.insert(canonicalProjectMemberships).values({ tenantId, projectId: projectAId, principalId: `user:${secondUserId}`, role: "viewer", lifecycle: "ACTIVE" });
    await db.insert(canonicalProjectMemberships).values({ tenantId, projectId: projectBId, principalId: `user:${userId}`, role: "viewer", lifecycle: "ACTIVE" });
    await db.insert(canonicalProjectAppBindings).values({ tenantId, projectId: projectAId, appId, lifecycle: "ACTIVE" });
    await db.insert(canonicalProjectAppBindings).values({ tenantId, projectId: projectBId, appId: secondAppId, lifecycle: "ACTIVE" });
    await db.insert(canonicalProjectMemberships).values({ tenantId: foreignTenantId, projectId: foreignProjectId, principalId: `user:${foreignUserId}`, role: "viewer", lifecycle: "ACTIVE" });
    await db.insert(canonicalProjectAppBindings).values({ tenantId: foreignTenantId, projectId: foreignProjectId, appId: foreignAppId, lifecycle: "ACTIVE" });
    await db.insert(personaTemplates).values({
      id: personaId,
      tenantId,
      userId,
      name: "R5 synthetic assistant",
      systemPromptPrefix: "R5 synthetic persona",
      scope: "tenant",
    });
    await db.insert(personaTemplates).values({ id: secondPersonaId, tenantId, userId: secondUserId, name: "R5 synthetic second assistant", systemPromptPrefix: "R5 second synthetic persona", scope: "tenant" });
    await db.insert(personaTemplates).values({ id: foreignPersonaId, tenantId: foreignTenantId, userId: foreignUserId, name: "R5 synthetic foreign assistant", systemPromptPrefix: "R5 foreign synthetic persona", scope: "tenant" });
    await db.execute(sql`
      INSERT INTO conversations (id, "userId", "tenantId", "project_id", title)
      VALUES (${conversationId}, ${userId}, ${tenantId}, ${projectAId}, 'R5 persisted Project conversation')
    `);
    await db.execute(sql`
      INSERT INTO conversations (id, "userId", "tenantId", "project_id", title)
      VALUES (${secondConversationId}, ${secondUserId}, ${tenantId}, ${projectAId}, 'R5 second-user shared Project conversation')
    `);
    await db.execute(sql`
      INSERT INTO conversations (id, "userId", "tenantId", "project_id", title)
      VALUES (${foreignConversationId}, ${foreignUserId}, ${foreignTenantId}, ${foreignProjectId}, 'R5 persisted foreign Project conversation')
    `);
    await db.insert(scopedMemories).values([
      { id: `r5-a-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: projectAId, title: "R5 keyword marker", content: markers.projectA },
      { id: `r5-b-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: projectBId, title: "R5 keyword marker", content: markers.projectB },
      { id: `r5-global-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: null, title: "R5 keyword marker", content: markers.projectAGlobal },
      { id: `r5-shared-project-${suffix}`, tenantId, ownerType: "project", ownerId: projectAId, memoryKind: "fact", visibility: "shared_project", projectId: projectAId, title: "R5 shared Project marker", content: markers.sharedProject },
      { id: `r5-second-user-global-${suffix}`, tenantId, ownerType: "user", ownerId: String(secondUserId), memoryKind: "fact", visibility: "private", projectId: null, title: "R5 second-user global marker", content: markers.secondUserGlobal },
      { id: `r5-foreign-project-${suffix}`, tenantId: foreignTenantId, ownerType: "project", ownerId: foreignProjectId, memoryKind: "fact", visibility: "shared_project", projectId: foreignProjectId, title: "R5 keyword marker", content: "R5_FOREIGN_TENANT_PROJECT_SECRET" },
      { id: `r5-foreign-global-${suffix}`, tenantId: foreignTenantId, ownerType: "user", ownerId: String(foreignUserId), memoryKind: "fact", visibility: "private", projectId: null, title: "R5 keyword marker", content: "R5_FOREIGN_TENANT_GLOBAL_OK" },
    ]);
    await db.insert(entityMemories).values([
      { userId, personaId, entityType: "preference", entityName: `project-a-${suffix}`, facts: [markers.entityA], projectId: projectAId },
      { userId, personaId, entityType: "preference", entityName: `project-b-${suffix}`, facts: [markers.entityB], projectId: projectBId },
      { userId, personaId, entityType: "preference", entityName: `global-${suffix}`, facts: [markers.entityGlobal], projectId: null },
      { userId: foreignUserId, personaId: foreignPersonaId, entityType: "preference", entityName: `foreign-project-${suffix}`, facts: ["R5_FOREIGN_TENANT_ENTITY_SECRET"], projectId: foreignProjectId },
      { userId: foreignUserId, personaId: foreignPersonaId, entityType: "preference", entityName: `foreign-global-${suffix}`, facts: ["R5_FOREIGN_TENANT_ENTITY_GLOBAL_OK"], projectId: null },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    try {
      const tenantIds = [tenantId, foreignTenantId];
      await db.delete(scopedMemories).where(inArray(scopedMemories.tenantId, tenantIds));
      await db.delete(entityMemories).where(inArray(entityMemories.userId, [userId, secondUserId, foreignUserId].filter(id => id > 0)));
      await db.delete(conversations).where(and(
        inArray(conversations.id, [conversationId, secondConversationId, foreignConversationId]),
        inArray(conversations.tenantId, tenantIds),
      ));
      await db.delete(personaTemplates).where(and(
        inArray(personaTemplates.id, [personaId, secondPersonaId, foreignPersonaId]),
        inArray(personaTemplates.tenantId, tenantIds),
      ));
      await db.delete(canonicalProjectMemberships).where(inArray(canonicalProjectMemberships.tenantId, tenantIds));
      await db.delete(canonicalProjectAppBindings).where(inArray(canonicalProjectAppBindings.tenantId, tenantIds));
      await db.delete(canonicalProjects).where(inArray(canonicalProjects.tenantId, tenantIds));
      await db.delete(appIdentities).where(inArray(appIdentities.tenantId, tenantIds));
      await db.delete(users).where(inArray(users.id, [userId, secondUserId, foreignUserId].filter(id => id > 0)));
      await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    } finally {
      await closeDb();
    }
  });

  it("rejects a foreign-tenant App binding while preserving the foreign user's Global memory", async () => {
    const messages = await buildChatContext({
      channel: "chat",
      userId: foreignUserId,
      tenantId: foreignTenantId,
      userMessage: "R5 keyword marker",
      traceId: `r5-foreign-${suffix}`,
      conversationContext: {
        conversationId: foreignConversationId,
        activePersonaId: foreignPersonaId,
        trustedAppContext: {
          version: "spec304-trusted-host-app-context.v1",
          tenantId,
          hostAppId: appId,
          publicAppId: `public-${appId}`,
          routeProvenance: "verified_custom_domain_alias",
          permissionCeiling: { projectMemoryRead: "authorized_bound_project_only", durableProjectMemoryWrite: false },
          policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
        },
      },
    }, "R5 base prompt", null);
    const prompt = messages.map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
    expect(prompt).toContain("R5_FOREIGN_TENANT_GLOBAL_OK");
    expect(prompt).toContain("R5_FOREIGN_TENANT_ENTITY_GLOBAL_OK");
    expect(prompt).not.toContain("R5_FOREIGN_TENANT_PROJECT_SECRET");
    expect(prompt).not.toContain("R5_FOREIGN_TENANT_ENTITY_SECRET");
  });

  it("shares Project memory with a second authorized user and removes it after membership revocation", async () => {
    const db = getDb();
    const appContext = {
      version: "spec304-trusted-host-app-context.v1" as const,
      tenantId,
      hostAppId: appId,
      publicAppId: `public-${appId}`,
      routeProvenance: "verified_custom_domain_alias" as const,
      permissionCeiling: { projectMemoryRead: "authorized_bound_project_only" as const, durableProjectMemoryWrite: false as const },
      policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
    };
    const readPrompt = async () => {
      const messages = await buildChatContext({
        channel: "chat",
        userId: secondUserId,
        tenantId,
        userMessage: "R5 shared Project marker",
        traceId: `r5-second-user-${suffix}`,
        conversationContext: { conversationId: secondConversationId, activePersonaId: secondPersonaId, trustedAppContext: appContext },
      }, "R5 base prompt", null);
      return messages.map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
    };

    const authorizedPrompt = await readPrompt();
    expect(authorizedPrompt).toContain(markers.sharedProject);
    expect(authorizedPrompt).toContain(markers.secondUserGlobal);
    expect(authorizedPrompt).not.toContain(markers.projectA);

    await db.update(canonicalProjectMemberships).set({ lifecycle: "REVOKED", revokedAt: new Date() }).where(and(
      eq(canonicalProjectMemberships.tenantId, tenantId),
      eq(canonicalProjectMemberships.projectId, projectAId),
      eq(canonicalProjectMemberships.principalId, `user:${secondUserId}`),
    ));
    const revokedPrompt = await readPrompt();
    expect(revokedPrompt).toContain(markers.secondUserGlobal);
    expect(revokedPrompt).not.toContain(markers.sharedProject);
    expect(revokedPrompt).not.toContain(markers.projectA);
  });

  it("isolates same-tenant Projects by their bound App", async () => {
    const db = getDb();
    const readPromptForApp = async (hostAppId: string) => {
      const messages = await buildChatContext({
        channel: "chat",
        userId,
        tenantId,
        userMessage: "R5 keyword marker",
        traceId: `r5-app-isolation-${suffix}`,
        conversationContext: {
          conversationId,
          activePersonaId: personaId,
          trustedAppContext: {
            version: "spec304-trusted-host-app-context.v1",
            tenantId,
            hostAppId,
            publicAppId: `public-${hostAppId}`,
            routeProvenance: "verified_custom_domain_alias",
            permissionCeiling: { projectMemoryRead: "authorized_bound_project_only", durableProjectMemoryWrite: false },
            policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
          },
        },
      }, "R5 base prompt", null);
      return messages.map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
    };

    await db.update(conversations).set({ projectId: projectBId }).where(eq(conversations.id, conversationId));
    try {
      const appAPrompt = await readPromptForApp(appId);
      expect(appAPrompt).toContain(markers.projectAGlobal);
      expect(appAPrompt).toContain(markers.entityGlobal);
      expect(appAPrompt).not.toContain(markers.projectB);
      expect(appAPrompt).not.toContain(markers.entityB);

      const appBPrompt = await readPromptForApp(secondAppId);
      expect(appBPrompt).toContain(markers.projectB);
      expect(appBPrompt).toContain(markers.entityB);
      expect(appBPrompt).toContain(markers.projectAGlobal);
      expect(appBPrompt).not.toContain(markers.projectA);
      expect(appBPrompt).not.toContain(markers.entityA);
    } finally {
      await db.update(conversations).set({ projectId: projectAId }).where(eq(conversations.id, conversationId));
    }
  });

  it("keeps Project A memory out after ACL/binding revocation, retargeting, and NO_PROJECT", async () => {
    const db = getDb();
    const appContext = {
      version: "spec304-trusted-host-app-context.v1" as const,
      tenantId,
      hostAppId: appId,
      publicAppId: `public-${appId}`,
      routeProvenance: "verified_custom_domain_alias" as const,
      permissionCeiling: { projectMemoryRead: "authorized_bound_project_only" as const, durableProjectMemoryWrite: false as const },
      policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
    };
    const readPrompt = async () => {
      const messages = await buildChatContext({
        channel: "chat",
        userId,
        tenantId,
        userMessage: "R5 keyword marker",
        traceId: `r5-${suffix}`,
        conversationContext: { conversationId, activePersonaId: personaId, trustedAppContext: appContext },
      }, "R5 base prompt", null);
      return messages.map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
    };
    const expectOnlyGlobal = (content: string) => {
      expect(content).toContain(markers.projectAGlobal);
      expect(content).toContain(markers.entityGlobal);
      expect(content).not.toContain(markers.projectA);
      expect(content).not.toContain(markers.projectB);
      expect(content).not.toContain(markers.entityA);
      expect(content).not.toContain(markers.entityB);
    };

    const authorized = await readPrompt();
    expect(authorized).toContain(markers.projectA);
    expect(authorized).toContain(markers.projectAGlobal);
    expect(authorized).toContain(markers.entityA);
    expect(authorized).toContain(markers.entityGlobal);
    expect(authorized).not.toContain(markers.projectB);
    expect(authorized).not.toContain(markers.entityB);

    await db.update(canonicalProjectMemberships).set({ lifecycle: "REVOKED", revokedAt: new Date() }).where(and(
      eq(canonicalProjectMemberships.tenantId, tenantId),
      eq(canonicalProjectMemberships.projectId, projectAId),
      eq(canonicalProjectMemberships.principalId, `user:${userId}`),
    ));
    expectOnlyGlobal(await readPrompt());

    await db.update(canonicalProjectMemberships).set({ lifecycle: "ACTIVE", revokedAt: null }).where(and(
      eq(canonicalProjectMemberships.tenantId, tenantId),
      eq(canonicalProjectMemberships.projectId, projectAId),
      eq(canonicalProjectMemberships.principalId, `user:${userId}`),
    ));
    await db.update(canonicalProjectAppBindings).set({ lifecycle: "REVOKED" }).where(and(
      eq(canonicalProjectAppBindings.tenantId, tenantId),
      eq(canonicalProjectAppBindings.projectId, projectAId),
      eq(canonicalProjectAppBindings.appId, appId),
    ));
    expectOnlyGlobal(await readPrompt());

    await db.update(canonicalProjectAppBindings).set({ lifecycle: "ACTIVE" }).where(and(
      eq(canonicalProjectAppBindings.tenantId, tenantId),
      eq(canonicalProjectAppBindings.projectId, projectAId),
      eq(canonicalProjectAppBindings.appId, appId),
    ));
    await db.update(conversations).set({ projectId: projectBId }).where(eq(conversations.id, conversationId));
    expectOnlyGlobal(await readPrompt());

    await db.update(conversations).set({ projectId: null }).where(eq(conversations.id, conversationId));
    expectOnlyGlobal(await readPrompt());
  });
});
