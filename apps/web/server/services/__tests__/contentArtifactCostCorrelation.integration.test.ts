import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import type { TrpcContext } from "../../_core/context";
import { contentQualityRouter } from "../../routers/contentQuality";

/** Exercise the production cost-breakdown query using only a disposable SPEC test database. */
describe("content artifact cost correlation (isolated PostgreSQL)", () => {
  let testDb: Awaited<ReturnType<typeof getDb>>;
  const tenantA = "spec038-cost-tenant-a";
  const tenantB = "spec038-cost-tenant-b";
  const userA = 938001;
  const userB = 938002;
  const generationA = "a4de58c4-80ac-4ea2-9d6e-23df297f1461";
  const generationB = "b5ef69d5-91bd-4fb3-ae7f-34e04808a572";
  const generationMissing = "c6fb70e6-a2ce-42ca-9e7f-45f15919b683";

  beforeAll(async () => {
    testDb = await getDb();
    if (!testDb) throw new Error("isolated PostgreSQL test database is required");
    const [{ database_name: databaseName }] = await testDb.execute(
      sql`SELECT current_database() AS database_name`,
    ) as unknown as [{ database_name: string }];
    if (!/^spec038_[a-z0-9_]+_test$/.test(databaseName)) {
      throw new Error("refusing cost-correlation fixtures outside the disposable SPEC-038 test database");
    }

    // This DB is created solely for this WorkUnit's integration tests. The small
    // table shapes are enough for the real router query and avoid running app migrations.
    await testDb.execute(sql.raw(`
      DROP TABLE IF EXISTS content_artifacts;
      DROP TABLE IF EXISTS provider_usage_log;
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (id integer PRIMARY KEY, "currentTenantId" varchar(36));
      CREATE TABLE provider_usage_log (
        id serial PRIMARY KEY,
        "userId" integer NOT NULL,
        "requestType" varchar(32),
        "skillSlug" varchar(100),
        "costUsd" numeric(12, 8) NOT NULL DEFAULT 0,
        "inputTokens" integer NOT NULL DEFAULT 0,
        "outputTokens" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE content_artifacts (
        id serial PRIMARY KEY,
        "tenantId" text NOT NULL,
        "skillSlug" text NOT NULL
      );
    `));
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0401_spec038_artifact_cost_correlation.sql"), "utf8");
    await testDb.execute(sql.raw(migration));

    await testDb.execute(sql`INSERT INTO users (id, "currentTenantId") VALUES (${userA}, ${tenantA}), (${userB}, ${tenantB})`);
    await testDb.execute(sql`
      INSERT INTO content_artifacts ("tenantId", "skillSlug", "contentGenerationId") VALUES
        (${tenantA}, 'writer-a', ${generationA}),
        (${tenantB}, 'writer-b', ${generationB})
    `);
    await testDb.execute(sql`
      INSERT INTO provider_usage_log ("userId", "requestType", "skillSlug", "costUsd", "inputTokens", "outputTokens", "contentGenerationId") VALUES
        (${userA}, 'skill', 'writer-a', 0.10, 100, 20, ${generationA}),
        (${userA}, 'skill', 'writer-a', 0.20, 200, 40, ${generationA}),
        (${userA}, 'skill', 'writer-a', 0.05, 50, 10, NULL),
        (${userA}, 'skill', 'writer-a', 0.07, 70, 14, ${generationMissing}),
        (${userA}, 'skill', 'writer-a', 0.09, 90, 18, ${generationB}),
        (${userB}, 'skill', 'writer-b', 0.50, 500, 100, ${generationB})
    `);
  });

  afterAll(async () => {
    if (!testDb) return;
    await testDb.execute(sql.raw(`
      DROP TABLE IF EXISTS content_artifacts;
      DROP TABLE IF EXISTS provider_usage_log;
      DROP TABLE IF EXISTS users;
    `));
  });

  function callerFor(tenantId: string, userId: number) {
    const ctx = {
      user: {
        id: userId,
        openId: `spec038-cost-${userId}`,
        email: `spec038-cost-${userId}@example.test`,
        name: "SPEC cost test admin",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { headers: {} },
      res: {},
      tenantId,
    } as unknown as TrpcContext;
    return contentQualityRouter.createCaller(ctx);
  }

  it("attributes all generation attempts to one artifact and separates legacy, missing, and cross-tenant usage", async () => {
    const result = await callerFor(tenantA, userA).getCostBreakdown({ days: 30 });

    expect(result.by_skill).toEqual([{
      skill_slug: "writer-a",
      total_cost_usd: 0.51,
      total_tokens: 612,
      request_count: 5,
      avg_cost_per_request: 0.102,
    }]);
    expect(result.by_artifact).toEqual([{
      artifact_id: expect.any(Number),
      skill_slug: "writer-a",
      total_cost_usd: 0.3,
      total_tokens: 360,
      request_count: 2,
    }]);
    expect(result.unattributed).toEqual({
      total_cost_usd: 0.21,
      total_tokens: 252,
      request_count: 3,
    });
  });

  it("does not expose another tenant's usage or artifacts", async () => {
    const result = await callerFor(tenantB, userB).getCostBreakdown({ days: 30 });

    expect(result.by_skill).toEqual([{
      skill_slug: "writer-b",
      total_cost_usd: 0.5,
      total_tokens: 600,
      request_count: 1,
      avg_cost_per_request: 0.5,
    }]);
    expect(result.by_artifact).toHaveLength(1);
    expect(result.by_artifact[0]).toMatchObject({
      skill_slug: "writer-b",
      total_cost_usd: 0.5,
      total_tokens: 600,
      request_count: 1,
    });
    expect(result.unattributed).toEqual({ total_cost_usd: 0, total_tokens: 0, request_count: 0 });
  });
});
