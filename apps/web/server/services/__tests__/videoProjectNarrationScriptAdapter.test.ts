/**
 * Coverage for `videoProjectNarrationScriptAdapter.ts` (auto_draft's
 * narration-script sub-stage). Mock graph mirrors
 * `videoProjectScenePlanAdapter.test.ts` — only two modules are mocked,
 * everything else is real:
 *
 * - `../callLLMStructured` — spread `importOriginal()` so
 *   `LLMStructuredOutputError` stays the REAL class (its `instanceof`
 *   branch must actually fire, not pass vacuously).
 * - `../videoIntelligenceModelResolver` — every export this module imports.
 *
 * `mockResolvedValue`/`mockRejectedValue` only, never `...Once` (recorded
 * Once-queue-leak failure class, `memory/project_vitest_once_queue_leak.md`).
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
  buildNarrationScriptSkillInput,
  makeRunNarrationScriptSkill,
  narrationScriptOutputSchema,
  VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING,
  type NarrationScriptSkillInput,
  type NarrationScriptSkillOutput,
} from "../videoProjectNarrationScriptAdapter";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";

const ADAPTER_SOURCE_PATH = path.resolve(__dirname, "../videoProjectNarrationScriptAdapter.ts");

const mockedCallLLMStructured = callLLMStructured as unknown as ReturnType<typeof vi.fn>;
const mockedReportStructuredOutputViolation =
  reportStructuredOutputViolation as unknown as ReturnType<typeof vi.fn>;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function scene(id: string, overrides: Partial<VideoProjectDocument["scenes"][number]> = {}) {
  return {
    sceneId: id,
    startMs: 0,
    endMs: 5000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "template" as const, templateId: "product_hero", params: {} },
    layers: [],
    motion: { intensity: "medium" as const, camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function baseDocument(overrides: Partial<VideoProjectDocument> = {}): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
    content: { topic: "Widgets", audience: "Everyone", language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [scene("s1"), scene("s2", { startMs: 5000, endMs: 10000 })],
    audioTracks: [],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  } as VideoProjectDocument;
}

function narrationInput(overrides: Partial<NarrationScriptSkillInput> = {}): NarrationScriptSkillInput {
  return {
    brief: { topic: "Widgets", audience: "Everyone", language: "th", platformPreset: "tiktok_9_16", studioType: "motion" },
    format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
    product: null,
    scenes: [{ index: 0, sceneId: "s1", durationMs: 5000, templateId: "product_hero", existingNarration: null }],
    ...overrides,
  };
}

function narrationOutput(overrides: Partial<NarrationScriptSkillOutput> = {}): NarrationScriptSkillOutput {
  return {
    scenes: [{ index: 0, narration: "รู้ไหมว่าเครื่องนี้ประหยัดไฟกว่าเดิม" }],
    ...overrides,
  };
}

function successResult(
  overrides: Partial<{ data: NarrationScriptSkillOutput; creditsUsed: number; modelId: string | null }> = {},
) {
  return {
    data: narrationOutput(),
    tokensUsed: 100,
    creditsUsed: 5,
    providerName: "openrouter",
    modelId: "gpt-5",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* buildNarrationScriptSkillInput — pure fact builder                         */
/* -------------------------------------------------------------------------- */

describe("buildNarrationScriptSkillInput", () => {
  it("builds one scene entry per sceneId, indexed by that array's own order", () => {
    const document = baseDocument();
    const input = buildNarrationScriptSkillInput({
      document,
      studioType: "motion",
      catalogFacts: null,
      sceneIds: ["s2", "s1"],
    });

    expect(input.scenes).toEqual([
      { index: 0, sceneId: "s2", durationMs: 5000, templateId: "product_hero", existingNarration: null },
      { index: 1, sceneId: "s1", durationMs: 5000, templateId: "product_hero", existingNarration: null },
    ]);
  });

  it("carries brief/format facts straight from the document", () => {
    const document = baseDocument();
    const input = buildNarrationScriptSkillInput({
      document,
      studioType: "catalog",
      catalogFacts: null,
      sceneIds: ["s1"],
    });

    expect(input.brief).toEqual({
      topic: "Widgets",
      audience: "Everyone",
      language: "th",
      platformPreset: "tiktok_9_16",
      studioType: "catalog",
    });
    expect(input.format).toEqual(document.format);
  });

  it("passes the selected speaking tone as a brief fact for the skill", () => {
    const input = buildNarrationScriptSkillInput({
      document: baseDocument(),
      studioType: "motion",
      catalogFacts: null,
      sceneIds: ["s1"],
      briefVoiceTone: "documentary_analytical",
    });

    expect(input.brief.voiceTone).toBe("documentary_analytical");
  });

  it("maps resolved catalog facts into the product fact block", () => {
    const document = baseDocument();
    const input = buildNarrationScriptSkillInput({
      document,
      studioType: "catalog",
      catalogFacts: {
        productIds: ["p1"],
        claimResolutions: [{ claim: "ประหยัดไฟ", source: "marketplace_insight:p1", status: "approved" }],
        priceFacts: { current: "850", original: "1200", currency: "THB", resolvedAt: "2026-01-01T00:00:00.000Z" },
      },
      sceneIds: ["s1"],
    });

    expect(input.product).toEqual({
      productIds: ["p1"],
      claims: [{
        claim: expect.stringContaining("ประหยัดไฟ"),
        source: expect.stringContaining("marketplace_insight:p1"),
        status: "approved",
      }],
      priceFacts: { current: "850", original: "1200", currency: "THB" },
    });
  });

  it("is null when no catalog facts are given (Motion Studio)", () => {
    const input = buildNarrationScriptSkillInput({
      document: baseDocument(),
      studioType: "motion",
      catalogFacts: null,
      sceneIds: ["s1"],
    });
    expect(input.product).toBeNull();
  });

  it("reads templateId from a template-kind visual, null for a layers-kind visual", () => {
    const document = baseDocument({
      scenes: [scene("s1", { visual: { kind: "layers" } })],
    });
    const input = buildNarrationScriptSkillInput({
      document,
      studioType: "motion",
      catalogFacts: null,
      sceneIds: ["s1"],
    });
    expect(input.scenes[0]!.templateId).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* narrationScriptOutputSchema                                                */
/* -------------------------------------------------------------------------- */

describe("narrationScriptOutputSchema", () => {
  it("accepts the exact example object from skill.md's Output format block", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../skills/video-project-narration-script/skill.md"),
      "utf-8",
    );
    const fenceStart = source.indexOf("```json");
    const fenceContentStart = source.indexOf("\n", fenceStart) + 1;
    const fenceEnd = source.indexOf("```", fenceContentStart);
    const parsed = JSON.parse(source.slice(fenceContentStart, fenceEnd));

    expect(narrationScriptOutputSchema.safeParse(parsed).success).toBe(true);
  });

  it("rejects a scene missing index or narration", () => {
    expect(narrationScriptOutputSchema.safeParse({ scenes: [{ index: 0 }] }).success).toBe(false);
    expect(narrationScriptOutputSchema.safeParse({ scenes: [{ narration: "x" }] }).success).toBe(false);
  });

  it("drops an unknown top-level key rather than failing the whole draft", () => {
    const result = narrationScriptOutputSchema.safeParse({ scenes: [], someFutureField: "strip me" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("someFutureField");
  });
});

/* -------------------------------------------------------------------------- */
/* VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING                              */
/* -------------------------------------------------------------------------- */

describe("VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING", () => {
  it("stays thin — names no tone rule, no speaking rate, no CTA heuristic", () => {
    expect(VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING.length).toBeLessThan(600);
    const lower = VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING.toLowerCase();
    for (const term of ["17 characters", "hook", "call to action", "cta", "audience"]) {
      expect(lower).not.toContain(term);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* makeRunNarrationScriptSkill                                                */
/* -------------------------------------------------------------------------- */

describe("makeRunNarrationScriptSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeDeps(overrides: Partial<Parameters<typeof makeRunNarrationScriptSkill>[0]> = {}) {
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

  it("invokes callLLMStructured with runtimeOptions.skillSlugs = ['video-project-narration-script']", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runSkill = makeRunNarrationScriptSkill(deps);
    await runSkill(narrationInput());

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.runtimeOptions.skillSlugs).toEqual(["video-project-narration-script"]);
  });

  it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset", async () => {
    const { deps } = makeDeps({ modelId: "claude-opus" });
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runSkill = makeRunNarrationScriptSkill(deps);
    await runSkill(narrationInput());

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.model).toBe("claude-opus");
    expect(call.preferredProviderId).toBeUndefined();
  });

  it("uses zodSchema + systemPrompt + userMessage, and puts every fact in the JSON payload not the systemPrompt", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const input = narrationInput({
      product: { productIds: ["p1"], claims: [{ claim: "SECRET_CLAIM", source: "x", status: "approved" }] },
    });
    const runSkill = makeRunNarrationScriptSkill(deps);
    await runSkill(input);

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.zodSchema).toBe(narrationScriptOutputSchema);
    expect(call.systemPrompt).not.toContain("SECRET_CLAIM");
    expect(JSON.parse(call.userMessage)).toEqual(input);
  });

  it("sets maxRetries to 2 and sizes maxTokens from scene count", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runSkill = makeRunNarrationScriptSkill(deps);
    await runSkill(narrationInput({ scenes: [narrationInput().scenes[0]!] }));
    const smallMaxTokens = mockedCallLLMStructured.mock.calls[0][0].maxTokens;
    expect(mockedCallLLMStructured.mock.calls[0][0].maxRetries).toBe(2);

    await runSkill(
      narrationInput({
        scenes: Array.from({ length: 10 }, (_, i) => ({
          index: i,
          sceneId: `s${i}`,
          durationMs: 1000,
          templateId: null,
          existingNarration: null,
        })),
      }),
    );
    const largeMaxTokens = mockedCallLLMStructured.mock.calls[1][0].maxTokens;
    expect(largeMaxTokens).toBeGreaterThan(smallMaxTokens);
  });

  it("returns result.data unchanged — the adapter adds no judgment of its own", async () => {
    const { deps } = makeDeps();
    const expected = narrationOutput({ scenes: [{ index: 0, narration: "custom" }] });
    mockedCallLLMStructured.mockResolvedValue(successResult({ data: expected }));

    const runSkill = makeRunNarrationScriptSkill(deps);
    const result = await runSkill(narrationInput());

    expect(result).toBe(expected);
  });

  it("reports creditsUsed and the served modelId through onUsage", async () => {
    const { deps, onUsage } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult({ creditsUsed: 12, modelId: "served-model" }));

    const runSkill = makeRunNarrationScriptSkill(deps);
    await runSkill(narrationInput());

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 12, modelId: "served-model" });
  });

  it("does NOT call deductCredits", () => {
    const source = fs.readFileSync(ADAPTER_SOURCE_PATH, "utf-8");
    expect(source).not.toContain("deductCredits");
    expect(source).not.toContain("deductCreditsForModel");
  });

  it("records a contract_violation strike on LLMStructuredOutputError, then rethrows as VI_NARRATION_SCRIPT_INVALID", async () => {
    const { deps } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ scenes: z.array(z.unknown()) }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("schema validation failed", "{}", zodError, 50, 7);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runSkill = makeRunNarrationScriptSkill(deps);
    await expect(runSkill(narrationInput())).rejects.toThrow(/^VI_NARRATION_SCRIPT_INVALID:/);

    expect(mockedReportStructuredOutputViolation).toHaveBeenCalledTimes(1);
    const strikeArgs = mockedReportStructuredOutputViolation.mock.calls[0][0];
    expect(strikeArgs.modelId).toBe("served-model");
    expect(strikeArgs.traceId).toBe("trace-abc");
  });

  it("still reports the error's creditsUsed through onUsage before rethrowing", async () => {
    const { deps, onUsage } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ scenes: z.array(z.unknown()) }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("bad", "{}", zodError, 50, 9);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runSkill = makeRunNarrationScriptSkill(deps);
    await expect(runSkill(narrationInput())).rejects.toThrow();

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 9, modelId: "served-model" });
  });

  it("does NOT strike on a transport/provider error, and rethrows it unchanged", async () => {
    const { deps, onUsage } = makeDeps();
    const transportError = new Error("Insufficient credits");
    mockedCallLLMStructured.mockRejectedValue(transportError);

    const runSkill = makeRunNarrationScriptSkill(deps);
    await expect(runSkill(narrationInput())).rejects.toBe(transportError);

    expect(mockedReportStructuredOutputViolation).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });
});
