import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("../../queryEmbeddingService", () => ({
  generateQueryEmbedding: vi.fn(async () => null),
}));

import { and, eq, sql } from "drizzle-orm";
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
  const userOpenId = `r5-user-${suffix}`;
  const appId = `r5-app-${suffix}`;
  const projectAId = crypto.randomUUID();
  const projectBId = crypto.randomUUID();
  const personaId = crypto.randomUUID();
  const conversationId = 200_000_000 + Number.parseInt(suffix.replaceAll("-", "").slice(0, 8), 16) % 1_800_000_000;
  let userId = 0;
  let tenantCreated = false;

  beforeAll(async () => {
    assertApprovedLoopbackDatabase();
    const db = getDb();
    await db.insert(tenants).values({ id: tenantId, slug: `r5-${suffix}`, name: "R5 synthetic acceptance tenant" });
    tenantCreated = true;
    const [user] = await db.insert(users).values({ openId: userOpenId, name: "R5 synthetic user", currentTenantId: tenantId }).returning({ id: users.id });
    userId = user.id;
    await db.insert(appIdentities).values({
      appId,
      publicAppId: `public-${appId}`,
      tenantId,
      publisherRef: "r5-test-publisher",
      canonicalProductId: "r5-test-product",
      lifecycle: "active",
    });
    await db.insert(canonicalProjects).values([
      { projectId: projectAId, tenantId, projectType: "test", title: "R5 Project A", ownerPrincipalId: `user:${userId}` },
      { projectId: projectBId, tenantId, projectType: "test", title: "R5 Project B", ownerPrincipalId: `user:${userId}` },
    ]);
    await db.insert(canonicalProjectMemberships).values({
      tenantId,
      projectId: projectAId,
      principalId: `user:${userId}`,
      role: "viewer",
      lifecycle: "ACTIVE",
    });
    await db.insert(canonicalProjectAppBindings).values({ tenantId, projectId: projectAId, appId, lifecycle: "ACTIVE" });
    await db.insert(personaTemplates).values({
      id: personaId,
      tenantId,
      userId,
      name: "R5 synthetic assistant",
      systemPromptPrefix: "R5 synthetic persona",
      scope: "tenant",
    });
    await db.execute(sql`
      INSERT INTO conversations (id, "userId", "tenantId", "project_id", title)
      VALUES (${conversationId}, ${userId}, ${tenantId}, ${projectAId}, 'R5 persisted Project conversation')
    `);
    await db.insert(scopedMemories).values([
      { id: `r5-a-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: projectAId, title: "R5 keyword marker", content: markers.projectA },
      { id: `r5-b-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: projectBId, title: "R5 keyword marker", content: markers.projectB },
      { id: `r5-global-${suffix}`, tenantId, ownerType: "user", ownerId: String(userId), memoryKind: "fact", visibility: "private", projectId: null, title: "R5 keyword marker", content: markers.projectAGlobal },
    ]);
    await db.insert(entityMemories).values([
      { userId, personaId, entityType: "preference", entityName: `project-a-${suffix}`, facts: [markers.entityA], projectId: projectAId },
      { userId, personaId, entityType: "preference", entityName: `project-b-${suffix}`, facts: [markers.entityB], projectId: projectBId },
      { userId, personaId, entityType: "preference", entityName: `global-${suffix}`, facts: [markers.entityGlobal], projectId: null },
    ]);
  });

  afterAll(async () => {
    if (!userId) {
      if (tenantCreated) await getDb().delete(tenants).where(eq(tenants.id, tenantId));
      return closeDb();
    }
    const db = getDb();
    try {
      await db.delete(scopedMemories).where(eq(scopedMemories.tenantId, tenantId));
      await db.delete(entityMemories).where(eq(entityMemories.userId, userId));
      await db.delete(conversations).where(eq(conversations.id, conversationId));
      await db.delete(personaTemplates).where(eq(personaTemplates.id, personaId));
      await db.delete(canonicalProjectMemberships).where(eq(canonicalProjectMemberships.tenantId, tenantId));
      await db.delete(canonicalProjectAppBindings).where(eq(canonicalProjectAppBindings.tenantId, tenantId));
      await db.delete(canonicalProjects).where(eq(canonicalProjects.tenantId, tenantId));
      await db.delete(appIdentities).where(eq(appIdentities.tenantId, tenantId));
      await db.delete(users).where(eq(users.id, userId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } finally {
      await closeDb();
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
