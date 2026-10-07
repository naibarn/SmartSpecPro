import { describe, expect, it } from "vitest";
import { buildResearchNotesSummaryJobDefinition, researchNoteSourceVersionHash } from "./researchNotesSummaryContract";

describe("Research Notes summary job contract", () => {
  const sourceVersionHash = researchNoteSourceVersionHash("Interview", "Three customers asked for exports.");
  const base = {
    tenantId: "tenant-1",
    userId: 7,
    appId: "research-app",
    projectId: "project-1",
    noteId: "note-1",
    sourceVersionHash,
  };

  it("binds retries to an exact tenant, note version and the canonical worker outbox", () => {
    const definition = buildResearchNotesSummaryJobDefinition(base);
    expect(definition).toMatchObject({
      tenantId: "tenant-1",
      requestedByUserId: 7,
      jobType: "research_notes.summarize",
      contractVersion: "mini-app-research-v1",
      executionClass: "long",
      input: {
        contractVersion: "mini-app-research-v1",
        appId: "research-app",
        projectId: "project-1",
        noteId: "note-1",
        sourceVersionHash,
      },
      retryPolicy: { maxAttempts: 3, baseDelayMs: 5_000, maxDelayMs: 300_000 },
    });
    expect(definition.idempotencyKey).toMatch(/^research-notes-summary:/);
    expect(definition.activeDedupeKey).toContain("note-1");
    expect(JSON.stringify(definition.input)).not.toContain("Three customers");
  });

  it("creates a new idempotency identity when the source version changes", () => {
    const first = buildResearchNotesSummaryJobDefinition(base);
    const second = buildResearchNotesSummaryJobDefinition({
      ...base,
      sourceVersionHash: researchNoteSourceVersionHash("Interview", "Updated findings"),
    });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.activeDedupeKey).toBe(first.activeDedupeKey);
  });
});
