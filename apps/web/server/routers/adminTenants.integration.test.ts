/**
 * Integration tests for Admin Tenants Router
 *
 * These tests run against the REAL database to catch schema mismatches
 * that unit tests with mocked DB cannot detect.
 *
 * Run with:
 *   DATABASE_URL=postgresql://.../smartspec_test RUN_DB_INTEGRATION_TESTS=true npx vitest run server/routers/adminTenants.integration.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { tenants } from "../../drizzle/schema";

const RUN_DB_INTEGRATION_TESTS =
  process.env.RUN_DB_INTEGRATION_TESTS === "true";
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
const sql = postgres(DATABASE_URL);
const drizzleClient = postgres(DATABASE_URL);
const db = drizzle(drizzleClient);

// Track created tenant IDs for cleanup
const createdIds: string[] = [];

afterAll(async () => {
  // Clean up any test tenants
  for (const id of createdIds) {
    await sql`DELETE FROM tenants WHERE id = ${id}`.catch(() => {});
  }
  await sql.end();
  await drizzleClient.end();
});

describeDbSuite("Tenant DB Schema Integration", () => {
  it("can insert a tenant with all required fields", async () => {
    const tenantId = `tenant-inttest-${Date.now()}`;
    createdIds.push(tenantId);

    const [tenant] = await sql`
      INSERT INTO tenants (
        id, slug, name, "primaryDomain", domains,
        "logoUrl", "faviconUrl", "isActive",
        "themeConfig", "seoConfig", settings,
        "ownerId", status, plan, created_at, "createdAt", "updatedAt"
      ) VALUES (
        ${tenantId}, ${`test-${Date.now()}`}, 'Integration Test Tenant', 'inttest.example.com',
        '[]'::json, null, null, true,
        '{}'::json, '{}'::json, '{}'::json,
        null, 'ACTIVE', 'FREE', now(), now(), now()
      ) RETURNING *
    `;

    expect(tenant).toBeDefined();
    expect(tenant.id).toBe(tenantId);
    expect(tenant.status).toBe("ACTIVE");
    expect(tenant.plan).toBe("FREE");
    expect(tenant.created_at).toBeTruthy();
  });

  it("fails without required status column", async () => {
    const tenantId = `tenant-nostatus-${Date.now()}`;
    createdIds.push(tenantId);

    await expect(
      sql`
        INSERT INTO tenants (
          id, slug, name, "primaryDomain", domains,
          "isActive", "themeConfig", "seoConfig", settings,
          plan, created_at, "createdAt", "updatedAt"
        ) VALUES (
          ${tenantId}, ${`nostatus-${Date.now()}`}, 'No Status', 'nostatus.example.com',
          '[]'::json, true, '{}'::json, '{}'::json, '{}'::json,
          'FREE', now(), now(), now()
        ) RETURNING *
      `
    ).rejects.toThrow();
  });

  it("fails without required plan column", async () => {
    const tenantId = `tenant-noplan-${Date.now()}`;
    createdIds.push(tenantId);

    await expect(
      sql`
        INSERT INTO tenants (
          id, slug, name, "primaryDomain", domains,
          "isActive", "themeConfig", "seoConfig", settings,
          status, created_at, "createdAt", "updatedAt"
        ) VALUES (
          ${tenantId}, ${`noplan-${Date.now()}`}, 'No Plan', 'noplan.example.com',
          '[]'::json, true, '{}'::json, '{}'::json, '{}'::json,
          'ACTIVE', now(), now(), now()
        ) RETURNING *
      `
    ).rejects.toThrow();
  });

  it("fails without required created_at column", async () => {
    const tenantId = `tenant-nodate-${Date.now()}`;
    createdIds.push(tenantId);

    await expect(
      sql`
        INSERT INTO tenants (
          id, slug, name, "primaryDomain", domains,
          "isActive", "themeConfig", "seoConfig", settings,
          status, plan, "createdAt", "updatedAt"
        ) VALUES (
          ${tenantId}, ${`nodate-${Date.now()}`}, 'No Date', 'nodate.example.com',
          '[]'::json, true, '{}'::json, '{}'::json, '{}'::json,
          'ACTIVE', 'FREE', now(), now()
        ) RETURNING *
      `
    ).rejects.toThrow();
  });

  it("verifies Drizzle schema matches DB required columns", async () => {
    // Get all NOT NULL columns without defaults from DB
    const columns = await sql`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'tenants'
        AND is_nullable = 'NO'
        AND column_default IS NULL
      ORDER BY ordinal_position
    `;

    const requiredColumns = columns.map((c: any) => c.column_name);

    // These are the columns that MUST be provided on insert
    // If this test fails, it means the DB has a new NOT NULL column
    // that the Drizzle schema and insert code need to handle
    expect(requiredColumns).toContain("id");
    expect(requiredColumns).toContain("name");
    expect(requiredColumns).toContain("slug");
    expect(requiredColumns).toContain("status");
    expect(requiredColumns).toContain("plan");
    expect(requiredColumns).toContain("created_at");

    // Log for visibility
    console.log("Required NOT NULL columns (no default):", requiredColumns);
  });

  it("validates tenant status enum values", async () => {
    const result = await sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'tenantstatus'
      ORDER BY e.enumsortorder
    `;
    const validStatuses = result.map((r: any) => r.enumlabel);

    expect(validStatuses).toContain("ACTIVE");
    expect(validStatuses).toContain("SUSPENDED");
    expect(validStatuses).toContain("PENDING");
    expect(validStatuses).toContain("DELETED");
  });

  it("validates tenant plan enum values", async () => {
    const result = await sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'tenantplan'
      ORDER BY e.enumsortorder
    `;
    const validPlans = result.map((r: any) => r.enumlabel);

    expect(validPlans).toContain("FREE");
    expect(validPlans).toContain("STARTER");
    expect(validPlans).toContain("PROFESSIONAL");
    expect(validPlans).toContain("ENTERPRISE");
  });
});

/**
 * Drizzle ORM Integration Tests
 *
 * These tests use the actual Drizzle ORM with the schema definition
 * to catch issues that raw SQL tests cannot:
 * - Missing columns in Drizzle schema (silently ignored on insert)
 * - Type mismatches between Drizzle schema and DB
 * - Incorrect column mappings (e.g. camelCase vs snake_case)
 * - ID type issues (string vs number)
 */
describeDbSuite("Drizzle ORM Tenant CRUD", () => {
  it("inserts a tenant via Drizzle with all required fields", async () => {
    const tenantId = `tenant-drz-${Date.now()}`;
    createdIds.push(tenantId);

    const [tenant] = await db.insert(tenants).values({
      id: tenantId,
      slug: `drz-insert-${Date.now()}`,
      name: "Drizzle Insert Test",
      primaryDomain: `drz-${Date.now()}.example.com`,
      domains: [],
      isActive: true,
      themeConfig: {},
      seoConfig: {},
      settings: {},
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any).returning();

    expect(tenant).toBeDefined();
    expect(tenant.id).toBe(tenantId);
    expect(tenant.name).toBe("Drizzle Insert Test");
    expect(tenant.status).toBe("ACTIVE");
    expect(tenant.plan).toBe("FREE");
    expect(tenant.isActive).toBe(true);
  });

  it("reads a tenant by string ID via Drizzle eq()", async () => {
    const tenantId = `tenant-drz-read-${Date.now()}`;
    createdIds.push(tenantId);

    // Insert first
    await db.insert(tenants).values({
      id: tenantId,
      slug: `drz-read-${Date.now()}`,
      name: "Drizzle Read Test",
      primaryDomain: `drz-read-${Date.now()}.example.com`,
      domains: [],
      isActive: true,
      themeConfig: {},
      seoConfig: {},
      settings: {},
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any);

    // Read by string ID - this would fail if parseInt was used
    const [found] = await db.select().from(tenants).where(eq(tenants.id, tenantId));

    expect(found).toBeDefined();
    expect(found.id).toBe(tenantId);
    expect(found.name).toBe("Drizzle Read Test");
  });

  it("updates a tenant by string ID via Drizzle", async () => {
    const tenantId = `tenant-drz-upd-${Date.now()}`;
    createdIds.push(tenantId);

    await db.insert(tenants).values({
      id: tenantId,
      slug: `drz-upd-${Date.now()}`,
      name: "Before Update",
      primaryDomain: `drz-upd-${Date.now()}.example.com`,
      domains: [],
      isActive: true,
      themeConfig: {},
      seoConfig: {},
      settings: {},
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any);

    const [updated] = await db.update(tenants)
      .set({ name: "After Update", updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    expect(updated).toBeDefined();
    expect(updated.name).toBe("After Update");
    expect(updated.id).toBe(tenantId);
  });

  it("deletes a tenant by string ID via Drizzle", async () => {
    const tenantId = `tenant-drz-del-${Date.now()}`;
    createdIds.push(tenantId);

    await db.insert(tenants).values({
      id: tenantId,
      slug: `drz-del-${Date.now()}`,
      name: "Delete Me",
      primaryDomain: `drz-del-${Date.now()}.example.com`,
      domains: [],
      isActive: true,
      themeConfig: {},
      seoConfig: {},
      settings: {},
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any);

    await db.delete(tenants).where(eq(tenants.id, tenantId));

    const [found] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(found).toBeUndefined();
  });

  it("Drizzle insert without status/plan fails (DB enum has no default)", async () => {
    // This test documents that the DB enum columns (status, plan) do NOT have
    // defaults at the DB level, even though Drizzle schema defines .default().
    // Drizzle sends `default` keyword but the DB column has no DEFAULT constraint.
    // The router MUST always explicitly provide status and plan values.
    const tenantId = `tenant-drz-def-${Date.now()}`;
    createdIds.push(tenantId);

    await expect(
      db.insert(tenants).values({
        id: tenantId,
        slug: `drz-def-${Date.now()}`,
        name: "Defaults Test",
        primaryDomain: `drz-def-${Date.now()}.example.com`,
      } as any).returning()
    ).rejects.toThrow();
  });

  it("JSON fields round-trip correctly through Drizzle", async () => {
    const tenantId = `tenant-drz-json-${Date.now()}`;
    createdIds.push(tenantId);

    const themeConfig = { primaryColor: "#ff0000", layout: "modern" };
    const seoConfig = { defaultTitle: "Test Site", defaultKeywords: ["test"] };
    const settings = { enableBlog: true, enableGallery: false };
    const domainList = ["extra1.com", "extra2.com"];

    const [tenant] = await db.insert(tenants).values({
      id: tenantId,
      slug: `drz-json-${Date.now()}`,
      name: "JSON Test",
      primaryDomain: `drz-json-${Date.now()}.example.com`,
      domains: domainList,
      themeConfig,
      seoConfig,
      settings,
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any).returning();

    expect(tenant.themeConfig).toEqual(themeConfig);
    expect(tenant.seoConfig).toEqual(seoConfig);
    expect(tenant.settings).toEqual(settings);
    expect(tenant.domains).toEqual(domainList);
  });

  it("rejects duplicate slug via Drizzle (unique constraint)", async () => {
    const slug = `drz-dup-${Date.now()}`;
    const id1 = `tenant-drz-dup1-${Date.now()}`;
    const id2 = `tenant-drz-dup2-${Date.now()}`;
    createdIds.push(id1, id2);

    await db.insert(tenants).values({
      id: id1,
      slug,
      name: "First",
      primaryDomain: `drz-dup1-${Date.now()}.example.com`,
      status: "ACTIVE",
      plan: "FREE",
      created_at: new Date(),
      createdAt: new Date(),
    } as any);

    await expect(
      db.insert(tenants).values({
        id: id2,
        slug, // same slug
        name: "Second",
        primaryDomain: `drz-dup2-${Date.now()}.example.com`,
        status: "ACTIVE",
        plan: "FREE",
        created_at: new Date(),
        createdAt: new Date(),
      } as any)
    ).rejects.toThrow();
  });
});
