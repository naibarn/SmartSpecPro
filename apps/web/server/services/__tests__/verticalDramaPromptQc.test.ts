import { describe, it, expect, vi, beforeEach } from "vitest";

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
    executeJsonPlanningCallWithRetry: vi.fn(),
  };
});
vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  ensurePromptWithinLimit,
  truncateAtSentenceBoundary,
  promptCapForKind,
  VD_IMAGE_PROMPT_MAX,
  VD_VIDEO_PROMPT_MAX,
} from "../verticalDramaPromptQc";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
} from "../verticalDramaStoryBible";

const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockExecuteRetry = vi.mocked(executeJsonPlanningCallWithRetry);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function refinerResult(optimizedPrompt: string, targetType: "image" | "video" = "image") {
  return {
    data: {
      target_type: targetType,
      optimized_prompt: optimizedPrompt,
      character_count: optimizedPrompt.length,
      within_limit: true,
      preserved_intent_summary: "kept subject/emotion/lighting",
      changes_made: [],
      risk_flags: [],
      notes: "",
    },
    response: {
      choices: [{ message: { content: "" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    retried: false,
  } as any;
}

describe("verticalDramaPromptQc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(2);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/cinematic-prompt-refiner-pro",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/cinematic-prompt-refiner-pro/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nRefiner system prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "Refiner system prompt body",
    });
  });

  describe("promptCapForKind", () => {
    it("returns the image cap for image and video cap for video", () => {
      expect(promptCapForKind("image")).toBe(VD_IMAGE_PROMPT_MAX);
      expect(promptCapForKind("video")).toBe(VD_VIDEO_PROMPT_MAX);
    });
  });

  describe("truncateAtSentenceBoundary", () => {
    it("returns the original string unchanged when already within the cap", () => {
      expect(truncateAtSentenceBoundary("short prompt.", 100)).toBe("short prompt.");
    });

    it("cuts at the last sentence boundary before the cap when one exists", () => {
      const text = "First sentence here. Second sentence here. Third sentence that overflows the cap.";
      const result = truncateAtSentenceBoundary(text, 45);
      expect(result.endsWith(".")).toBe(true);
      expect(result.length).toBeLessThanOrEqual(45);
    });

    it("falls back to a hard cut with ellipsis when no reasonable sentence boundary exists", () => {
      const text = "a".repeat(200);
      const result = truncateAtSentenceBoundary(text, 50);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith("…")).toBe(true);
    });
  });

  describe("ensurePromptWithinLimit", () => {
    it("within-cap prompt: returns as-is, refined=false, 0 credits, NO LLM call", async () => {
      const prompt = "a short image prompt";
      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt,
        userId: 1,
      });

      expect(result).toEqual({ prompt, refined: false, creditsUsed: 0, truncated: false });
      expect(mockExecuteRetry).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    });

    it("over-cap prompt: refines successfully via cinematic-prompt-refiner-pro, deducts credits once", async () => {
      const overCapPrompt = "x".repeat(VD_IMAGE_PROMPT_MAX + 500);
      const refined = "y".repeat(VD_IMAGE_PROMPT_MAX - 100);
      mockExecuteRetry.mockResolvedValueOnce(refinerResult(refined));

      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt: overCapPrompt,
        userId: 1,
        tenantId: "tenant-1",
        idempotencyKey: "idem-1",
        label: "test image prompt",
      });

      expect(result.prompt).toBe(refined);
      expect(result.refined).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.creditsUsed).toBe(2);
      expect(mockExecuteRetry).toHaveBeenCalledTimes(1);
      expect(mockDeductCredits).toHaveBeenCalledTimes(1);
      expect(mockDeductCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          tenantId: "tenant-1",
          sourceType: "skill",
          idempotencyKey: "idem-1:qc",
        }),
      );
    });

    it("refine-still-over: retries once with stricter instruction, then truncation fallback when still over", async () => {
      const overCapPrompt = "x".repeat(VD_VIDEO_PROMPT_MAX + 800);
      const stillOverAfterFirst = "y".repeat(VD_VIDEO_PROMPT_MAX + 300);
      const stillOverAfterSecond = "z".repeat(VD_VIDEO_PROMPT_MAX + 100);
      mockExecuteRetry
        .mockResolvedValueOnce(refinerResult(stillOverAfterFirst, "video"))
        .mockResolvedValueOnce(refinerResult(stillOverAfterSecond, "video"));

      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: overCapPrompt,
        userId: 1,
      });

      expect(mockExecuteRetry).toHaveBeenCalledTimes(2);
      expect(result.truncated).toBe(true);
      expect(result.refined).toBe(true);
      expect(result.prompt.length).toBeLessThanOrEqual(VD_VIDEO_PROMPT_MAX);
      // Credits from both refine attempts should be counted.
      expect(result.creditsUsed).toBe(4);
    });

    it("credits are only spent when refinement actually runs (second call has strict instruction)", async () => {
      const overCapPrompt = "x".repeat(VD_IMAGE_PROMPT_MAX + 200);
      const stillOver = "y".repeat(VD_IMAGE_PROMPT_MAX + 50);
      const finallyOk = "z".repeat(VD_IMAGE_PROMPT_MAX - 200);
      mockExecuteRetry
        .mockResolvedValueOnce(refinerResult(stillOver))
        .mockResolvedValueOnce(refinerResult(finallyOk));

      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt: overCapPrompt,
        userId: 1,
      });

      expect(result.truncated).toBe(false);
      expect(result.prompt).toBe(finallyOk);
      expect(mockDeductCredits).toHaveBeenCalledTimes(2);

      const secondCallUserPrompt = mockExecuteRetry.mock.calls[1][0].userPrompt as string;
      expect(secondCallUserPrompt).toContain("previous attempt exceeded");
    });

    it("falls back to hard truncation of the original prompt when refinement throws entirely", async () => {
      const overCapPrompt = "This is a sentence. ".repeat(300);
      mockExecuteRetry.mockRejectedValueOnce(new Error("LLM request failed"));

      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt: overCapPrompt,
        userId: 1,
      });

      expect(result.truncated).toBe(true);
      expect(result.prompt.length).toBeLessThanOrEqual(VD_IMAGE_PROMPT_MAX);
      expect(mockExecuteRetry).toHaveBeenCalledTimes(1);
    });

    it("falls back to hard truncation when insufficient credits (never blocks the user)", async () => {
      const overCapPrompt = "x".repeat(VD_IMAGE_PROMPT_MAX + 100);
      mockHasEnoughCredits.mockResolvedValue(false);

      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt: overCapPrompt,
        userId: 1,
      });

      expect(result.truncated).toBe(true);
      expect(result.prompt.length).toBeLessThanOrEqual(VD_IMAGE_PROMPT_MAX);
      expect(mockExecuteRetry).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });
  });
});
