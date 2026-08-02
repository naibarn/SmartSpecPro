/**
 * Coverage for `videoProjectScenePlanAdapter.ts` (Feature 142, section-05).
 * TDD: written before the adapter exists. Mock graph mirrors
 * `videoProjectReviewAdapter.test.ts` — only two modules are mocked,
 * everything else is real:
 *
 * - `../callLLMStructured` — spread `importOriginal()` so
 *   `LLMStructuredOutputError` stays the REAL class (its `instanceof`
 *   branch must actually fire, not pass vacuously — Trap 1).
 * - `../videoIntelligenceModelResolver` — every export section-02 has
 *   (Trap 2 — a factory must list every export the module under test
 *   imports, or the IMPORT breaks, not just the assertion).
 *
 * `mockResolvedValue`/`mockRejectedValue` only, never `...Once` (recorded
 * Once-queue-leak failure class).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

vi.mock("../callLLMStructured", async importOriginal => ({
  ...(await importOriginal<typeof import("../callLLMStructured")>()),
  callLLMStructured: vi.fn(),
}));
vi.mock("../videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModelSelection: vi.fn(),
  assertStructuredStageModelAvailable: vi.fn(),
  reportStructuredOutputViolation: vi.fn(),
  VideoIntelligenceModelError: class VideoIntelligenceModelError extends Error {},
}));

import { callLLMStructured, LLMStructuredOutputError } from "../callLLMStructured";
import { reportStructuredOutputViolation } from "../videoIntelligenceModelResolver";
import {
  makeRunPlanSkill,
  scenePlanOutputSchema,
  VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING,
} from "../videoProjectScenePlanAdapter";
import type { ScenePlanSkillInput, ScenePlanSkillOutput } from "../videoProjectScenePlanner";

const ADAPTER_SOURCE_PATH = path.resolve(__dirname, "../videoProjectScenePlanAdapter.ts");

const mockedCallLLMStructured = callLLMStructured as unknown as ReturnType<typeof vi.fn>;
const mockedReportStructuredOutputViolation =
  reportStructuredOutputViolation as unknown as ReturnType<typeof vi.fn>;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function planInput(overrides: Partial<ScenePlanSkillInput> = {}): ScenePlanSkillInput {
  return {
    brief: { topic: "Widgets", audience: "Everyone", language: "en", platformPreset: "tiktok_9_16", studioType: "motion" },
    format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
    aspectRatio: "9:16",
    availableTemplates: [],
    layerBudget: { max: 40, used: 0, remaining: 40 },
    plannableScenes: [
      { sceneId: "s1", startMs: 0, endMs: 5000, narration: null, captionText: [], timingLocked: false },
    ],
    occupiedIntervals: [],
    catalogFacts: null,
    brandKit: null,
    ...overrides,
  };
}

function planOutput(overrides: Partial<ScenePlanSkillOutput> = {}): ScenePlanSkillOutput {
  return {
    scenes: [
      {
        sceneId: "s1",
        templateId: "kinetic_typography",
        templateParams: { words: ["Hi"] },
        startMs: 0,
        endMs: 5000,
        rationale: "hook",
        onScreenStatements: [],
      },
    ],
    summary: "one scene",
    ...overrides,
  };
}

function successResult(
  overrides: Partial<{ data: ScenePlanSkillOutput; creditsUsed: number; modelId: string | null }> = {},
) {
  return {
    data: planOutput(),
    tokensUsed: 100,
    creditsUsed: 5,
    providerName: "openrouter",
    modelId: "gpt-5",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* scenePlanOutputSchema                                                      */
/* -------------------------------------------------------------------------- */

describe("scenePlanOutputSchema", () => {
  it("accepts the exact example object from skill.md's Output format block", () => {
    const example = {
      scenes: [
        {
          sceneId: "s1",
          templateId: "product_hero",
          templateParams: { assetId: 1001, mediaKind: "image", headline: "รุ่นใหม่ 2026", subheadline: "ประหยัดไฟกว่าเดิม" },
          startMs: 0,
          endMs: 4000,
          motion: { intensity: "medium", camera: "push-in" },
          rationale: "เปิดด้วยตัวสินค้าเพื่อสร้างการจดจำแบรนด์ทันที",
          onScreenStatements: ["ประหยัดไฟกว่าเดิม"],
        },
        {
          sceneId: "s2",
          templateId: "comparison_stage",
          templateParams: {
            left: { label: "รุ่นเดิม", value: "1200W" },
            right: { label: "รุ่นใหม่", value: "850W" },
          },
          startMs: 4000,
          endMs: 9000,
          motion: { intensity: "low", camera: "static" },
          rationale: "ข้อมูลเป็นการเทียบตัวเลขสองค่า เหมาะกับเทมเพลตเปรียบเทียบ",
          onScreenStatements: ["1200W", "850W"],
        },
      ],
      summary: "Planned 2 scenes: a product hero opener and a numeric comparison of power draw.",
    };

    expect(scenePlanOutputSchema.safeParse(example).success).toBe(true);
  });

  it("rejects a scene missing templateId or templateParams", () => {
    expect(
      scenePlanOutputSchema.safeParse({
        scenes: [{ sceneId: "s1", startMs: 0, endMs: 1000, rationale: "x", onScreenStatements: [] }],
        summary: "x",
      }).success,
    ).toBe(false);
  });

  it("drops an unknown top-level key rather than failing the whole plan", () => {
    const result = scenePlanOutputSchema.safeParse({
      scenes: [],
      summary: "x",
      someFutureField: "should be stripped, not fatal",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("someFutureField");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING                                    */
/* -------------------------------------------------------------------------- */

describe("VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING", () => {
  it("stays thin — names no template, no selection rule, no budget heuristic", () => {
    expect(VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING.length).toBeLessThan(600);

    const forbiddenTerms = [
      "product_hero",
      "comparison_stage",
      "animated_chart_basic",
      "how_to_steps",
      "glass_feature_cards",
      "review_highlight",
      "kinetic_typography",
      "floating_gallery",
      "data_flow",
      "luxury_end_card",
      "layerBudget.remaining",
      "40 layers",
      "information shape",
    ];
    const lower = VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING.toLowerCase();
    for (const term of forbiddenTerms) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });
});

/* -------------------------------------------------------------------------- */
/* makeRunPlanSkill                                                           */
/* -------------------------------------------------------------------------- */

describe("makeRunPlanSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeDeps(overrides: Partial<Parameters<typeof makeRunPlanSkill>[0]> = {}) {
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

  it("invokes callLLMStructured with runtimeOptions.skillSlugs = ['video-project-scene-plan']", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(planInput());

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.runtimeOptions.skillSlugs).toEqual(["video-project-scene-plan"]);
  });

  it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset", async () => {
    const { deps } = makeDeps({ modelId: "claude-opus" });
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(planInput());

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.model).toBe("claude-opus");
    expect(call.preferredProviderId).toBeUndefined();
  });

  it("uses zodSchema + systemPrompt + userMessage (not a generic input object)", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(planInput());

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.zodSchema).toBe(scenePlanOutputSchema);
    expect(call.schema).toBeUndefined();
    expect(typeof call.systemPrompt).toBe("string");
    expect(typeof call.userMessage).toBe("string");
    expect(call.input).toBeUndefined();
  });

  it("sets maxRetries to 2 for bounded schema retry", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(planInput());

    expect(mockedCallLLMStructured.mock.calls[0][0].maxRetries).toBe(2);
  });

  it("sizes maxTokens from the plannable scene count, never leaving the provider default", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runPlanSkill = makeRunPlanSkill(deps);

    await runPlanSkill(
      planInput({
        plannableScenes: [
          { sceneId: "s1", startMs: 0, endMs: 1000, narration: null, captionText: [], timingLocked: false },
        ],
      }),
    );
    const smallMaxTokens = mockedCallLLMStructured.mock.calls[0][0].maxTokens;

    await runPlanSkill(
      planInput({
        plannableScenes: Array.from({ length: 10 }, (_, i) => ({
          sceneId: `s${i}`,
          startMs: 0,
          endMs: 1000,
          narration: null,
          captionText: [],
          timingLocked: false,
        })),
      }),
    );
    const largeMaxTokens = mockedCallLLMStructured.mock.calls[1][0].maxTokens;

    expect(typeof smallMaxTokens).toBe("number");
    expect(largeMaxTokens).toBeGreaterThan(smallMaxTokens);
  });

  it("puts every catalog/narration string in the JSON payload, never in the systemPrompt", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const input = planInput({
      catalogFacts: { productIds: ["p1"], claims: [{ claim: "SECRET_CLAIM_TEXT", source: "x", status: "approved" }] },
      plannableScenes: [
        { sceneId: "s1", startMs: 0, endMs: 1000, narration: "SECRET_NARRATION_TEXT", captionText: [], timingLocked: false },
      ],
    });

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(input);

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.systemPrompt).not.toContain("SECRET_CLAIM_TEXT");
    expect(call.systemPrompt).not.toContain("SECRET_NARRATION_TEXT");
    expect(JSON.parse(call.userMessage)).toEqual(input);
  });

  it("returns result.data unchanged — the adapter adds no judgment of its own", async () => {
    const { deps } = makeDeps();
    const expected = planOutput({ summary: "custom summary" });
    mockedCallLLMStructured.mockResolvedValue(successResult({ data: expected }));

    const runPlanSkill = makeRunPlanSkill(deps);
    const result = await runPlanSkill(planInput());

    expect(result).toBe(expected);
  });

  it("reports creditsUsed and the served modelId through onUsage", async () => {
    const { deps, onUsage } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult({ creditsUsed: 12, modelId: "served-model" }));

    const runPlanSkill = makeRunPlanSkill(deps);
    await runPlanSkill(planInput());

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 12, modelId: "served-model" });
  });

  it("does NOT call deductCredits", () => {
    const source = fs.readFileSync(ADAPTER_SOURCE_PATH, "utf-8");
    expect(source).not.toContain("deductCredits");
    expect(source).not.toContain("deductCreditsForModel");
  });

  it("records a contract_violation strike on LLMStructuredOutputError, then rethrows as VI_PLAN_PARAMS_INVALID", async () => {
    const { deps } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ scenes: z.array(z.unknown()) }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("schema validation failed", "{}", zodError, 50, 7);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runPlanSkill = makeRunPlanSkill(deps);
    await expect(runPlanSkill(planInput())).rejects.toThrow(/^VI_PLAN_PARAMS_INVALID:/);

    expect(mockedReportStructuredOutputViolation).toHaveBeenCalledTimes(1);
    const strikeArgs = mockedReportStructuredOutputViolation.mock.calls[0][0];
    expect(strikeArgs.modelId).toBe("served-model");
    expect(strikeArgs.traceId).toBe("trace-abc");
    expect(Array.isArray(strikeArgs.zodIssuePaths)).toBe(true);
  });

  it("still reports the error's creditsUsed through onUsage before rethrowing", async () => {
    const { deps, onUsage } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ scenes: z.array(z.unknown()) }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("bad", "{}", zodError, 50, 9);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runPlanSkill = makeRunPlanSkill(deps);
    await expect(runPlanSkill(planInput())).rejects.toThrow();

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 9, modelId: "served-model" });
  });

  it("does NOT strike on a transport/provider error, and rethrows it unchanged", async () => {
    const { deps, onUsage } = makeDeps();
    const transportError = new Error("Insufficient credits");
    mockedCallLLMStructured.mockRejectedValue(transportError);

    const runPlanSkill = makeRunPlanSkill(deps);
    await expect(runPlanSkill(planInput())).rejects.toBe(transportError);

    expect(mockedReportStructuredOutputViolation).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });
});
