/**
 * Coverage for `verticalDramaLocationDetector.ts` — location-side companion
 * to `verticalDramaCharacterVariantPlanner.test.ts`, whose mocking
 * convention this mirrors exactly (LLM call layer + skill-file loading
 * mocked; `executeJsonPlanningCallWithRetry` itself runs for REAL, from the
 * real `verticalDramaStoryBible.ts`).
 *
 * `../verticalDramaImproveScript` is FULLY mocked (only
 * `resolveQualityLargeContextModelId` is used by this file) rather than
 * partially mocked via `vi.importActual` — avoids pulling in that module's
 * own heavy transitive chain (skillRegistry/skillExecutionPolicy/
 * enabledLlmModels/creditService) during this file's own test run.
 *
 * `reconcileLocationDetectionPlan`'s only collaborator
 * (`reconcileEpisodeLocations`, dynamically imported from
 * `../verticalDramaLocationReconciliation`) is mocked wholesale — this file
 * never touches `../db` at all, since `verticalDramaLocationDetector.ts`
 * itself is DB-light (all persistence is delegated to that dynamically
 * imported module).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
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
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
// Centralized per-series model policy resolver — mocked to replicate the
// real resolver's "auto-fallback, then resolveStoryBibleModel() as the last
// resort" contract (this call site's `autoFallback` is
// `resolveQualityLargeContextModelId`, which CAN resolve to `null`) using
// the already-mocked `resolveStoryBibleModel` above — byte-identical
// convention to `verticalDramaCharacterVariantPlanner.test.ts`'s own mock.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    async (_seriesId: number, autoFallback: () => Promise<string | null>) => {
      const auto = await autoFallback();
      if (auto) return auto;
      const { resolveStoryBibleModel } = await import("../verticalDramaStoryBible");
      return resolveStoryBibleModel();
    },
  ),
}));

const { mockReconcileEpisodeLocations } = vi.hoisted(() => ({
  mockReconcileEpisodeLocations: vi.fn(),
}));
vi.mock("../verticalDramaLocationReconciliation", () => ({
  reconcileEpisodeLocations: mockReconcileEpisodeLocations,
}));

import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { parseSkillFile } from "@smartspec/skills";
import fs from "fs";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";
import {
  buildLocationDetectionPlannerUserPrompt,
  generateLocationDetectionPlan,
  reconcileLocationDetectionPlan,
  InsufficientCreditsError,
  VdSchemaValidationError,
  type GenerateLocationDetectionPlanParams,
  type LocationDetectionPlan,
} from "../verticalDramaLocationDetector";
import type { StoryScriptEpisodeInput } from "@shared/verticalDramaSeries/storyScriptText";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function episode(overrides: Partial<StoryScriptEpisodeInput> = {}): StoryScriptEpisodeInput {
  return {
    episodeNumber: 1,
    workingTitle: "เช้าวันธรรมดา",
    logline: "หนูนาตื่นนอนในห้องนอนเล็กๆ ช่วยแม่จัดโต๊ะอาหารเช้าที่ครัว",
    keyBeats: ["หนูนาตื่นนอน ลงมาช่วยแม่จัดโต๊ะอาหารเช้าที่ครัวเปิดโล่ง"],
    shotDrafts: null,
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<GenerateLocationDetectionPlanParams> = {},
): GenerateLocationDetectionPlanParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 6,
    lang: "th",
    existingLocations: [
      { locationKey: "home-kitchen", name: "ครัวที่บ้าน", description: "ครัวเปิดโล่งต่อกับมุมกินข้าว" },
    ],
    episodes: [episode()],
    ...overrides,
  };
}

function validOutput(overrides: Partial<LocationDetectionPlan> = {}): LocationDetectionPlan {
  return {
    contract_version: 1,
    locations: [
      {
        location_key: "home-kitchen",
        name: "ครัวที่บ้าน",
        description: "a modest Thai home kitchen, open-plan layout connecting to a small dining nook",
        applies_to_episodes: [1, 4],
      },
    ],
    ...overrides,
  } as LocationDetectionPlan;
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 150 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockResolveModel.mockResolvedValue("gpt-4o-mini");
  mockResolveQualityModel.mockResolvedValue(null);
  mockCalculateCredits.mockReturnValue(4);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockResolveSkillDirCandidates.mockReturnValue([
    "/fake/skills/vertical-drama-location-detector",
  ]);
  mockResolveSkillManifestPath.mockReturnValue(
    "/fake/skills/vertical-drama-location-detector/skill.md",
  );
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
  mockParseSkillFile.mockReturnValue({
    metadata: {} as any,
    content: "System prompt body",
  });
});

/* -------------------------------------------------------------------------- */
/* buildLocationDetectionPlannerUserPrompt                                    */
/* -------------------------------------------------------------------------- */

describe("buildLocationDetectionPlannerUserPrompt", () => {
  it("assembles only data facts — location roster lines + whole-season episode text, no authored instruction prose", () => {
    const prompt = buildLocationDetectionPlannerUserPrompt(baseParams());

    expect(prompt).toContain("contract_version: 1");
    expect(prompt).toContain("locale: th");
    expect(prompt).toContain(
      "- location_key=home-kitchen name=ครัวที่บ้าน description=ครัวเปิดโล่งต่อกับมุมกินข้าว",
    );
    expect(prompt).toContain("ตอนที่ 1: เช้าวันธรรมดา");
    expect(prompt).toContain("เรื่องย่อ: หนูนาตื่นนอนในห้องนอนเล็กๆ ช่วยแม่จัดโต๊ะอาหารเช้าที่ครัว");

    // No code-authored creative/instructional sentences — those live only in
    // skill.md, never in the assembled facts.
    expect(prompt).not.toMatch(/what counts as a distinct location/i);
    expect(prompt).not.toMatch(/environment-only/i);
    expect(prompt).not.toMatch(/never invent physical details/i);
  });

  it("falls back to labeled placeholders when existingLocations/episodes are empty", () => {
    const prompt = buildLocationDetectionPlannerUserPrompt(
      baseParams({ existingLocations: [], episodes: [] }),
    );

    expect(prompt).toContain("location_roster:\n(none)");
    expect(prompt).toContain("season_script:\n(no drafted episodes)");
  });

  it("defaults locale to th when omitted", () => {
    const prompt = buildLocationDetectionPlannerUserPrompt(baseParams({ lang: undefined }));
    expect(prompt).toContain("locale: th");
  });

  it("renders (none) for an existing location's blank description", () => {
    const prompt = buildLocationDetectionPlannerUserPrompt(
      baseParams({
        existingLocations: [{ locationKey: "loc-1", name: "สถานที่ใหม่", description: "" }],
      }),
    );
    expect(prompt).toContain("- location_key=loc-1 name=สถานที่ใหม่ description=(none)");
  });
});

/* -------------------------------------------------------------------------- */
/* generateLocationDetectionPlan                                              */
/* -------------------------------------------------------------------------- */

describe("generateLocationDetectionPlan", () => {
  it("happy path: returns the validated plan, deducts credits once, prefers the quality large-context model", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveQualityModel.mockResolvedValue("quality/large-context-model");
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateLocationDetectionPlan(baseParams());

    expect(result.plan.locations).toHaveLength(1);
    expect(result.plan.locations[0].location_key).toBe("home-kitchen");
    expect(result.model).toBe("quality/large-context-model");
    expect(result.creditsUsed).toBe(4);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
        sourceType: "skill",
        metadata: expect.objectContaining({ operation: "location_detector" }),
      }),
    );
  });

  it("falls back to resolveStoryBibleModel when no quality large-context model is eligible", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveQualityModel.mockResolvedValue(null);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateLocationDetectionPlan(baseParams());

    expect(result.model).toBe("gpt-4o-mini");
  });

  it("returns an empty plan as a valid (non-error) result when the skill proposes nothing", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse({ contract_version: 1, locations: [] }));

    const result = await generateLocationDetectionPlan(baseParams());

    expect(result.plan.locations).toEqual([]);
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateLocationDetectionPlan(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed output (empty description fails min(1))", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse(
        validOutput({
          locations: [
            {
              location_key: "home-kitchen",
              name: "ครัวที่บ้าน",
              description: "",
              applies_to_episodes: [],
            },
          ],
        } as any),
      ),
    );

    await expect(generateLocationDetectionPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileLocationDetectionPlan                                             */
/* -------------------------------------------------------------------------- */

describe("reconcileLocationDetectionPlan", () => {
  const owner = { tenantId: "tenant-1", userId: 1, seriesId: 6 };

  it("maps plan.locations[] onto VerticalDramaStoryboardLocationGroup[] (camelCase, shotNumbers: []) and delegates entirely to reconcileEpisodeLocations", async () => {
    mockReconcileEpisodeLocations.mockResolvedValue({
      createdLocations: [{ locationKey: "home-kitchen", name: "ครัวที่บ้าน" }],
      reusedLocations: [],
    });

    const plan: LocationDetectionPlan = validOutput();
    const summary = await reconcileLocationDetectionPlan(owner, plan);

    expect(mockReconcileEpisodeLocations).toHaveBeenCalledTimes(1);
    expect(mockReconcileEpisodeLocations).toHaveBeenCalledWith(owner, [
      {
        locationKey: "home-kitchen",
        locationName: "ครัวที่บ้าน",
        description: "a modest Thai home kitchen, open-plan layout connecting to a small dining nook",
        shotNumbers: [],
      },
    ]);
    expect(summary.createdLocations).toEqual([{ locationKey: "home-kitchen", name: "ครัวที่บ้าน" }]);
    expect(summary.reusedLocations).toEqual([]);
  });

  it("maps a plan with multiple locations, preserving order", async () => {
    mockReconcileEpisodeLocations.mockResolvedValue({ createdLocations: [], reusedLocations: [] });

    const plan: LocationDetectionPlan = {
      contract_version: 1,
      locations: [
        { location_key: "home-kitchen", name: "ครัวที่บ้าน", description: "desc 1", applies_to_episodes: [1] },
        { location_key: "school-hallway", name: "ทางเดินโรงเรียน", description: "desc 2", applies_to_episodes: [2] },
      ],
    } as LocationDetectionPlan;

    await reconcileLocationDetectionPlan(owner, plan);

    expect(mockReconcileEpisodeLocations).toHaveBeenCalledWith(owner, [
      { locationKey: "home-kitchen", locationName: "ครัวที่บ้าน", description: "desc 1", shotNumbers: [] },
      { locationKey: "school-hallway", locationName: "ทางเดินโรงเรียน", description: "desc 2", shotNumbers: [] },
    ]);
  });

  it("maps an empty locations[] plan to an empty groups array (never throws)", async () => {
    mockReconcileEpisodeLocations.mockResolvedValue({ createdLocations: [], reusedLocations: [] });

    await reconcileLocationDetectionPlan(owner, { contract_version: 1, locations: [] });

    expect(mockReconcileEpisodeLocations).toHaveBeenCalledWith(owner, []);
  });

  it("returns exactly whatever reconcileEpisodeLocations returns (thin adapter, no extra transformation)", async () => {
    const summaryFromReconciler = {
      createdLocations: [{ locationKey: "a", name: "A" }],
      reusedLocations: [{ locationKey: "b", name: "B" }],
    };
    mockReconcileEpisodeLocations.mockResolvedValue(summaryFromReconciler);

    const summary = await reconcileLocationDetectionPlan(owner, validOutput());

    expect(summary).toBe(summaryFromReconciler);
  });
});
