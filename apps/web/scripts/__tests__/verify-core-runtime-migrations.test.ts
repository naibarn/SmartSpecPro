import { describe, expect, it } from "vitest";
import { evaluateCoreRuntimeMigrationPostconditions } from "../verify-core-runtime-migrations";

describe("core runtime migration postconditions", () => {
  const readyCatalog = {
    tables: [
      "canonical_projects",
      "app_identities",
      "mini_app_project_wiki_pages",
      "user_github_connections",
    ],
    columns: [
      "mini_app_project_wiki_pages.page_id",
      "mini_app_project_wiki_pages.tenant_id",
      "mini_app_project_wiki_pages.project_id",
      "mini_app_project_wiki_pages.app_id",
      "mini_app_project_wiki_pages.owner_principal_id",
      "mini_app_project_wiki_pages.path",
      "mini_app_project_wiki_pages.content_hash",
      "user_github_connections.user_id",
      "user_github_connections.tenant_id",
      "user_github_connections.github_login",
      "user_github_connections.token_encrypted",
    ],
    constraints: [
      "mini_app_project_wiki_pages_tenant_page_unique",
      "mini_app_project_wiki_pages_project_fk",
      "mini_app_project_wiki_pages_app_fk",
      "mini_app_project_wiki_pages_lifecycle_check",
      "mini_app_project_wiki_pages_path_nonempty_check",
      "mini_app_project_wiki_pages_content_hash_check",
      "user_github_connections_user_id_users_id_fk",
    ],
    indexes: [
      "mini_app_project_wiki_pages_stable_id_unique",
      "mini_app_project_wiki_pages_active_path_unique",
      "mini_app_project_wiki_pages_updated_idx",
      "user_github_connections_user_unique",
    ],
    enumLabels: ["external_runtime"],
  };

  it("accepts the required wiki, GitHub connection and external runtime objects", () => {
    expect(evaluateCoreRuntimeMigrationPostconditions(readyCatalog)).toEqual({
      status: "READY",
      missing: {
        tables: [],
        columns: [],
        constraints: [],
        indexes: [],
        enumLabels: [],
      },
    });
  });

  it("reports exact missing runtime objects", () => {
    const report = evaluateCoreRuntimeMigrationPostconditions({
      ...readyCatalog,
      tables: readyCatalog.tables.filter(
        name => name !== "user_github_connections"
      ),
      enumLabels: [],
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.missing.tables).toEqual(["user_github_connections"]);
    expect(report.missing.enumLabels).toEqual(["external_runtime"]);
  });
});
