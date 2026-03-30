import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  tenants,
  users,
  socialProviderConnections,
  socialPages,
  socialConversations,
  socialMessages,
  socialWebhookEventsRaw,
  socialHumanApprovals,
} from "../../../drizzle/schema";

const RUN_DB_INTEGRATION_TESTS = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDbSuite = RUN_DB_INTEGRATION_TESTS ? describe : describe.skip;

function resolveTestDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for DB integration tests");
  }

  const parsed = new URL(databaseUrl);
  const dbName = parsed.pathname.replace(/^\/+/, "");
  if (!dbName || !/(^|_|-)(test|ci)(_|-|$)/i.test(dbName)) {
    throw new Error(`Refusing to run DB integration tests against non-test database "${dbName || "<unknown>"}"`);
  }

  if (!new Set(["localhost", "127.0.0.1", "postgres", "smartspec-postgres"]).has(parsed.hostname)) {
    throw new Error(`Refusing to run DB integration tests on non-local host "${parsed.hostname}"`);
  }

  return databaseUrl;
}

const DATABASE_URL = RUN_DB_INTEGRATION_TESTS
  ? resolveTestDatabaseUrl()
  : "postgresql://smartspec:smartspec123@localhost:5432/smartspec_test";

const sql = postgres(DATABASE_URL);
const drizzleClient = postgres(DATABASE_URL);
const db = drizzle(drizzleClient);

const createdTenantIds: string[] = [];
const createdUserIds: number[] = [];
const createdConnectionIds: number[] = [];
const createdPageIds: number[] = [];
const createdConversationIds: number[] = [];
const createdMessageIds: number[] = [];
const createdWebhookIds: number[] = [];
const createdApprovalIds: number[] = [];

async function makeTenantAndUser() {
  const tenantId = `tenant-social-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  createdTenantIds.push(tenantId);
  await db.insert(tenants).values({
    id: tenantId,
    slug: `social-${Date.now()}`,
    name: "Social Meta Tenant",
    primaryDomain: `social-${Date.now()}.example.com`,
    domains: [],
    isActive: true,
    themeConfig: {},
    seoConfig: {},
    settings: {},
    status: "ACTIVE",
    plan: "FREE",
    created_at: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  const [user] = await db.insert(users).values({
    openId: `open-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role: "user",
    lastSignedIn: new Date(),
  } as any).returning();
  createdUserIds.push(user.id);

  return { tenantId, userId: user.id };
}

afterAll(async () => {
  for (const id of createdApprovalIds) {
    await sql`DELETE FROM social_human_approvals WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdWebhookIds) {
    await sql`DELETE FROM social_webhook_events_raw WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdMessageIds) {
    await sql`DELETE FROM social_messages WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdConversationIds) {
    await sql`DELETE FROM social_conversations WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdPageIds) {
    await sql`DELETE FROM social_pages WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdConnectionIds) {
    await sql`DELETE FROM social_provider_connections WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdUserIds) {
    await sql`DELETE FROM users WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdTenantIds) {
    await sql`DELETE FROM tenants WHERE id = ${id}`.catch(() => {});
  }
  await sql.end();
  await drizzleClient.end();
});

describeDbSuite("social schema integration", () => {
  it("accepts a valid socialProviderConnections insert", async () => {
    const { tenantId, userId } = await makeTenantAndUser();
    const [connection] = await db.insert(socialProviderConnections).values({
      tenantId,
      userId,
      provider: "meta",
      status: "active",
      encryptedAccessToken: "encrypted-token",
    } as any).returning();

    createdConnectionIds.push(connection.id);
    expect(connection.id).toBeDefined();
    expect(connection.createdAt).toBeDefined();
    expect(connection.updatedAt).toBeDefined();
  });

  it("cascades socialPages deletion when a connection is deleted", async () => {
    const { tenantId, userId } = await makeTenantAndUser();
    const [connection] = await db.insert(socialProviderConnections).values({
      tenantId,
      userId,
      provider: "meta",
      status: "active",
      encryptedAccessToken: "encrypted-token",
    } as any).returning();
    createdConnectionIds.push(connection.id);

    const [page] = await db.insert(socialPages).values({
      tenantId,
      connectionId: connection.id,
      providerPageId: `page-${Date.now()}`,
      pageName: "Test Page",
    } as any).returning();
    createdPageIds.push(page.id);

    await db.delete(socialProviderConnections).where(eq(socialProviderConnections.id, connection.id));

    const pages = await db.select().from(socialPages).where(eq(socialPages.id, page.id));
    expect(pages).toHaveLength(0);
  });

  it("enforces socialConversations uniqueness on pageId and customerExternalId", async () => {
    const { tenantId, userId } = await makeTenantAndUser();
    const [connection] = await db.insert(socialProviderConnections).values({
      tenantId,
      userId,
      provider: "meta",
      status: "active",
      encryptedAccessToken: "encrypted-token",
    } as any).returning();
    createdConnectionIds.push(connection.id);

    const [page] = await db.insert(socialPages).values({
      tenantId,
      connectionId: connection.id,
      providerPageId: `page-${Date.now()}`,
      pageName: "Test Page",
    } as any).returning();
    createdPageIds.push(page.id);

    const [conversation] = await db.insert(socialConversations).values({
      tenantId,
      pageId: page.id,
      customerExternalId: "psid_123",
      customerDisplayName: "Customer",
    } as any).returning();
    createdConversationIds.push(conversation.id);

    await expect(
      db.insert(socialConversations).values({
        tenantId,
        pageId: page.id,
        customerExternalId: "psid_123",
        customerDisplayName: "Duplicate",
      } as any),
    ).rejects.toThrow();
  });

  it("enforces socialMessages uniqueness on providerMessageId", async () => {
    const { tenantId, userId } = await makeTenantAndUser();
    const [connection] = await db.insert(socialProviderConnections).values({
      tenantId,
      userId,
      provider: "meta",
      status: "active",
      encryptedAccessToken: "encrypted-token",
    } as any).returning();
    createdConnectionIds.push(connection.id);

    const [page] = await db.insert(socialPages).values({
      tenantId,
      connectionId: connection.id,
      providerPageId: `page-${Date.now()}`,
      pageName: "Test Page",
    } as any).returning();
    createdPageIds.push(page.id);

    const [conversation] = await db.insert(socialConversations).values({
      tenantId,
      pageId: page.id,
      customerExternalId: "psid_456",
    } as any).returning();
    createdConversationIds.push(conversation.id);

    await db.insert(socialMessages).values({
      tenantId,
      conversationId: conversation.id,
      pageId: page.id,
      providerMessageId: "mid.abc123",
      direction: "inbound",
      senderType: "customer",
    } as any);

    await expect(
      db.insert(socialMessages).values({
        tenantId,
        conversationId: conversation.id,
        pageId: page.id,
        providerMessageId: "mid.abc123",
        direction: "inbound",
        senderType: "customer",
      } as any),
    ).rejects.toThrow();
  });

  it("enforces socialWebhookEventsRaw uniqueness on provider and deliveryId", async () => {
    const [event] = await db.insert(socialWebhookEventsRaw).values({
      provider: "meta",
      deliveryId: "entry1:ts1",
      payload: {},
      headers: {},
    } as any).returning();
    createdWebhookIds.push(event.id);

    await expect(
      db.insert(socialWebhookEventsRaw).values({
        provider: "meta",
        deliveryId: "entry1:ts1",
        payload: {},
        headers: {},
      } as any),
    ).rejects.toThrow();
  });

  it("defaults socialHumanApprovals status to pending", async () => {
    const { tenantId, userId } = await makeTenantAndUser();
    const [connection] = await db.insert(socialProviderConnections).values({
      tenantId,
      userId,
      provider: "meta",
      status: "active",
      encryptedAccessToken: "encrypted-token",
    } as any).returning();
    createdConnectionIds.push(connection.id);

    const [page] = await db.insert(socialPages).values({
      tenantId,
      connectionId: connection.id,
      providerPageId: `page-${Date.now()}`,
      pageName: "Test Page",
    } as any).returning();
    createdPageIds.push(page.id);

    const [approval] = await db.insert(socialHumanApprovals).values({
      tenantId,
      pageId: page.id,
      entityType: "reply",
      entityId: 123,
      proposedContent: "Hello there",
    } as any).returning();
    createdApprovalIds.push(approval.id);

    expect(approval.status).toBe("pending");
  });
});
