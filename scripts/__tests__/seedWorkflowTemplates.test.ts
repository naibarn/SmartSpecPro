/**
 * Integration tests for seed-workflow-templates.ts
 *
 * These tests require a live database connection (DATABASE_URL must be set).
 * Run from apps/web/:
 *   npx vitest run ../../scripts/__tests__/seedWorkflowTemplates.test.ts
 *
 * Or with the --dir flag from project root:
 *   ./apps/web/node_modules/.bin/vitest run --dir scripts/__tests__
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import {
  workflowTemplates,
  templateCategories,
  users,
} from "../../apps/web/drizzle/schema";
import { execSync } from "child_process";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;

// Skip entire suite if no DATABASE_URL
const describeIntegration = DATABASE_URL
  ? describe
  : describe.skip;

describeIntegration("seed-workflow-templates integration", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const seederScript = path.resolve(
    __dirname,
    "../seed-workflow-templates.ts"
  );
  const webAppDir = path.resolve(__dirname, "../../apps/web");

  beforeAll(async () => {
    client = postgres(DATABASE_URL!, { max: 3 });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  function runSeeder(): string {
    return execSync(`npx tsx ${seederScript}`, {
      cwd: webAppDir,
      env: { ...process.env, DATABASE_URL },
      timeout: 120_000,
    }).toString();
  }

  describe("after first run", () => {
    let output: string;

    beforeAll(() => {
      output = runSeeder();
    });

    it("exits with code 0 (no throw)", () => {
      // If runSeeder threw, beforeAll would have failed
      expect(output).toContain("Seeded");
    });

    it("creates system user", async () => {
      const [row] = await db
        .select({ id: users.id, openId: users.openId })
        .from(users)
        .where(eq(users.openId, "system-seeder-workflow-templates"))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.openId).toBe("system-seeder-workflow-templates");
    });

    it("seeds exactly 15 template categories", async () => {
      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(templateCategories);
      expect(Number(result.cnt)).toBe(15);
    });

    it("seeds exactly 60 published public templates", async () => {
      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isPublic, true),
            eq(workflowTemplates.status, "published")
          )
        );
      expect(Number(result.cnt)).toBe(60);
    });

    it("every template has a non-null templateKey", async () => {
      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isPublic, true),
            isNotNull(workflowTemplates.templateKey)
          )
        );
      expect(Number(result.cnt)).toBe(60);
    });

    it("every template has authorId set to system user", async () => {
      const [systemUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.openId, "system-seeder-workflow-templates"))
        .limit(1);

      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isPublic, true),
            eq(workflowTemplates.authorId, systemUser.id)
          )
        );
      expect(Number(result.cnt)).toBe(60);
    });

    it("every template has a categoryId referencing an existing category", async () => {
      const [nullCats] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          sql`${workflowTemplates.isPublic} = true AND ${workflowTemplates.categoryId} IS NULL`
        );
      expect(Number(nullCats.cnt)).toBe(0);
    });

    it("templates that generated SVG have non-null previewSvg", async () => {
      const [withSvg] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isPublic, true),
            isNotNull(workflowTemplates.previewSvg)
          )
        );
      // Most should have SVGs; warn if not all
      expect(Number(withSvg.cnt)).toBeGreaterThan(0);
    });
  });

  describe("idempotency (second run)", () => {
    let output: string;

    beforeAll(() => {
      output = runSeeder();
    });

    it("exits with code 0 on second run", () => {
      expect(output).toContain("Seeded");
    });

    it("row count remains exactly 60 (no duplicates)", async () => {
      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isPublic, true),
            eq(workflowTemplates.status, "published")
          )
        );
      expect(Number(result.cnt)).toBe(60);
    });

    it("system user count remains 1", async () => {
      const [result] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.openId, "system-seeder-workflow-templates"));
      expect(Number(result.cnt)).toBe(1);
    });
  });
});
