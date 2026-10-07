import { describe, expect, it, vi } from "vitest";
import { createResearchNotesSummaryExecutor } from "./researchNotesSummaryExecutor";
import { researchNoteSourceVersionHash } from "./researchNotesSummaryContract";
import { ResearchNotesError } from "./researchNotesService";

function setup(overrides: Record<string, unknown> = {}) {
  const note: {
    noteId: string;
    title: string;
    content: string;
    aiSummary: string | null;
  } = {
    noteId: "note-1",
    title: "Interview",
    content: "Three customers asked for exports.",
    aiSummary: null,
  };
  const loadNote = vi.fn(async () => note);
  const saveSummary = vi.fn(async () => "Three interviewed customers requested export support.");
  const summarize = vi.fn(async () => "Three interviewed customers requested export support.");
  const reporter = { assertActive: vi.fn(), progress: vi.fn() };
  const executor = createResearchNotesSummaryExecutor({ loadNote, saveSummary, summarize, ...overrides } as any);
  const context = {
    tenantId: "tenant-1",
    requestedByUserId: 7,
    contractVersion: "mini-app-research-v1",
    input: {
      contractVersion: "mini-app-research-v1",
      appId: "research-app",
      projectId: "project-1",
      noteId: "note-1",
      sourceVersionHash: researchNoteSourceVersionHash(note.title, note.content),
    },
  };
  return { executor, context, note, loadNote, saveSummary, summarize, reporter };
}

describe("Research Notes summary worker", () => {
  it("rechecks authenticated scope, summarizes and saves only the bound note version", async () => {
    const { executor, context, loadNote, saveSummary, summarize, reporter } = setup();
    const result = await executor({ context, lease: { jobId: "job-1" } as any, reporter: reporter as any } as any);
    expect(loadNote).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      principalId: "user:7",
      appId: "research-app",
      projectId: "project-1",
      noteId: "note-1",
    });
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", userId: 7, noteId: "note-1" }));
    expect(saveSummary).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      principalId: "user:7",
      sourceVersionHash: context.input.sourceVersionHash,
    }));
    expect(result).toMatchObject({ output: { noteId: "note-1", cached: false } });
    expect(reporter.assertActive).toHaveBeenCalledTimes(2);
  });

  it("avoids another provider call when a previous attempt already saved the summary", async () => {
    const { executor, context, note, summarize, saveSummary } = setup();
    note.aiSummary = "Already saved summary";
    const result = await executor({ context, lease: { jobId: "job-1" } as any, reporter: { assertActive: vi.fn(), progress: vi.fn() } as any } as any);
    expect(summarize).not.toHaveBeenCalled();
    expect(saveSummary).not.toHaveBeenCalled();
    expect(result).toMatchObject({ output: { summary: "Already saved summary", cached: true } });
  });

  it("fails permanently when project permission is revoked before execution", async () => {
    const { executor, context, summarize } = setup({ loadNote: vi.fn(async () => { throw new ResearchNotesError("PROJECT_NOT_FOUND"); }) });
    await expect(executor({ context, lease: { jobId: "job-1" } as any, reporter: { assertActive: vi.fn(), progress: vi.fn() } as any } as any))
      .rejects.toMatchObject({ class: "permanent", diagnosticCode: "RESEARCH_NOTES_SUMMARY_SCOPE_REVOKED" });
    expect(summarize).not.toHaveBeenCalled();
  });

  it("marks transient provider failures retryable", async () => {
    const { executor, context } = setup({ summarize: vi.fn(async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); }) });
    await expect(executor({ context, lease: { jobId: "job-1" } as any, reporter: { assertActive: vi.fn(), progress: vi.fn() } as any } as any))
      .rejects.toMatchObject({ class: "retryable", diagnosticCode: "RESEARCH_NOTES_SUMMARY_PROVIDER_RETRYABLE" });
  });

  it("does not save a summary for a note version that changed after admission", async () => {
    const { executor, context, note, summarize, saveSummary } = setup();
    note.content = "Revised findings";
    await expect(executor({ context, lease: { jobId: "job-1" } as any, reporter: { assertActive: vi.fn(), progress: vi.fn() } as any } as any))
      .rejects.toMatchObject({ class: "permanent", diagnosticCode: "RESEARCH_NOTES_SUMMARY_SOURCE_CHANGED" });
    expect(summarize).not.toHaveBeenCalled();
    expect(saveSummary).not.toHaveBeenCalled();
  });
});
