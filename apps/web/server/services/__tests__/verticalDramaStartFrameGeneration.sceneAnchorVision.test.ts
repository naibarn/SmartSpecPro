import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(),
}));
vi.mock("../db", () => ({ db: {}, getDb: vi.fn() }));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));

import {
  buildStartFrameShotPromptVisionImages,
  generateStartFrameShotPrompt,
} from "../verticalDramaStartFrameGeneration";
import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { hasEnoughCredits } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveStartFramePlanModel } from "../verticalDramaImproveScript";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { executeWithFallback } from "../llmRouter";

const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockResolveModel = vi.mocked(resolveStartFramePlanModel);
const mockLoadModels = vi.mocked(loadEnabledLlmModelRows);
const mockSelectModel = vi.mocked(selectBestLlmModel);
const mockExecute = vi.mocked(executeWithFallback);
const mockResolveSkillDirs = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifest = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockIsAllowed.mockReturnValue(true);
  mockResolveModel.mockResolvedValue("configured-model");
  mockLoadModels.mockResolvedValue([
    { modelId: "configured-model", supportsVision: true } as any,
  ]);
  mockSelectModel.mockReturnValue("configured-model");
  mockResolveSkillDirs.mockReturnValue(["/tmp/skill"]);
  mockResolveSkillManifest.mockReturnValue("/tmp/skill/skill.md");
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("---\n---\nSKILL");
  mockParseSkillFile.mockReturnValue({ content: "SKILL" } as any);
  mockExecute.mockResolvedValue({
    type: "success",
    response: {
      choices: [
        {
          message: {
            content: JSON.stringify({ prompt: "prompt", negative_prompt: "negative" }),
          },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
    providerName: "openai",
    providerId: 1,
  } as any);
});

describe("buildStartFrameShotPromptVisionImages — scene anchor", () => {
  it("keeps the absent-anchor output byte-identical and appends anchor after location", () => {
    const base = buildStartFrameShotPromptVisionImages(
      "https://cdn/current.png",
      [{ url: "https://cdn/additional.png", label: "extra" }],
      {
        characterReferenceImages: [{ url: "https://cdn/char.png", label: "Hero" }],
        locationReferenceImage: { url: "https://cdn/location.png", label: "Hall" },
      },
    );
    expect(base).toEqual([
      { url: "https://cdn/current.png" },
      { url: "https://cdn/char.png", label: "Image 1 reference: Hero" },
      { url: "https://cdn/location.png", label: "Location reference: Hall" },
      { url: "https://cdn/additional.png", label: "extra" },
    ]);

    const withAnchor = buildStartFrameShotPromptVisionImages(
      "https://cdn/current.png",
      undefined,
      {
        characterReferenceImages: [{ url: "https://cdn/char.png", label: "Hero" }],
        locationReferenceImage: { url: "https://cdn/location.png", label: "Hall" },
        sceneAnchorImage: {
          url: "https://cdn/shot-2.png",
          anchorShotNumber: 2,
        },
        sceneContinuityEnabled: true,
      },
    );
    expect(withAnchor).toEqual([
      { url: "https://cdn/current.png" },
      { url: "https://cdn/char.png", label: "Image 1 reference: Hero" },
      { url: "https://cdn/location.png", label: "Location reference: Hall" },
      {
        url: "https://cdn/shot-2.png",
        label: "Scene continuity reference (shot 2): same scene, same lighting, same set",
      },
    ]);
  });

  it("attaches prop/object references after the location reference", () => {
    const images = buildStartFrameShotPromptVisionImages(
      undefined,
      undefined,
      {
        locationReferenceImage: { url: "https://cdn/location.png", label: "Hall" },
        propObjectReferenceImages: [
          { url: "https://cdn/box.png", label: "Locked wooden box" },
        ],
      },
    );
    expect(images).toEqual([
      { url: "https://cdn/location.png", label: "Location reference: Hall" },
      {
        url: "https://cdn/box.png",
        label: "Prop/object reference: Locked wooden box",
      },
    ]);
  });

  it("does not pull cinematic portrait/location references into the legacy prop-only path", () => {
    const images = buildStartFrameShotPromptVisionImages(
      "https://cdn/current.png",
      undefined,
      {
        propObjectReferenceImages: [
          { url: "https://cdn/box.png", label: "Locked wooden box" },
        ],
      },
    );
    expect(images).toEqual([
      { url: "https://cdn/current.png" },
      {
        url: "https://cdn/box.png",
        label: "Prop/object reference: Locked wooden box",
      },
    ]);
  });

  it("raises the cap to seven and drops anchor before location when the flag is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const images = buildStartFrameShotPromptVisionImages(
      "https://cdn/current.png",
      undefined,
      {
        characterReferenceImages: [
          { url: "https://cdn/c1.png", label: "C1" },
          { url: "https://cdn/c2.png", label: "C2" },
          { url: "https://cdn/c3.png", label: "C3" },
          { url: "https://cdn/c4.png", label: "C4" },
        ],
        locationReferenceImage: { url: "https://cdn/location.png", label: "Hall" },
        sceneAnchorImage: { url: "https://cdn/shot-2.png", anchorShotNumber: 2 },
      },
    );
    expect(images).toHaveLength(6);
    expect(images.some(image => image.url === "https://cdn/shot-2.png")).toBe(false);
    expect(images.some(image => image.url === "https://cdn/location.png")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "[vd_shot_start_frame_prompt] scene continuity anchor dropped by the vision-attachment cap",
      expect.objectContaining({ anchorShotNumber: 2, cap: 6 }),
    );
    warn.mockRestore();
  });
});

describe("generateStartFrameShotPrompt — anchor-only vision gate", () => {
  it("takes the cinematic vision path when the anchor is the only image input", async () => {
    const result = await generateStartFrameShotPrompt({
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 2,
      episodeId: 3,
      shotNumber: 4,
      currentPrompt: "current",
      currentNegativePrompt: "negative",
      canonicalShotSummary: "A shot",
      characterReferenceManifest: [],
      imagePromptMode: "cinematic_narrative",
      sceneAnchorImage: {
        url: "https://cdn/shot-3.png",
        anchorShotNumber: 3,
      },
      sceneContinuityEnabled: true,
    });
    expect(result.usedVision).toBe(true);
    expect(mockLoadModels).toHaveBeenCalled();
  });

  it("requests vision when a prop/object reference is the only attached reference", async () => {
    const result = await generateStartFrameShotPrompt({
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 2,
      episodeId: 3,
      shotNumber: 4,
      currentPrompt: "current",
      currentNegativePrompt: "negative",
      canonicalShotSummary: "A shot",
      characterReferenceManifest: [],
      propObjectReferenceImages: [
        { url: "https://cdn/box.png", label: "Locked wooden box" },
      ],
    });
    expect(result.usedVision).toBe(true);
    expect(mockLoadModels).toHaveBeenCalled();
  });
});
