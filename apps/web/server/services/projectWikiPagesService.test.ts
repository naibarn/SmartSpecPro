import { describe, expect, it } from "vitest";
import { createProjectWikiPage, ProjectWikiPagesError } from "./projectWikiPagesService";

describe("projectWikiPagesService input boundaries", () => {
  it("fails closed without tenant, principal, or App authority before database access", async () => {
    await expect(createProjectWikiPage({ tenantId: "", principalId: "user:1", appId: "app-1", projectId: "project-1", title: "Home", path: "home", content: "" }))
      .rejects.toMatchObject<Partial<ProjectWikiPagesError>>({ code: "INVALID_INPUT" });
  });

  it("rejects empty, oversized, and unsafe page paths", async () => {
    const scope = { tenantId: "tenant-a", principalId: "user:1", appId: "app-1", projectId: "project-1", content: "" };
    await expect(createProjectWikiPage({ ...scope, title: " ", path: "home" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createProjectWikiPage({ ...scope, title: "x".repeat(201), path: "home" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createProjectWikiPage({ ...scope, title: "Home", path: "../private" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createProjectWikiPage({ ...scope, title: "Home", path: "x".repeat(513) })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("bounds UTF-8 content before database access", async () => {
    await expect(createProjectWikiPage({ tenantId: "tenant-a", principalId: "user:1", appId: "app-1", projectId: "project-1", title: "Home", path: "home", content: "🙂".repeat(65_537) }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
