import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createMiniAppSupportMigrationPlan,
  selectMiniAppSupportMigrationSql,
} from "../mini-app-support-schema";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

describe("Mini-App targeted additive migrations", () => {
  it("selects only the 0394 wiki table and its three indexes", async () => {
    const sql = await readFile(
      path.join(appRoot, "drizzle/0394_project_wiki_pages_mini_app.sql"),
      "utf8"
    );
    const statements = selectMiniAppSupportMigrationSql("0394", [sql]);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(
      /^CREATE TABLE "mini_app_project_wiki_pages"/
    );
    expect(
      statements.slice(1).every(statement => statement.startsWith("CREATE "))
    ).toBe(true);
  });

  it("selects only the 0410 GitHub connection table and unique index", async () => {
    const sql = await readFile(
      path.join(appRoot, "drizzle/0410_mini_app_github_connections.sql"),
      "utf8"
    );
    const statements = selectMiniAppSupportMigrationSql("0410", [sql]);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE TABLE "user_github_connections"/);
    expect(statements[1]).toMatch(
      /^CREATE UNIQUE INDEX "user_github_connections_user_unique"/
    );
  });

  it("binds each repair plan to its exact migration source and table", () => {
    expect(createMiniAppSupportMigrationPlan("0394")).toMatchObject({
      endpoint: "mini-app-project-wiki-schema",
      tables: ["mini_app_project_wiki_pages"],
      sources: [{ tag: "0394_project_wiki_pages_mini_app", statements: 4 }],
    });
    expect(createMiniAppSupportMigrationPlan("0410")).toMatchObject({
      endpoint: "mini-app-github-connections-schema",
      tables: ["user_github_connections"],
      sources: [{ tag: "0410_mini_app_github_connections", statements: 2 }],
    });
  });

  it("rejects changed migration SQL rather than executing an unbound plan", async () => {
    const sql = await readFile(
      path.join(appRoot, "drizzle/0410_mini_app_github_connections.sql"),
      "utf8"
    );
    expect(() =>
      selectMiniAppSupportMigrationSql("0410", [`${sql}\n-- changed`])
    ).toThrow("SCHEMA_SOURCE_HASH_MISMATCH");
  });
});
