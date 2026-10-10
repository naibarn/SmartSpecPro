import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { request as httpRequest, type Server } from "node:http";

vi.mock("../../queryEmbeddingService", () => ({
  generateQueryEmbedding: vi.fn(async () => null),
}));

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, closeDb } from "../../../db";
import {
  appIdentities,
  appRouteAliases,
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
import { createContextWithTrustedAppIngress } from "../../../_core/context";
import { sdk } from "../../../_core/sdk";
import { resolveAppRouteForTenant } from "../../appIdentityRepository";

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
const TEST_INGRESS_ISSUER = "r5-local-ingress";
const TEST_INGRESS_AUDIENCE = "smartspec-web-r5-test";

function signTestIngressAssertion(claims: Record<string, unknown>, secret: Buffer): string {
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

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
  const routeAliasId = `r5-route-${suffix}`;
  const routeHostname = `r5-${suffix}.example.test`;
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
    await db.insert(appRouteAliases).values({
      aliasId: routeAliasId,
      tenantId,
      appId,
      kind: "custom-domain",
      value: routeHostname,
      status: "ACTIVE",
      activatedAt: new Date(),
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
      await db.delete(appRouteAliases).where(eq(appRouteAliases.tenantId, tenantId));
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

  it("propagates a signed local ingress assertion through HTTP to persisted Project memory and rejects header-only identity", async () => {
    const secret = randomBytes(32);
    const consumed = new Set<string>();
    const authSpy = vi.spyOn(sdk, "authenticateRequest").mockResolvedValue({
      id: userId,
      currentTenantId: tenantId,
      name: "R5 synthetic authenticated user",
    } as any);
    const contextFactory = createContextWithTrustedAppIngress({
      readAssertion: req => req.headers["x-r5-ingress-assertion"],
      verifier: {
        verifyAndConsume: async assertion => {
          if (typeof assertion !== "string") return null;
          const [encoded, signature, extra] = assertion.split(".");
          if (!encoded || !signature || extra !== undefined) return null;
          const expected = createHmac("sha256", secret).update(encoded).digest();
          const supplied = Buffer.from(signature, "base64url");
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
          let claims: Record<string, unknown>;
          try { claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return null; }
          if (typeof claims.assertionId !== "string" || consumed.has(claims.assertionId)) return null;
          consumed.add(claims.assertionId);
          return claims as any;
        },
      },
      resolveRoute: resolveAppRouteForTenant,
      expectedIssuer: TEST_INGRESS_ISSUER,
      expectedAudience: TEST_INGRESS_AUDIENCE,
    });
    const serverApp = express();
    serverApp.set("trust proxy", 1);
    serverApp.get("/runtime", async (req, res) => {
      const context = await contextFactory({ req, res } as any);
      const messages = context.user && context.tenantId ? await buildChatContext({
            channel: "chat",
            userId: context.user.id,
            tenantId: context.tenantId,
            userMessage: "R5 keyword marker",
            traceId: `r5-ingress-${suffix}`,
            conversationContext: {
              conversationId,
              activePersonaId: personaId,
              trustedAppContext: context.trustedAppContext,
            },
          }, "R5 base prompt", null) : [];
      res.status(200).json({
        tenantId: context.tenantId,
        trustedAppContext: context.trustedAppContext,
        prompt: messages.map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n"),
      });
    });

    let server: Server | undefined;
    try {
      server = await new Promise<Server>(resolve => {
        const listening = serverApp.listen(0, "127.0.0.1", () => resolve(listening));
      });
      const port = (server.address() as { port: number }).port;
      const send = (headers: Record<string, string>) => new Promise<any>((resolve, reject) => {
        const request = httpRequest({ hostname: "127.0.0.1", port, path: "/runtime", headers }, response => {
          const chunks: Buffer[] = [];
          response.on("data", chunk => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
          });
        });
        request.on("error", reject);
        request.end();
      });
      const now = Date.now();
      const token = signTestIngressAssertion({
        issuer: TEST_INGRESS_ISSUER,
        audience: TEST_INGRESS_AUDIENCE,
        assertionId: `r5-${suffix}`,
        tenantId,
        appId,
        publicAppId: `public-${appId}`,
        routeHostname,
        issuedAtMs: now,
        expiresAtMs: now + 10_000,
      }, secret);
      const trusted = await send({
        host: "127.0.0.1",
        "x-forwarded-host": "attacker.example",
        "x-r5-ingress-assertion": token,
      });
      expect(trusted.tenantId).toBe(tenantId);
      expect(trusted.trustedAppContext).toMatchObject({ hostAppId: appId, publicAppId: `public-${appId}` });
      expect(trusted.trustedAppContext).toMatchObject({
        permissionCeiling: { projectMemoryRead: "authorized_bound_project_only", durableProjectMemoryWrite: false },
        policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
      });
      expect(trusted.prompt).toContain(markers.projectA);
      expect(trusted.prompt).toContain(markers.projectAGlobal);

      const forged = await send({ host: routeHostname, "x-forwarded-host": routeHostname });
      expect(forged.trustedAppContext).toBeNull();
      expect(forged.prompt).toContain(markers.projectAGlobal);
      expect(forged.prompt).not.toContain(markers.projectA);

      const replay = await send({
        host: "127.0.0.1",
        "x-r5-ingress-assertion": token,
      });
      expect(replay.trustedAppContext).toBeNull();
      expect(replay.prompt).toContain(markers.projectAGlobal);
      expect(replay.prompt).not.toContain(markers.projectA);

      const wrongAppToken = signTestIngressAssertion({
        issuer: TEST_INGRESS_ISSUER,
        audience: TEST_INGRESS_AUDIENCE,
        assertionId: `r5-wrong-app-${suffix}`,
        tenantId,
        appId: secondAppId,
        publicAppId: `public-${secondAppId}`,
        routeHostname,
        issuedAtMs: now,
        expiresAtMs: now + 10_000,
      }, secret);
      const wrongApp = await send({ host: "127.0.0.1", "x-r5-ingress-assertion": wrongAppToken });
      expect(wrongApp.trustedAppContext).toBeNull();
      expect(wrongApp.prompt).not.toContain(markers.projectA);

      const crossTenantToken = signTestIngressAssertion({
        issuer: TEST_INGRESS_ISSUER,
        audience: TEST_INGRESS_AUDIENCE,
        assertionId: `r5-cross-tenant-${suffix}`,
        tenantId: foreignTenantId,
        appId: foreignAppId,
        publicAppId: `public-${foreignAppId}`,
        routeHostname,
        issuedAtMs: now,
        expiresAtMs: now + 10_000,
      }, secret);
      const crossTenant = await send({ host: routeHostname, "x-r5-ingress-assertion": crossTenantToken });
      expect(crossTenant.trustedAppContext).toBeNull();
      expect(crossTenant.prompt).not.toContain(markers.projectA);
    } finally {
      authSpy.mockRestore();
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
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
