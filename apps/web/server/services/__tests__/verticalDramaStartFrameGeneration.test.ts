import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateStartFrameRenderPlan,
  projectStartFramePlan,
  RateLimitExceededError,
  appendPresetVisualIdentityFragmentsToImagePrompt,
  mergePresetVisualIdentityNegativeFragments,
  type VerticalDramaStartFramePlanFrame,
} from "../verticalDramaStartFrameGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { InsufficientCreditsError, VdSchemaValidationError } from "../verticalDramaStoryBible";
import { resolveStartFramePlanModel } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStartFramePlanModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateStartFrameRenderPlan>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    durationSeconds: 90,
    selectedImageModelId: "google-banana-2-lite",
    storyboardShots: Array.from({ length: 9 }, (_, i) => ({
      shotNumber: i + 1,
      description: `Shot ${i + 1}`,
      cameraSetup: "medium shot",
      characterIds: ["char-1"],
      durationSeconds: 10,
    })),
    ...overrides,
  };
}

function validRequest(n: number) {
  return {
    shot_number: n,
    prompt: `Start frame prompt for shot ${n}`,
    negative_prompt: "blurry",
    reference_assets: [{ character_id: "char-1" }],
  };
}

function validOutput(count = 9) {
  return {
    render_plan_summary: { image_model: "google-banana-2-lite" },
    start_frame_requests: Array.from({ length: count }, (_, i) => validRequest(i + 1)),
    plain_text_render_plan: "Full plan text",
    downstream_video_input_manifest: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 180, completion_tokens: 90 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

/** Simulates a real truncated-mid-array LLM response (evidence: 2026-07-05 series 2 episode 1). */
function truncatedResponse() {
  const full = JSON.stringify(validOutput());
  // Cut off partway through the `start_frame_requests` array, same failure
  // shape as `VD_SCHEMA_VALIDATION_FAILED`'s "Expected ',' or ']' after array
  // element" error.
  const cutIndex = full.indexOf('"start_frame_requests"') + 60;
  return {
    type: "success" as const,
    response: {
      choices: [
        { message: { content: full.slice(0, cutIndex) }, index: 0, finish_reason: "length" },
      ],
      usage: { prompt_tokens: 180, completion_tokens: 4000 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateStartFrameRenderPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(6);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-start-frame-render",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-start-frame-render/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response projects render plan, deducts credits once, checks rate limiter", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStartFrameRenderPlan(baseParams());

    expect(result.plan.frames).toHaveLength(9);
    expect(result.plan.mode).toBe("single_frame_per_shot");
    expect(result.plan.selectedImageModelId).toBe("google-banana-2-lite");
    expect(result.plan.frames[0]).toMatchObject({
      shotNumber: 1,
      imagePrompt: expect.stringContaining("IMAGE NEGATIVE CONSTRAINTS (MANDATORY"),
      negativePrompt: "",
      requiredCharacterRefs: ["char-1"],
    });
    expect(result.creditsUsed).toBe(6);
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("injects the default target-audience region descriptor into the LLM user prompt when provided", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStartFrameRenderPlan(baseParams({ targetAudienceRegion: "middle_eastern" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/Middle Eastern\/Arab/i);
    expect(userMessage).toMatch(/always takes precedence/i);
  });

  it("defaults to the Thai/Southeast Asian region descriptor when targetAudienceRegion is omitted", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStartFrameRenderPlan(baseParams({ targetAudienceRegion: undefined }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/Thai\/Southeast Asian/i);
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(15_000);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      RateLimitExceededError,
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (wrong request count) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(4))); // schema requires exactly 9

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("retries once with a higher token ceiling when the first response is truncated JSON, and succeeds on the retry (2026-07-05 evidence: series 2 episode 1)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(successResponse(validOutput()));

    const result = await generateStartFrameRenderPlan(baseParams());

    expect(result.plan.frames).toHaveLength(9);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Same model both times — never auto-switches models on retry.
    expect(mockExecute.mock.calls[0][0].model).toBe(mockExecute.mock.calls[1][0].model);
    // Retry uses a higher/no-lower token ceiling than the first attempt.
    expect(mockExecute.mock.calls[1][0].maxTokens).toBeGreaterThanOrEqual(
      mockExecute.mock.calls[0][0].maxTokens,
    );
    // Retry's user prompt carries the stricter no-truncation instruction.
    const retryUserMessage = mockExecute.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(retryUserMessage.content).toMatch(/complete, valid, compact JSON/i);
    // Credits are only deducted once (for the successful retry), not twice.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws VdSchemaValidationError (does not silently persist an empty plan) when BOTH the first attempt and the retry are truncated", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse());

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    // 1 initial + VD_SCHEMA_MAX_RETRIES (2) corrective retries
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("does not retry on a FATAL provider error (only retries malformed-JSON/schema failures, or transient network/timeout errors — see verticalDramaStoryBible.executeJsonPlanningCallWithRetry.test.ts)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    // Phase A reliability fix (2026-07-09) — `executeJsonPlanningCallWithRetry`
    // (shared with verticalDramaStoryBible.ts) now DOES retry transient
    // network/timeout/5xx errors with backoff. A genuinely fatal error (auth
    // failure) is used here so "not retried" stays a true assertion.
    mockExecute.mockResolvedValue({
      type: "error",
      error: "Unauthorized: invalid api key",
      statusCode: 401,
    } as any);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      "LLM request failed: Unauthorized: invalid api key",
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // 2026-07-07 non-human-character-vanishing fix — repro: shot 3, required
  // character เจ้าเกลือ (a cat, shop mascot) rendered as "a figure... face
  // mostly obscured by shadows" because the prompt only ever said
  // `character-8`. Injecting a compact identity map fixes this at the
  // prompt layer.
  it("injects the character identity map into the LLM user prompt when `characters` rows are supplied", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStartFrameRenderPlan(
      baseParams({
        characters: [
          {
            characterKey: "char-1",
            name: "เจ้าเกลือ",
            role: "มาสคอตของร้าน",
            description: "แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ",
          },
        ],
      }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("CHARACTER IDENTITY MAP");
    expect(userMessage).toContain("เจ้าเกลือ");
    expect(userMessage).toContain("แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ");
    expect(userMessage).toMatch(/NEVER render a non-human character/i);
  });

  it("omits the character identity map block entirely when no `characters` rows are supplied (backward compatible)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStartFrameRenderPlan(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("CHARACTER IDENTITY MAP");
  });

  it("declares caller references as screen-only without increasing the physical cast", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStartFrameRenderPlan(
      baseParams({
        storyboardShots: [
          {
            ...baseParams().storyboardShots[0],
            characterIds: ["char-1", "char-2"],
            screenCallerCharacterIds: ["char-krit"],
          },
          ...baseParams().storyboardShots.slice(1),
        ],
      })
    );

    const callArgs = mockExecute.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callArgs.messages.find(m => m.role === "user")!.content;
    expect(userMessage).toContain("screen_callers: char-krit");
    expect(userMessage).toContain("do not attach the caller portrait as a physical-scene reference");
    expect(userMessage).toContain("show only inside a clearly visible phone/video call screen");
    expect(userMessage).toContain("required_characters: 2");
  });
});

describe("projectStartFramePlan — plan-level image prompt language", () => {
  it("preserves the resolved image language on a regenerated plan", () => {
    const plan = projectStartFramePlan(
      validOutput() as any,
      "gpt-image-2",
      undefined,
      undefined,
      undefined,
      "th",
    );

    expect(plan.imagePromptLanguage).toBe("th");
  });
});

describe("projectStartFramePlan", () => {
  it("persists the canonical Overview shot summary on the projected frame", () => {
    const raw = {
      render_plan_summary: {},
      start_frame_requests: [validRequest(4)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(
      raw as any,
      "fallback-model",
      undefined,
      new Map([
        [4, "พี่วินโรยโกโก้บนมือทุกคน ใบข้าวหัวเราะตอนเห็นคราบเต็มมือ"],
      ]),
    );

    expect(plan.frames[0]?.canonicalShotSummary).toBe(
      "พี่วินโรยโกโก้บนมือทุกคน ใบข้าวหัวเราะตอนเห็นคราบเต็มมือ",
    );
  });

  it("sorts frames by shot number and falls back to the provided image model id when summary lacks one", () => {
    const raw = {
      render_plan_summary: {},
      start_frame_requests: [validRequest(2), validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "fallback-model");
    expect(plan.selectedImageModelId).toBe("fallback-model");
    expect(plan.frames.map((f) => f.shotNumber)).toEqual([1, 2]);
  });

  it("honors a pre-existing caller-supplied model id even when the LLM summary claims a different one (Phase 1.2 fix)", () => {
    const raw = {
      render_plan_summary: { image_model: "some-other-model-the-llm-mentioned" },
      start_frame_requests: [validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "user-selected-model");
    expect(plan.selectedImageModelId).toBe("user-selected-model");
  });

  it("falls back to the LLM's own claimed model only when no caller model id is supplied", () => {
    const raw = {
      render_plan_summary: { image_model: "llm-claimed-model" },
      start_frame_requests: [validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "");
    expect(plan.selectedImageModelId).toBe("llm-claimed-model");
  });

  // Gap-5 fix (recorded, 2026-07-22) — a plan regeneration used to silently
  // wipe per-frame user/durable state (`approvedMediaAssetId`, `locationKey`,
  // `angleGrid`/`angleGridAssetIds`, `productReferenceAssetIds`/
  // `productRefsCustomized`) because this function never accepted the prior
  // plan's frames at all. `previousFramesByShotNumber` (the new 5th param)
  // fixes that with an explicit, testable merge contract.
  describe("previousFramesByShotNumber carry-over (gap-5 fix, 2026-07-22)", () => {
    it("(a) marks the prior approved asset stale when a regen replaces its prompt, while preserving durable reference state", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(3)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          3,
          {
            shotNumber: 3,
            imagePrompt: "STALE prompt that must be replaced",
            negativePrompt: "stale negative",
            requiredCharacterRefs: ["char-1"],
            characterRefsCustomized: true,
            productReferenceAssetIds: ["asset-101"],
            productRefsCustomized: true,
            approvedMediaAssetId: "media-42",
            locationKey: "loc-kitchen",
            angleGrid: { imageUrl: "https://cdn.example.com/grid.png", dismissedIndexes: [2] },
            angleGridAssetIds: [501, 502],
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        undefined,
        previousFramesByShotNumber,
      );

      const frame = plan.frames[0];
      // Replaced — the whole point of regenerating.
      expect(frame?.imagePrompt).toContain("Start frame prompt for shot 3");
      expect(frame?.imagePrompt).toContain("blurry");
      expect(frame?.negativePrompt).toBe("");
      // Prompt changes must never leave an old image looking approved.
      expect(frame).not.toHaveProperty("approvedMediaAssetId");
      expect(frame?.imageStaleReason).toBe("prompt_changed");
      expect(frame?.locationKey).toBe("loc-kitchen");
      expect(frame?.angleGrid).toEqual({
        imageUrl: "https://cdn.example.com/grid.png",
        dismissedIndexes: [2],
      });
      expect(frame?.angleGridAssetIds).toEqual([501, 502]);
      expect(frame?.productReferenceAssetIds).toEqual(["asset-101"]);
      expect(frame?.productRefsCustomized).toBe(true);
      expect(frame?.characterRefsCustomized).toBe(true);
    });

    it("(b) never carries over promptMode — a regen from the legacy batch skill must clear any prior mode stamp so the engine badge clears and the render-time preset append resumes", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(5)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          5,
          {
            shotNumber: 5,
            imagePrompt: "stale",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            promptMode: {
              mode: "cinematic_narrative",
              resolvedFrom: "user",
              imageModelFamily: "gemini",
              imageModelId: "gemini-2",
              generatedAt: "2026-07-01T00:00:00.000Z",
            },
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        undefined,
        previousFramesByShotNumber,
      );

      expect(plan.frames[0]).not.toHaveProperty("promptMode");
    });

    it("treats an explicit user-selected empty scene/caller assignment as authoritative over fresh LLM references", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(3)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          3,
          {
            shotNumber: 3,
            imagePrompt: "stale",
            negativePrompt: "",
            requiredCharacterRefs: ["user-scene"],
            screenCallerCharacterRefs: ["user-caller"],
            characterRefsCustomized: true,
            productReferenceAssetIds: [],
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        new Map([[3, []]]),
        undefined,
        previousFramesByShotNumber,
        undefined,
        undefined,
        new Map([[3, []]]),
      );

      expect(plan.frames[0]).toMatchObject({
        requiredCharacterRefs: [],
        characterRefsCustomized: true,
      });
      expect(plan.frames[0]).not.toHaveProperty("screenCallerCharacterRefs");
    });

    it("(c) byte-identical output when no previous frames are supplied — omits every new carry-over field entirely, same as every pre-existing caller", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(7)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };

      const withoutParam = projectStartFramePlan(raw as any, "fallback-model");
      const withUndefinedParam = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        undefined,
        undefined,
      );

      expect(withoutParam).toEqual(withUndefinedParam);
      const frame = withoutParam.frames[0];
      expect(frame?.productReferenceAssetIds).toEqual([]);
      expect(frame).not.toHaveProperty("approvedMediaAssetId");
      expect(frame).not.toHaveProperty("locationKey");
      expect(frame).not.toHaveProperty("angleGrid");
      expect(frame).not.toHaveProperty("angleGridAssetIds");
      expect(frame).not.toHaveProperty("productRefsCustomized");
      expect(frame).not.toHaveProperty("promptMode");
    });

    it("(d) a shot present in the new plan but absent from the prior plan's frames is unaffected — no carry-over fields, fresh prompt only", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(2), validRequest(9)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      // The prior plan only ever had shot 2 (e.g. the series just grew from
      // fewer shots, or shot 9 is brand new to this regen).
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          2,
          {
            shotNumber: 2,
            imagePrompt: "stale",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: ["asset-7"],
            approvedMediaAssetId: "media-2",
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        undefined,
        previousFramesByShotNumber,
      );

      const shot2 = plan.frames.find((f) => f.shotNumber === 2);
      const shot9 = plan.frames.find((f) => f.shotNumber === 9);
      expect(shot2).not.toHaveProperty("approvedMediaAssetId");
      expect(shot2?.imageStaleReason).toBe("prompt_changed");
      expect(shot2?.productReferenceAssetIds).toEqual(["asset-7"]);
      // Shot 9 has no prior state to carry over — behaves exactly like the
      // no-previous-frames-at-all case, for THIS shot only.
      expect(shot9).not.toHaveProperty("approvedMediaAssetId");
      expect(shot9?.productReferenceAssetIds).toEqual([]);
      expect(shot9?.imagePrompt).toContain("Start frame prompt for shot 9");
      expect(shot9?.imagePrompt).toContain("blurry");
      expect(shot9?.negativePrompt).toBe("");
    });

    it("canonicalShotSummary: the projection's own freshly-resolved value wins over a carried-over prior one when both are present", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(6)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          6,
          {
            shotNumber: 6,
            imagePrompt: "stale",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            canonicalShotSummary: "OLD stale summary from a prior regen",
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        new Map([[6, "FRESH canonical summary from the current Overview page"]]),
        previousFramesByShotNumber,
      );

      expect(plan.frames[0]?.canonicalShotSummary).toBe(
        "FRESH canonical summary from the current Overview page",
      );
    });

    it("canonicalShotSummary: falls back to the carried-over prior value when the projection has none for this shot", () => {
      const raw = {
        render_plan_summary: {},
        start_frame_requests: [validRequest(6)],
        plain_text_render_plan: "text",
        downstream_video_input_manifest: {},
      };
      const previousFramesByShotNumber = new Map<number, VerticalDramaStartFramePlanFrame>([
        [
          6,
          {
            shotNumber: 6,
            imagePrompt: "stale",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            canonicalShotSummary: "carried-over summary",
          },
        ],
      ]);

      const plan = projectStartFramePlan(
        raw as any,
        "fallback-model",
        undefined,
        undefined,
        previousFramesByShotNumber,
      );

      expect(plan.frames[0]?.canonicalShotSummary).toBe("carried-over summary");
    });
  });
});

describe("appendPresetVisualIdentityFragmentsToImagePrompt (spec §8.2.2 flow-through)", () => {
  it("is a no-op when identity is undefined", () => {
    expect(appendPresetVisualIdentityFragmentsToImagePrompt("a hero portrait", undefined)).toBe(
      "a hero portrait",
    );
  });

  it("is a no-op when the identity carries no positive fragments", () => {
    const identity = { imagePromptFragments: { positive: [], negative: [] } };
    expect(appendPresetVisualIdentityFragmentsToImagePrompt("a hero portrait", identity)).toBe(
      "a hero portrait",
    );
  });

  it("appends positive fragments, comma-joined", () => {
    const identity = {
      imagePromptFragments: { positive: ["bioluminescent rim light", "neon orchids"], negative: [] },
    };
    const result = appendPresetVisualIdentityFragmentsToImagePrompt("a hero portrait", identity);
    expect(result).toBe("a hero portrait, bioluminescent rim light, neon orchids");
  });
});

describe("mergePresetVisualIdentityNegativeFragments (spec §8.2.2 flow-through)", () => {
  it("returns the original negative prompt unchanged (including undefined) when identity is absent", () => {
    expect(mergePresetVisualIdentityNegativeFragments(undefined, undefined)).toBeUndefined();
    expect(mergePresetVisualIdentityNegativeFragments("blurry", undefined)).toBe("blurry");
  });

  it("returns the original negative prompt unchanged when the identity carries no negative fragments", () => {
    const identity = { imagePromptFragments: { positive: [], negative: [] } };
    expect(mergePresetVisualIdentityNegativeFragments("blurry", identity)).toBe("blurry");
  });

  it("merges negative fragments into an existing negative prompt (never replaces it)", () => {
    const identity = { imagePromptFragments: { positive: [], negative: ["modern clothing", "cars"] } };
    expect(mergePresetVisualIdentityNegativeFragments("blurry", identity)).toBe(
      "blurry, modern clothing, cars",
    );
  });

  it("uses the negative fragments alone when there is no existing negative prompt", () => {
    const identity = { imagePromptFragments: { positive: [], negative: ["modern clothing"] } };
    expect(mergePresetVisualIdentityNegativeFragments(undefined, identity)).toBe("modern clothing");
  });
});
