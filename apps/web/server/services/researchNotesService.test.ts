import { describe, expect, it } from "vitest";
import { createResearchNote, createResearchProject, ResearchNotesError } from "./researchNotesService";

describe("researchNotesService input boundaries", () => {
  it("fails closed without tenant, principal, or App context before database access", async () => {
    await expect(createResearchProject({ tenantId: "", principalId: "user:1", appId: "app-1", title: "Research" }))
      .rejects.toMatchObject<Partial<ResearchNotesError>>({ code: "INVALID_INPUT" });
  });

  it("rejects empty or oversized project titles before database access", async () => {
    const scope = { tenantId: "tenant-a", principalId: "user:1", appId: "app-1" };
    await expect(createResearchProject({ ...scope, title: "  " }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createResearchProject({ ...scope, title: "x".repeat(201) }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("bounds UTF-8 note payload size before database access", async () => {
    await expect(createResearchNote({
      tenantId: "tenant-a",
      principalId: "user:1",
      appId: "app-1",
      projectId: "project-1",
      title: "Research",
      content: "🙂".repeat(65_537),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
