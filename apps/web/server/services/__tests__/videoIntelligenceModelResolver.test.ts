/**
 * Feature 142 — section-02: Structured-output model resolver.
 *
 * Pure-service style: injected doubles via the `dependencies` argument,
 * ZERO `vi.mock` module mocks. See
 * specs/feature/142-video-intelligence-structured-planning-qa-engine/
 * sections/section-02-model-resolver.md §5 for the authoritative test list.
 */
import { describe, it, expect, vi } from "vitest";

import type { EnabledLlmModelRow } from "../enabledLlmModels";
import {
  AUTOMATIC_LLM_MODEL_VALUE,
  VI_STRUCTURED_STAGE_REQUIREMENTS,
  VideoIntelligenceModelError,
  resolveStructuredStageModel,
  resolveStructuredStageModelSelection,
  assertStructuredStageModelAvailable,
  reportStructuredOutputViolation,
  type VideoIntelligenceModelResolverDeps,
} from "../videoIntelligenceModelResolver";

function makeRow(overrides?: Partial<EnabledLlmModelRow>): EnabledLlmModelRow {
  return {
    providerId: 1,
    providerName: "test-provider",
    modelId: "test/model-a",
    providerModelId: "model-a",
    legacyModelAliases: null,
    defaultModel: null,
    apiStyle: "chat-completions",
    supportsVision: null,
    supportsThinking: null,
    supportsFunctionTools: null,
    supportsStructuredOutputs: true,
    supportsJsonMode: null,
    supportsStrictToolSchema: null,
    supportsWebSearch: null,
    supportsCodeExecution: null,
    supportsComputerUse: null,
    supportsBackground: null,
    supportsResponses: null,
    contextLength: 128_000,
    priority: 10,
    priorityLocked: null,
    isRecommended: true,
    isFree: false,
    pricingInput: "1.5",
    pricingOutput: "3",
    ...overrides,
  };
}

function makeDeps(
  overrides?: Partial<VideoIntelligenceModelResolverDeps>,
): Partial<VideoIntelligenceModelResolverDeps> {
  return {
    loadRows: vi.fn().mockResolvedValue([]),
    selectCandidates: vi.fn().mockReturnValue([]),
    recordStrike: vi
      .fn()
      .mockResolvedValue({ recorded: false, revoked: false, strikeCount: 0 }),
    logAudit: vi.fn(),
    ...overrides,
  };
}

describe("resolveStructuredStageModel", () => {
  it("returns an explicit pin unchanged", async () => {
    const deps = makeDeps({ loadRows: vi.fn().mockResolvedValue([]) });
    const result = await resolveStructuredStageModel(
      "provider/pinned-model",
      deps,
    );
    expect(result).toBe("provider/pinned-model");
  });

  it("returns the pin even when loadRows rejects (relaxed per §5 assertion notes — this module shares one code path with …Selection, whose pin branch also enriches pricing from the same row load)", async () => {
    const deps = makeDeps({
      loadRows: vi.fn().mockRejectedValue(new Error("db unreachable")),
    });
    const result = await resolveStructuredStageModel(
      "provider/pinned-model",
      deps,
    );
    expect(result).toBe("provider/pinned-model");
  });

  it("ignores the '__automatic__' sentinel and resolves from the recommended set", async () => {
    const rows = [makeRow({ modelId: "test/model-a" })];
    const selectCandidates = vi.fn().mockReturnValue(["test/model-a"]);
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue(rows),
      selectCandidates,
    });
    const result = await resolveStructuredStageModel(
      AUTOMATIC_LLM_MODEL_VALUE,
      deps,
    );
    expect(result).toBe("test/model-a");
    expect(selectCandidates).toHaveBeenCalledTimes(1);
  });

  it("requires BOTH recommendedOnly and supportsStructuredOutputs in the candidate query", async () => {
    const rows = [makeRow({ modelId: "test/model-a" })];
    const selectCandidates = vi.fn().mockReturnValue(["test/model-a"]);
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue(rows),
      selectCandidates,
    });

    await resolveStructuredStageModel(undefined, deps);

    expect(selectCandidates).toHaveBeenCalledTimes(1);
    const [requirements, passedRows, maxCandidates] =
      selectCandidates.mock.calls[0];
    expect(requirements).toMatchObject({
      recommendedOnly: true,
      supportsStructuredOutputs: true,
    });
    expect(requirements).toEqual(VI_STRUCTURED_STAGE_REQUIREMENTS);
    expect(passedRows).toBe(rows);
    expect(maxCandidates).toBe(50);
  });

  it("throws VI_NO_RECOMMENDED_MODEL when no candidate exists — never degrades silently", async () => {
    const selectCandidates = vi.fn().mockReturnValue([]);
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([makeRow()]),
      selectCandidates,
    });

    let thrown: unknown;
    try {
      await resolveStructuredStageModel(undefined, deps);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(VideoIntelligenceModelError);
    expect((thrown as VideoIntelligenceModelError).code).toBe(
      "VI_NO_RECOMMENDED_MODEL",
    );
    expect((thrown as Error).message).toContain("VI_NO_RECOMMENDED_MODEL");
    expect((thrown as Error).message).toContain("/admin/llm-models");
    // AD-3: no second, looser attempt.
    expect(selectCandidates).toHaveBeenCalledTimes(1);
  });

  it("propagates a row-load failure instead of reporting VI_NO_RECOMMENDED_MODEL", async () => {
    const loadError = new Error("db unreachable");
    const selectCandidates = vi.fn().mockReturnValue([]);
    const deps = makeDeps({
      loadRows: vi.fn().mockRejectedValue(loadError),
      selectCandidates,
    });

    await expect(resolveStructuredStageModel(undefined, deps)).rejects.toBe(
      loadError,
    );
    expect(selectCandidates).not.toHaveBeenCalled();
  });
});

describe("resolveStructuredStageModelSelection", () => {
  it("returns the winning candidate's pricing per 1M tokens from the row it loaded", async () => {
    const row = makeRow({
      modelId: "test/model-a",
      pricingInput: "2.5",
      pricingOutput: "10",
      isFree: false,
    });
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([row]),
      selectCandidates: vi.fn().mockReturnValue(["test/model-a"]),
    });

    const result = await resolveStructuredStageModelSelection(undefined, deps);

    expect(result).toEqual({
      modelId: "test/model-a",
      source: "recommended",
      pricingInputPerMTokUsd: 2.5,
      pricingOutputPerMTokUsd: 10,
      isFree: false,
    });
  });

  it("reports null pricing (not 0) when the row carries no parsable price", async () => {
    const row = makeRow({
      modelId: "test/model-a",
      pricingInput: "not-a-number",
      pricingOutput: "-5",
      isFree: false,
    });
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([row]),
      selectCandidates: vi.fn().mockReturnValue(["test/model-a"]),
    });

    const result = await resolveStructuredStageModelSelection(undefined, deps);

    expect(result.pricingInputPerMTokUsd).toBeNull();
    expect(result.pricingOutputPerMTokUsd).toBeNull();
    expect(result.pricingInputPerMTokUsd).not.toBe(0);
    expect(result.pricingOutputPerMTokUsd).not.toBe(0);
  });

  it("returns null pricing for an off-catalog explicit pin without throwing", async () => {
    const deps = makeDeps({ loadRows: vi.fn().mockResolvedValue([]) });

    const result = await resolveStructuredStageModelSelection(
      "off-catalog/pin",
      deps,
    );

    expect(result).toEqual({
      modelId: "off-catalog/pin",
      source: "explicit_pin",
      pricingInputPerMTokUsd: null,
      pricingOutputPerMTokUsd: null,
      isFree: false,
    });
  });

  it("marks a free row isFree with zero pricing", async () => {
    const row = makeRow({
      modelId: "test/model-a",
      isFree: true,
      pricingInput: "0",
      pricingOutput: "0",
    });
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([row]),
      selectCandidates: vi.fn().mockReturnValue(["test/model-a"]),
    });

    const result = await resolveStructuredStageModelSelection(undefined, deps);

    expect(result.isFree).toBe(true);
    expect(result.pricingInputPerMTokUsd).toBe(0);
    expect(result.pricingOutputPerMTokUsd).toBe(0);
  });
});

describe("assertStructuredStageModelAvailable", () => {
  it("resolves when the model is still enabled, recommended and structured-output capable", async () => {
    const rows = [makeRow({ modelId: "test/model-a" })];
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue(rows),
      selectCandidates: vi
        .fn()
        .mockReturnValue(["test/model-a", "test/model-b"]),
    });

    await expect(
      assertStructuredStageModelAvailable("test/model-a", deps),
    ).resolves.toBeUndefined();
  });

  it("throws VI_NO_RECOMMENDED_MODEL when the model was revoked since dispatch", async () => {
    const rows = [makeRow({ modelId: "test/model-a", isRecommended: false })];
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue(rows),
      // The revoked row no longer clears VI_STRUCTURED_STAGE_REQUIREMENTS.
      selectCandidates: vi.fn().mockReturnValue([]),
    });

    await expect(
      assertStructuredStageModelAvailable("test/model-a", deps),
    ).rejects.toBeInstanceOf(VideoIntelligenceModelError);
  });

  it("throws VI_NO_RECOMMENDED_MODEL when the model was disabled since dispatch", async () => {
    const deps = makeDeps({
      // A disabled model is absent from loadEnabledLlmModelRows() entirely.
      loadRows: vi.fn().mockResolvedValue([]),
      selectCandidates: vi.fn().mockReturnValue([]),
    });

    await expect(
      assertStructuredStageModelAvailable("test/model-a", deps),
    ).rejects.toBeInstanceOf(VideoIntelligenceModelError);
  });

  it("never substitutes a different model", async () => {
    const rows = [makeRow({ modelId: "test/model-b" })];
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue(rows),
      selectCandidates: vi.fn().mockReturnValue(["test/model-b"]),
    });

    await expect(
      assertStructuredStageModelAvailable("test/model-a", deps),
    ).rejects.toBeInstanceOf(VideoIntelligenceModelError);
  });

  it("propagates a row-load failure instead of reporting VI_NO_RECOMMENDED_MODEL", async () => {
    const loadError = new Error("db unreachable");
    const deps = makeDeps({ loadRows: vi.fn().mockRejectedValue(loadError) });

    await expect(
      assertStructuredStageModelAvailable("test/model-a", deps),
    ).rejects.toBe(loadError);
  });
});

describe("reportStructuredOutputViolation", () => {
  it("records a contract_violation strike carrying the zod issue paths", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: true, revoked: false, strikeCount: 1 });
    const deps = makeDeps({ recordStrike });

    reportStructuredOutputViolation(
      {
        modelId: "test/model-a",
        traceId: "trace-1",
        zodIssuePaths: ["shots.0.dialogue", "finalQc"],
      },
      deps,
    );

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
    expect(recordStrike).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "test/model-a",
        reason: "contract_violation",
        detail: "shots.0.dialogue,finalQc",
      }),
    );
  });

  it("passes the traceId as the breaker's runId", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: true, revoked: false, strikeCount: 1 });
    const deps = makeDeps({ recordStrike });

    reportStructuredOutputViolation(
      { modelId: "test/model-a", traceId: "trace-xyz", zodIssuePaths: [] },
      deps,
    );

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
    expect(recordStrike.mock.calls[0][0]).toMatchObject({
      runId: "trace-xyz",
    });
  });

  it("never throws, even when the breaker rejects", async () => {
    const recordStrike = vi.fn().mockRejectedValue(new Error("breaker down"));
    const deps = makeDeps({ recordStrike });

    expect(() =>
      reportStructuredOutputViolation(
        { modelId: "test/model-a", traceId: "trace-1", zodIssuePaths: [] },
        deps,
      ),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
  });

  it("never throws when the breaker throws synchronously", async () => {
    const recordStrike = vi.fn(() => {
      throw new Error("sync boom");
    });
    const deps = makeDeps({ recordStrike });

    expect(() =>
      reportStructuredOutputViolation(
        { modelId: "test/model-a", traceId: "trace-1", zodIssuePaths: [] },
        deps,
      ),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
  });

  it("emits a stage audit event when the breaker reports revoked: true", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: true, revoked: true, strikeCount: 6 });
    const logAudit = vi.fn();
    const deps = makeDeps({ recordStrike, logAudit });

    reportStructuredOutputViolation(
      { modelId: "test/model-a", traceId: "trace-1", zodIssuePaths: ["shots"] },
      deps,
    );

    await vi.waitFor(() => {
      expect(logAudit).toHaveBeenCalledTimes(1);
    });
    const entry = logAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(entry.eventType).toBe("video_project_stage");
    const metadata = entry.metadata as Record<string, unknown>;
    expect(metadata.event).toBe("recommended_model_revoked");
    expect(metadata.modelId).toBe("test/model-a");
    expect(metadata.strikeCount).toBe(6);
  });

  it("emits NO audit event when the strike is recorded but not revoked", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: true, revoked: false, strikeCount: 2 });
    const logAudit = vi.fn();
    const deps = makeDeps({ recordStrike, logAudit });

    reportStructuredOutputViolation(
      { modelId: "test/model-a", traceId: "trace-1", zodIssuePaths: [] },
      deps,
    );

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("emits NO audit event when the strike was not recorded at all", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: false, revoked: false, strikeCount: 0 });
    const logAudit = vi.fn();
    const deps = makeDeps({ recordStrike, logAudit });

    reportStructuredOutputViolation(
      { modelId: null, traceId: "trace-1", zodIssuePaths: [] },
      deps,
    );

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("caps the joined zodIssuePaths detail so a pathological Zod error cannot bloat the strike row", async () => {
    const recordStrike = vi
      .fn()
      .mockResolvedValue({ recorded: true, revoked: false, strikeCount: 1 });
    const deps = makeDeps({ recordStrike });
    const hugePaths = Array.from({ length: 200 }, (_, i) => `field.${i}.value`);

    reportStructuredOutputViolation(
      { modelId: "test/model-a", traceId: "trace-1", zodIssuePaths: hugePaths },
      deps,
    );

    await vi.waitFor(() => {
      expect(recordStrike).toHaveBeenCalledTimes(1);
    });
    const detail = recordStrike.mock.calls[0][0].detail as string;
    expect(detail.length).toBeLessThanOrEqual(500);
  });
});

/**
 * Regression: an operator pin outranks the recommendation at dispatch (§4.2
 * rule 1), so re-checking it against `recommendedOnly` at execution time made
 * every explicitly-pinned model fail after a successful dispatch. Found during
 * section-02 implementation; the section doc's §4.3 was self-contradictory.
 */
describe("assertStructuredStageModelAvailable — explicit-pin source", () => {
  it("accepts a pinned model that is enabled but NOT in the recommended set", async () => {
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([
        makeRow({ modelId: "pinned/model", isRecommended: false }),
      ]),
      selectCandidates: vi.fn().mockReturnValue([]),
    });
    await expect(
      assertStructuredStageModelAvailable("pinned/model", deps, { source: "explicit_pin" }),
    ).resolves.toBeUndefined();
  });

  it("still rejects a pinned model that is no longer enabled at all", async () => {
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([makeRow({ modelId: "other/model" })]),
      selectCandidates: vi.fn().mockReturnValue([]),
    });
    await expect(
      assertStructuredStageModelAvailable("pinned/model", deps, { source: "explicit_pin" }),
    ).rejects.toMatchObject({ code: "VI_NO_RECOMMENDED_MODEL" });
  });

  it("defaults to the strict recommended check when no source is given", async () => {
    const deps = makeDeps({
      loadRows: vi.fn().mockResolvedValue([
        makeRow({ modelId: "pinned/model", isRecommended: false }),
      ]),
      selectCandidates: vi.fn().mockReturnValue([]),
    });
    await expect(
      assertStructuredStageModelAvailable("pinned/model", deps),
    ).rejects.toMatchObject({ code: "VI_NO_RECOMMENDED_MODEL" });
  });
});
