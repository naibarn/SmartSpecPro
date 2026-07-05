/**
 * Integration test — Marketplace Capture per-viewer affiliate links.
 *
 * Regression coverage for the bug where sharing a captured marketplace product
 * to a tenant group (marketplaceProductGroupShares, permission "read_update")
 * caused one group member re-capturing the "same" external product to
 * silently overwrite another member's affiliate link, because affiliateUrl
 * used to live directly on the shared `marketplace_products` row.
 *
 * The fix moved affiliate-link storage into `marketplace_product_affiliate_links`
 * (one row per productId+userId). This test proves:
 *   - confirmMarketplaceCapture() no longer clobbers another viewer's link when
 *     updating a group-shared product.
 *   - getMarketplaceProductWithAccess() and listMarketplaceProductsWithAccess()
 *     resolve affiliateUrl per-viewer from the new table.
 *   - A group member who never set their own link sees `null`, not someone
 *     else's link.
 *
 * These tests run against a REAL Postgres database (not mocked) so the actual
 * FK-linked insert/update/select behavior of the fix is exercised end-to-end.
 *
 * Run with:
 *   DATABASE_URL=postgresql://.../smartspec_test RUN_DB_INTEGRATION_TESTS=true \
 *     npx vitest run server/services/__tests__/marketplaceProductAffiliateLinks.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  tenants,
  users,
  userGroups,
  groupMembers,
  marketplaceCaptureSessions,
  marketplaceProductGroupShares,
} from "../../../drizzle/schema";

const RUN_DB_INTEGRATION_TESTS = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDbSuite = RUN_DB_INTEGRATION_TESTS ? describe : describe.skip;

function resolveTestDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for DB integration tests");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL for DB integration tests");
  }

  const dbName = parsed.pathname.replace(/^\/+/, "");
  if (!dbName || !/(^|_|-)(test|ci)(_|-|$)/i.test(dbName)) {
    throw new Error(
      `Refusing to run DB integration tests against non-test database "${dbName || "<unknown>"}"`,
    );
  }

  const allowedHosts = new Set(["localhost", "127.0.0.1", "postgres", "smartspec-postgres"]);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run DB integration tests on non-local host "${parsed.hostname}"`,
    );
  }

  return databaseUrl;
}

const DATABASE_URL = RUN_DB_INTEGRATION_TESTS
  ? resolveTestDatabaseUrl()
  : "postgresql://smartspec:smartspec123@localhost:5432/smartspec_test";

// This test calls the real service layer, which lazily connects via
// `getDb()` (server/db.ts) reading `process.env.DATABASE_URL` on first use.
// Set it here (before importing the service) so both this test's own
// drizzle client AND the service's internal client point at the same,
// guarded test database.
process.env.DATABASE_URL = DATABASE_URL;

const sql = postgres(DATABASE_URL);
const drizzleClient = postgres(DATABASE_URL);
const db = drizzle(drizzleClient);

const {
  confirmMarketplaceCapture,
  getMarketplaceProductWithAccess,
  listMarketplaceProductsWithAccess,
} = await import("../marketplaceProductService");
const { createMarketplaceId } = await import("../marketplaceCaptureService");

const createdTenantIds: string[] = [];
const createdUserIds: number[] = [];
const createdGroupIds: number[] = [];
const createdGroupMemberIds: number[] = [];
const createdCaptureSessionIds: string[] = [];
const createdProductIds: string[] = [];
const createdShareIds: string[] = [];

afterAll(async () => {
  for (const productId of createdProductIds) {
    await sql`DELETE FROM marketplace_product_affiliate_links WHERE "productId" = ${productId}`.catch(() => {});
  }
  for (const id of createdShareIds) {
    await sql`DELETE FROM marketplace_product_group_shares WHERE id = ${id}`.catch(() => {});
  }
  for (const productId of createdProductIds) {
    await sql`DELETE FROM marketplace_product_images WHERE "productId" = ${productId}`.catch(() => {});
  }
  for (const productId of createdProductIds) {
    await sql`DELETE FROM marketplace_product_price_snapshots WHERE "productId" = ${productId}`.catch(() => {});
  }
  for (const productId of createdProductIds) {
    await sql`DELETE FROM marketplace_products WHERE id = ${productId}`.catch(() => {});
  }
  for (const id of createdCaptureSessionIds) {
    await sql`DELETE FROM marketplace_capture_sessions WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdGroupMemberIds) {
    await sql`DELETE FROM group_members WHERE id = ${id}`.catch(() => {});
  }
  for (const id of createdGroupIds) {
    await sql`DELETE FROM user_groups WHERE id = ${id}`.catch(() => {});
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

async function makeTenant() {
  const tenantId = `tnt-mktaff-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  createdTenantIds.push(tenantId);
  await db.insert(tenants).values({
    id: tenantId,
    slug: `mkt-affiliate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: "Marketplace Affiliate Link Tenant",
    primaryDomain: `mkt-affiliate-${Date.now()}.example.com`,
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
  return tenantId;
}

async function makeUser(label: string) {
  const [user] = await db.insert(users).values({
    openId: `open-mkt-affiliate-${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role: "user",
    plan: "free",
    credits: 0,
    isDisabled: false,
    lastSignedIn: new Date(),
  } as any).returning();
  createdUserIds.push(user.id);
  return user;
}

async function makeGroup(tenantId: string, ownerId: number) {
  const [group] = await db.insert(userGroups).values({
    tenantId,
    name: `Marketplace Affiliate Test Group ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ownerId,
  } as any).returning();
  createdGroupIds.push(group.id);
  return group;
}

async function addActiveMember(groupId: number, userId: number) {
  const [member] = await db.insert(groupMembers).values({
    groupId,
    userId,
    status: "active",
  } as any).returning();
  createdGroupMemberIds.push(member.id);
  return member;
}

async function makeCaptureSession(input: {
  userId: number;
  tenantId: string;
  platform: "shopee" | "tiktok_shop";
  externalProductId: string;
  sourceUrl: string;
}) {
  const captureId = createMarketplaceId("mc");
  await db.insert(marketplaceCaptureSessions).values({
    id: captureId,
    userId: input.userId,
    tenantId: input.tenantId,
    platform: input.platform,
    pageType: "product",
    sourceUrl: input.sourceUrl,
    externalProductId: input.externalProductId,
    status: "captured",
  } as any);
  createdCaptureSessionIds.push(captureId);
  return captureId;
}

function buildConfirmInput(options: { productName: string; affiliateUrl: string; priceCurrent: number }) {
  return {
    product: {
      productName: options.productName,
      price: { current: options.priceCurrent },
      affiliateUrl: options.affiliateUrl,
    },
  };
}

describeDbSuite("Marketplace Capture — per-viewer affiliate links (group-shared products)", () => {
  it("does not let one group member's re-capture overwrite another member's affiliate link on a shared product", async () => {
    const tenantId = await makeTenant();
    const userA = await makeUser("a");
    const userB = await makeUser("b");
    const userC = await makeUser("c");
    const group = await makeGroup(tenantId, userA.id);
    await addActiveMember(group.id, userA.id);
    await addActiveMember(group.id, userB.id);
    await addActiveMember(group.id, userC.id);

    const platform = "shopee" as const;
    const externalProductId = `TEST-PRODUCT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

    // Step 1: userA and userB each capture "the same" external product.
    const captureIdA = await makeCaptureSession({
      userId: userA.id,
      tenantId,
      platform,
      externalProductId,
      sourceUrl: `https://shopee.co.th/product/1/${externalProductId}?viewer=a`,
    });
    const captureIdB = await makeCaptureSession({
      userId: userB.id,
      tenantId,
      platform,
      externalProductId,
      sourceUrl: `https://shopee.co.th/product/1/${externalProductId}?viewer=b`,
    });

    // Step 2: userA confirms first — creates a brand new marketplace_products row.
    const confirmA = await confirmMarketplaceCapture(
      captureIdA,
      buildConfirmInput({
        productName: "Original Product Name (userA capture)",
        affiliateUrl: "https://affiliate.example.com/userA",
        priceCurrent: 100,
      }),
      { userId: userA.id, tenantId },
    );
    const productId = confirmA.productId;
    createdProductIds.push(productId);
    expect(productId).toBeTruthy();

    // Step 3: share that product to the group with read_update permission.
    // Inserted directly (not via saveMarketplaceShareSetting/applyConfiguredShares)
    // because share-setting sync logic is not what's under test here.
    const shareId = createMarketplaceId("mpgs");
    await db.insert(marketplaceProductGroupShares).values({
      id: shareId,
      productId,
      tenantId,
      groupId: group.id,
      sharedByUserId: userA.id,
      platform,
      permission: "read_update",
    } as any);
    createdShareIds.push(shareId);

    // Step 4: userB (group member with read_update access) re-captures the
    // "same" external product. findAccessibleDuplicate() matches by
    // platform+externalProductId via the group share, so this updates the
    // SAME underlying marketplace_products row rather than creating a new one.
    const confirmB = await confirmMarketplaceCapture(
      captureIdB,
      buildConfirmInput({
        productName: "Updated Product Name (userB capture)",
        affiliateUrl: "https://affiliate.example.com/userB",
        priceCurrent: 200,
      }),
      { userId: userB.id, tenantId },
    );
    expect(confirmB.productId).toBe(productId);
    expect(confirmB.status).toBe("updated_group_shared_product");

    // Step 5 (the crux of the regression test): each viewer must see their
    // OWN affiliate link, not the other member's, even though it's the same
    // underlying shared row.
    const bundleForA = await getMarketplaceProductWithAccess(productId, { userId: userA.id, tenantId });
    const bundleForB = await getMarketplaceProductWithAccess(productId, { userId: userB.id, tenantId });

    expect(bundleForA.product.id).toBe(productId);
    expect(bundleForB.product.id).toBe(productId);
    expect(bundleForA.product.affiliateUrl).toBe("https://affiliate.example.com/userA");
    expect(bundleForB.product.affiliateUrl).toBe("https://affiliate.example.com/userB");

    // Prove it is genuinely the same shared row (not two separate products):
    // the shared productName field reflects userB's latest capture for BOTH viewers.
    expect(bundleForA.product.productName).toBe("Updated Product Name (userB capture)");
    expect(bundleForB.product.productName).toBe("Updated Product Name (userB capture)");

    // Same assertions via the list endpoint.
    const listForA = (await listMarketplaceProductsWithAccess({ userId: userA.id, tenantId })) as any[];
    const listForB = (await listMarketplaceProductsWithAccess({ userId: userB.id, tenantId })) as any[];
    const itemForAInList = listForA.find((item) => item.id === productId);
    const itemForBInList = listForB.find((item) => item.id === productId);

    expect(itemForAInList).toBeTruthy();
    expect(itemForBInList).toBeTruthy();
    expect(itemForAInList.affiliateUrl).toBe("https://affiliate.example.com/userA");
    expect(itemForBInList.affiliateUrl).toBe("https://affiliate.example.com/userB");

    // Step 6: userC is a group member with access to the shared product but
    // has never captured/confirmed it or set their own affiliate link — they
    // must see an empty link, not userA's or userB's.
    const bundleForC = await getMarketplaceProductWithAccess(productId, { userId: userC.id, tenantId });
    expect(bundleForC.product.id).toBe(productId);
    expect(bundleForC.product.affiliateUrl).toBeNull();
  });
});
