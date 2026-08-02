/**
 * Coverage for `videoProjectRepairRewriter.ts` (Feature 142, section-06
 * §5.2). Mock graph mirrors `videoProjectReviewAdapter.test.ts` exactly —
 * only two modules mocked:
 *
 * - `../callLLMStructured` — spread `importOriginal()` so
 *   `LLMStructuredOutputError` stays the REAL class.
 * - `../videoIntelligenceModelResolver` — same two-export shape section-03's
 *   test uses (this file only imports `reportStructuredOutputViolation`
 *   from that module, mirroring the adapter).
 *
 * `mockResolvedValue` / `mockRejectedValue` only, never `...Once` (recorded
 * `Once`-queue leak failure class, `memory/project_vitest_leak`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

vi.mock("../callLLMStructured", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../callLLMStructured")>()),
  callLLMStructured: vi.fn(),
}));
vi.mock("../videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModel: vi.fn(),
  reportStructuredOutputViolation: vi.fn(),
}));

import { callLLMStructured, LLMStructuredOutputError } from "../callLLMStructured";
import { reportStructuredOutputViolation } from "../videoIntelligenceModelResolver";
import { makeRepairEffects, VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING } from "../videoProjectRepairRewriter";
import type { RepairTarget } from "../videoProjectRepairApplier";

const REWRITER_SOURCE_PATH = path.resolve(__dirname, "../videoProjectRepairRewriter.ts");
const APPLIER_SOURCE_PATH = path.resolve(__dirname, "../videoProjectRepairApplier.ts");

const mockedCallLLMStructured = callLLMStructured as unknown as ReturnType<typeof vi.fn>;
const mockedReportStructuredOutputViolation =
  reportStructuredOutputViolation as unknown as ReturnType<typeof vi.fn>;

function targets(): RepairTarget[] {
  return [{ id: "scene:SC-1:narration", text: "old text", maxChars: 4000 }];
}

function successResult(
  overrides: Partial<{ data: Array<{ id: string; text: string }>; creditsUsed: number; modelId: string | null }> = {},
) {
  return {
    data: [{ id: "scene:SC-1:narration", text: "new text" }],
    tokensUsed: 50,
    creditsUsed: 3,
    providerName: "openrouter",
    modelId: "gpt-5",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof makeRepairEffects>[0]> = {}) {
  const onUsage = vi.fn();
  return {
    deps: {
      tenantId: "tenant-1",
      userId: 42,
      traceId: "trace-abc",
      modelId: "gpt-5",
      projectId: 7,
      onUsage,
      ...overrides,
    },
    onUsage,
  };
}

describe("makeRepairEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("makes exactly one callLLMStructured call per stage", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const effects = makeRepairEffects(deps);
    await effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() });

    expect(mockedCallLLMStructured).toHaveBeenCalledTimes(1);
  });

  it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset", async () => {
    const { deps } = makeDeps({ modelId: "claude-opus" });
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const effects = makeRepairEffects(deps);
    await effects.rewriteForStage({ stage: "content", instruction: "x", targets: targets() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.model).toBe("claude-opus");
    expect(call.preferredProviderId).toBeUndefined();
  });

  it("uses zodSchema (not schema) and systemPrompt + userMessage (not a generic input object)", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const effects = makeRepairEffects(deps);
    await effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.zodSchema).toBeDefined();
    expect(call.schema).toBeUndefined();
    expect(typeof call.systemPrompt).toBe("string");
    expect(typeof call.userMessage).toBe("string");
    expect(call.input).toBeUndefined();
    expect(JSON.parse(call.userMessage)).toEqual({
      stage: "narration",
      instruction: "x",
      targets: targets(),
    });
  });

  it("sets maxRetries to 2 for bounded schema retry", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const effects = makeRepairEffects(deps);
    await effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() });

    expect(mockedCallLLMStructured.mock.calls[0][0].maxRetries).toBe(2);
  });

  it("keeps the system framing thin — no rewriting rules, no tone guidance", () => {
    expect(VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING.length).toBeLessThan(600);
    const forbiddenTerms = ["friendly", "persuasive", "witty", "formal tone", "brand voice"];
    const lower = VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING.toLowerCase();
    for (const term of forbiddenTerms) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });

  it("reports creditsUsed and the served modelId through onUsage", async () => {
    const { deps, onUsage } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult({ creditsUsed: 11, modelId: "served-model" }));

    const effects = makeRepairEffects(deps);
    await effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() });

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 11, modelId: "served-model" });
  });

  it("does NOT call the credit-charging function — locked by source-text guard on BOTH new files", () => {
    const rewriterSource = fs.readFileSync(REWRITER_SOURCE_PATH, "utf-8");
    const applierSource = fs.readFileSync(APPLIER_SOURCE_PATH, "utf-8");
    for (const source of [rewriterSource, applierSource]) {
      expect(source).not.toContain("deductCredits");
      expect(source).not.toContain("deductCreditsForModel");
    }
  });

  it("records a contract_violation strike on LLMStructuredOutputError, then rethrows", async () => {
    const { deps } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ id: z.string() }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("schema validation failed", "{}", zodError, 30, 6);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const effects = makeRepairEffects(deps);
    await expect(
      effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() }),
    ).rejects.toThrow(/^VI_REPAIR_OUTPUT_INVALID:/);

    expect(mockedReportStructuredOutputViolation).toHaveBeenCalledTimes(1);
    const strikeArgs = mockedReportStructuredOutputViolation.mock.calls[0][0];
    expect(strikeArgs.modelId).toBe("served-model");
    expect(strikeArgs.traceId).toBe("trace-abc");
    expect(Array.isArray(strikeArgs.zodIssuePaths)).toBe(true);
  });

  it("reports the error's creditsUsed through onUsage before rethrowing", async () => {
    const { deps, onUsage } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ id: z.string() }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("bad", "{}", zodError, 30, 8);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const effects = makeRepairEffects(deps);
    await expect(
      effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() }),
    ).rejects.toThrow();

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 8, modelId: "served-model" });
  });

  it("does NOT strike on a transport/provider error, and rethrows it unchanged", async () => {
    const { deps, onUsage } = makeDeps();
    const transportError = new Error("Insufficient credits");
    mockedCallLLMStructured.mockRejectedValue(transportError);

    const effects = makeRepairEffects(deps);
    await expect(
      effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() }),
    ).rejects.toBe(transportError);

    expect(mockedReportStructuredOutputViolation).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when the model returns zero usable rewrites", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult({ data: [] }));

    const effects = makeRepairEffects(deps);
    const result = await effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() });

    expect(result).toEqual([]);
  });

  it("never throws out of onUsage's own failure — reporting must not break the applier", async () => {
    const onUsage = vi.fn(() => {
      throw new Error("onUsage exploded");
    });
    const effects = makeRepairEffects({
      tenantId: "tenant-1",
      userId: 42,
      traceId: "trace-abc",
      modelId: "gpt-5",
      projectId: 7,
      onUsage,
    });
    mockedCallLLMStructured.mockResolvedValue(successResult());

    await expect(
      effects.rewriteForStage({ stage: "narration", instruction: "x", targets: targets() }),
    ).resolves.toEqual([{ id: "scene:SC-1:narration", text: "new text" }]);
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});
