import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
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
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return { ...actual, resolveStoryBibleModel: vi.fn() };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(), resolveQualityLargeContextModelId: vi.fn(),
}));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSceneVisualState } from "@shared/verticalDramaSeries/sceneContinuity";
import { calculateCreditsForLLM, deductCredits, hasEnoughCredits } from "../creditService";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { executeWithFallback } from "../llmRouter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStartFramePlanModel } from "../verticalDramaImproveScript";
import {
  buildSceneVisualStatePlannerUserPrompt,
  buildSceneVisualStateVisionImages,
  generateSceneVisualState,
  InsufficientCreditsError,
  sceneVisualStatePlanOutputSchema,
  toSceneVisualState,
  VdSchemaValidationError,
  type GenerateSceneVisualStateParams,
  type SceneVisualStatePlan,
} from "../verticalDramaSceneVisualState";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectModel = vi.mocked(selectBestLlmModel);
const mockResolvePlanModel = vi.mocked(resolveStartFramePlanModel);
const mockResolveDirs = vi.mocked(resolveSkillDirCandidates);
const mockResolveManifest = vi.mocked(resolveSkillManifestPath);
const mockExists = vi.mocked(fs.existsSync);
const mockRead = vi.mocked(fs.readFileSync);
const mockParse = vi.mocked(parseSkillFile);

function params(
  overrides: Partial<GenerateSceneVisualStateParams> = {},
): GenerateSceneVisualStateParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    locationKey: "home-kitchen",
    locationName: "Home kitchen",
    locationDescription: "Small open-plan kitchen",
    sceneDescription: "Late-afternoon confrontation",
    shots: [
      { shotNumber: 3, summary: "Mali sets down a mug", characters: ["Mali"] },
      { shotNumber: 1, summary: "Mali enters", characters: ["Mali"] },
      { shotNumber: 3, summary: "duplicate membership", characters: ["Mali"] },
    ],
    characterWardrobe: [{ character: "Mali", wardrobe: "pale work shirt" }],
    seriesLook: {
      styleName: "Intimate drama",
      palette: ["warm cream", "muted navy"],
      lighting: "natural window light",
      environmentMotifs: [],
      wardrobeGrammar: [],
      signaturePropsAndCompanions: [],
      cameraGrammar: "restrained still composition",
      characterArchetypes: [],
      imagePromptFragments: { positive: [], negative: [] },
    },
    membershipHash: "vd-scene-v1-hash",
    revision: 2,
    lang: "en",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 1,
    scene_visual_state: {
      lighting_state: "late afternoon; key from left",
      fixed_elements: [{ name: "window", placement: "left wall" }],
      spatial_layout: "counter rear; table center",
      staging_axis: "Mali right; camera doorway side",
      wardrobe_in_scene: [{ character: "Mali", wardrobe: "pale work shirt" }],
      active_props: [{ name: "mug", placement: "table", from_shot: 3 }],
      palette_mood: "warm cream and muted navy",
      time_jump_suspected: false,
      coverage_gaps: [],
      ...overrides,
    },
  };
}

function successResponse(payload: unknown) {
  return successResponseContent(JSON.stringify(payload));
}

function successResponseContent(content: string) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 150 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockCalculateCredits.mockReturnValue(4);
  mockResolvePlanModel.mockResolvedValue("configured-model");
  mockLoadRows.mockResolvedValue([]);
  mockSelectModel.mockReturnValue(null);
  mockResolveDirs.mockReturnValue(["/fake/skills/vertical-drama-scene-visual-state"]);
  mockResolveManifest.mockReturnValue("/fake/skills/vertical-drama-scene-visual-state/skill.md");
  mockExists.mockReturnValue(true);
  mockRead.mockReturnValue("---\nversion: 1.0.0\n---\nScene skill body" as any);
  mockParse.mockReturnValue({ metadata: { version: "1.0.0" } as any, content: "Scene skill body" });
  mockExecute.mockResolvedValue(successResponse(validOutput()));
});

describe("scene visual state skill loading", () => {
  it("fails descriptively when no skill manifest exists", async () => {
    mockExists.mockReturnValue(false);
    await expect(generateSceneVisualState(params())).rejects.toThrow(
      'Could not locate skill.md for "vertical-drama-scene-visual-state"',
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("loads once, uses the parsed body, and stamps the frontmatter version", async () => {
    const first = await generateSceneVisualState(params());
    await generateSceneVisualState(params({ idempotencyKey: "idem-2" }));
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0][0].messages[0].content).toBe("Scene skill body");
    expect(first.state.skillVersion).toBe("1.0.0");
  });
});

describe("scene visual state prompt and vision facts", () => {
  it("emits only caller facts, authorized look, requested output, and no owner ids", () => {
    const prompt = buildSceneVisualStatePlannerUserPrompt(params());
    expect(prompt).toContain("locale: en");
    expect(prompt).toContain("location_key: home-kitchen");
    expect(prompt).toContain("location_reference_image: none");
    expect(prompt).toContain("- shot 3: Mali sets down a mug [characters: Mali]");
    expect(prompt).toContain("palette: warm cream, muted navy");
    expect(prompt).toContain("lighting_treatment: natural window light");
    expect(prompt).toContain("requested_output: scene_visual_state");
    expect(prompt).not.toContain("tenant-1");
    expect(prompt).not.toContain("episodeId");
    expect(prompt).not.toContain("userId");
    expect(prompt).not.toContain("vd-scene-v1-hash");
  });

  it("attaches at most one labeled location reference", () => {
    expect(buildSceneVisualStateVisionImages(params())).toEqual([]);
    expect(buildSceneVisualStateVisionImages(params({
      locationImageUrl: " https://cdn.example.com/kitchen.png ",
    }))).toEqual([{
      url: "https://cdn.example.com/kitchen.png",
      label: "Location reference: Home kitchen",
    }]);
  });

  it("upgrades to a vision model, but degrades model-row errors to text-only", async () => {
    mockLoadRows.mockResolvedValueOnce([{ modelId: "configured-model", supportsVision: false } as any]);
    mockSelectModel.mockReturnValueOnce("vision-model");
    const vision = await generateSceneVisualState(params({
      locationImageUrl: "https://cdn.example.com/kitchen.png",
    }));
    expect(vision).toMatchObject({ model: "vision-model", usedVision: true });

    mockLoadRows.mockRejectedValueOnce(new Error("registry unavailable"));
    const textOnly = await generateSceneVisualState(params({
      locationImageUrl: "https://cdn.example.com/kitchen.png",
      idempotencyKey: "idem-text",
    }));
    expect(textOnly).toMatchObject({ model: "configured-model", usedVision: false });
  });
});

describe("scene visual state schema and mapper", () => {
  it("defaults partial fields and drops malformed array members", () => {
    const parsed = sceneVisualStatePlanOutputSchema.parse({
      scene_visual_state: {
        fixed_elements: [
          { name: "window", placement: "left" },
          { name: "broken" },
        ],
        active_props: [{ name: "mug", placement: "table", from_shot: "bad" }],
        time_jump_suspected: "yes",
        extra: "kept at the write boundary",
      },
    });
    expect(parsed.scene_visual_state).toMatchObject({
      lighting_state: "",
      fixed_elements: [{ name: "window", placement: "left" }],
      active_props: [{ name: "mug", placement: "table", from_shot: undefined }],
      time_jump_suspected: false,
      extra: "kept at the write boundary",
    });
  });

  it("maps camelCase, ignores hostile ownership fields, and round-trips", () => {
    const parsed = sceneVisualStatePlanOutputSchema.parse(validOutput({
      location_key: "hostile",
      membership_hash: "hostile",
      revision: 999,
      planned_at: "hostile",
      skill_version: "hostile",
      manual_edit: true,
      stale: true,
    })) as SceneVisualStatePlan;
    const mapped = toSceneVisualState(parsed, {
      locationKey: "home-kitchen",
      membershipHash: "vd-scene-v1-owned",
      revision: 2,
      memberShotNumbers: [3, 1, 3, -1],
      plannedAt: "2026-08-01T00:00:00.000Z",
      skillVersion: "1.0.0",
    });
    expect(mapped).toMatchObject({
      locationKey: "home-kitchen",
      membershipHash: "vd-scene-v1-owned",
      revision: 2,
      memberShotNumbers: [1, 3],
      plannedAt: "2026-08-01T00:00:00.000Z",
      skillVersion: "1.0.0",
      activeProps: [{ name: "mug", placement: "table", fromShot: 3 }],
    });
    expect(mapped).not.toHaveProperty("manualEdit");
    expect(mapped).not.toHaveProperty("stale");
    expect(resolveSceneVisualState(mapped)).toEqual(mapped);
  });

  it("maps the explicit sleep surface into the durable shared state", () => {
    const parsed = sceneVisualStatePlanOutputSchema.parse(validOutput({
      sleep_surface: {
        type: "long_bed",
        name: "Phum's long bed",
        occupant: "Phum",
        placement: "beside the small desk",
      },
    })) as SceneVisualStatePlan;
    const mapped = toSceneVisualState(parsed, {
      locationKey: "bedroom",
      membershipHash: "hash",
      revision: 1,
      memberShotNumbers: [1],
      plannedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(mapped.sleepSurface).toEqual({
      type: "long_bed",
      name: "Phum's long bed",
      occupant: "Phum",
      placement: "beside the small desk",
    });
  });

  it("requires the scene_visual_state object", () => {
    expect(sceneVisualStatePlanOutputSchema.safeParse({ contract_version: 1 }).success).toBe(false);
  });
});

describe("scene visual state credit and failure contract", () => {
  it("deducts exactly once with scoped idempotency and metadata", async () => {
    const result = await generateSceneVisualState(params());
    expect(result.state.memberShotNumbers).toEqual([1, 3]);
    expect(result.creditsUsed).toBe(4);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "skill",
      idempotencyKey: "idem-1:scene-visual-state",
      metadata: expect.objectContaining({
        model: "configured-model",
        feature: "vertical_drama_series",
        operation: "scene_visual_state",
        inputTokens: 500,
        outputTokens: 150,
      }),
    }));
  });

  it("checks credits before loading or calling and never deducts when short", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    await expect(generateSceneVisualState(params())).rejects.toThrow(InsufficientCreditsError);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("recovers from empty provider JSON before charging credits", async () => {
    mockExecute
      .mockReset()
      .mockResolvedValueOnce(successResponseContent(""))
      .mockResolvedValueOnce(successResponseContent(""))
      .mockResolvedValueOnce(successResponse(validOutput()));

    const result = await generateSceneVisualState(params());

    expect(result.state.locationKey).toBe("home-kitchen");
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("propagates schema and transport failures without deducting", async () => {
    mockExecute.mockResolvedValue(successResponse({ contract_version: 1 }));
    await expect(generateSceneVisualState(params())).rejects.toThrow(VdSchemaValidationError);
    expect(mockDeductCredits).not.toHaveBeenCalled();

    mockExecute.mockReset();
    mockExecute.mockRejectedValue(new Error("transport unavailable"));
    await expect(generateSceneVisualState(params())).rejects.toThrow("transport unavailable");
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
