import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockExecuteSkillLlmWithFallback,
  mockSettleSkillRun,
  selectResults,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const makeSelectQuery = () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.from = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.limit = vi.fn(async () => selectResults.shift() ?? []);
    return query;
  };
  return {
    selectResults,
    mockExecuteSkillLlmWithFallback: vi.fn(),
    mockSettleSkillRun: vi.fn(),
    mockDb: {
      select: vi.fn(() => makeSelectQuery()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
      })),
    },
  };
});

vi.mock("../../db", () => ({ db: mockDb }));
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: (...args: unknown[]) => mockExecuteSkillLlmWithFallback(...args),
}));
vi.mock("../skillRevenueBilling", () => ({
  settleSkillRun: (...args: unknown[]) => mockSettleSkillRun(...args),
}));
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(async () => ({ id: "vertical-drama-emotion-score-director" })),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(async () => ({ modelId: "openai/gpt-4o-mini", requirementsFallback: false })),
}));
vi.mock("../verticalDramaInteractiveJobs", () => ({
  cancelVerticalDramaInteractiveJob: vi.fn(),
  enqueueVerticalDramaInteractiveJob: vi.fn(),
}));
vi.mock("../verticalDramaAudioPipelineCoordinator", () => ({
  reconcileApprovedVerticalDramaAudioPipeline: vi.fn(),
}));

import { runVerticalDramaEmotionPlanJob } from "../verticalDramaAudioScoring";

const analysis = {
  id: "analysis-1",
  tenantId: "tenant-1",
  userId: 7,
  seriesId: 53,
  episodeId: 261,
  status: "queued",
  sourceRevision: "revision-1",
  sourceHash: "a".repeat(64),
  sourceSnapshot: { source: "fixture" },
};

function makeLlmResult(content: string) {
  return {
    success: true,
    content,
    modelId: "openai/gpt-4o-mini",
    provider: { providerName: "openrouter" },
    inputTokens: 100,
    outputTokens: 50,
  };
}

describe("vertical drama audio skill billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    selectResults.push([analysis], [], []);
    mockExecuteSkillLlmWithFallback
      .mockResolvedValueOnce(makeLlmResult(JSON.stringify({ result: { regions: [], cues: [] } })))
      .mockResolvedValueOnce(makeLlmResult(JSON.stringify({ result: { disposition: "needs_review", findings: [] } })));
    mockSettleSkillRun.mockResolvedValue({ totalCredits: 8 });
  });

  it("settles analysis and critique as one logical skill run", async () => {
    await runVerticalDramaEmotionPlanJob(
      {
        tenantId: "tenant-1",
        userId: 7,
        skillSlug: "vertical-drama-emotion-score-director",
        input: { analysisId: "analysis-1" },
      } as never,
      { jobId: "job-1", traceId: "trace-1" },
    );

    expect(mockSettleSkillRun).toHaveBeenCalledTimes(1);
    expect(mockSettleSkillRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: "trace-1",
      userId: 7,
      tenantId: "tenant-1",
      skillSlug: "vertical-drama-emotion-score-director",
      metadata: expect.objectContaining({
        analysisModel: "openai/gpt-4o-mini",
        analysisProvider: "openrouter",
        critiqueModel: "openai/gpt-4o-mini",
        critiqueProvider: "openrouter",
      }),
    }));
  });

  it("does not settle when critique fails", async () => {
    mockExecuteSkillLlmWithFallback.mockReset();
    mockExecuteSkillLlmWithFallback
      .mockResolvedValueOnce(makeLlmResult(JSON.stringify({ result: { regions: [], cues: [] } })))
      .mockResolvedValueOnce({ success: false, error: "provider unavailable" });

    await expect(runVerticalDramaEmotionPlanJob(
      {
        tenantId: "tenant-1",
        userId: 7,
        skillSlug: "vertical-drama-emotion-score-director",
        input: { analysisId: "analysis-1" },
      } as never,
      { jobId: "job-1", traceId: "trace-1" },
    )).rejects.toThrow("SKILL_CRITIQUE_FAILED");
    expect(mockSettleSkillRun).not.toHaveBeenCalled();
  });
});
