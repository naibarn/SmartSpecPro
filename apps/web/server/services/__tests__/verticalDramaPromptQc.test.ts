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
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 3) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (the mocked `resolveStoryBibleModel` above)
// so this file's pre-existing "no override configured" behavior/assertions
// are unaffected and no real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  ensurePromptWithinLimit,
  truncateAtSentenceBoundary,
  promptCapForKind,
  VD_IMAGE_PROMPT_MAX,
  VD_VIDEO_PROMPT_MAX,
  PromptProtectedFragmentsOverflowError,
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
        seriesId: 6,
      });

      expect(result).toEqual({ prompt, refined: false, creditsUsed: 0, truncated: false });
      expect(mockExecuteRetry).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    });

    it("appends missing protected dialogue fragments without an LLM call", async () => {
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: "Camera pushes in as both speakers react.",
        protectedFragments: [
          'Native dialogue (verbatim): "บทพูดบรรทัดหนึ่ง" / "บทพูดบรรทัดสอง"',
        ],
        userId: 1,
        seriesId: 6,
      });

      expect(result.prompt).toContain('"บทพูดบรรทัดหนึ่ง"');
      expect(result.prompt).toContain('"บทพูดบรรทัดสอง"');
      expect(mockExecuteRetry).not.toHaveBeenCalled();
    });

    // Dialogue-duplication regression (2026-07-15): the skill/refiner writes
    // inline dialogue in CURLY quotes; the router protects the BARE (unquoted)
    // line text so finalizeProtectedFragments' raw indexOf finds it inside the
    // curly-quoted inline copy and does NOT append a duplicate.
    it("does NOT re-append a BARE line fragment already present inside CURLY-quoted inline text", async () => {
      const line = "อย่ามาเสียตอนเช้านะ วันนี้ลูกค้าจองเมล็ดใหม่ไว้แล้ว";
      const prompt = `Cinematic two-shot. Irin says, “${line}”, jabbing the switch.`;
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt,
        protectedFragments: [line], // BARE line — the fix (not `"${line}"`)
        userId: 1,
        seriesId: 6,
      });
      expect(result.prompt.split(line).length - 1).toBe(1); // present once, not duplicated
      expect(mockExecuteRetry).not.toHaveBeenCalled();
    });

    it("documents the OLD bug: a STRAIGHT-quoted fragment does not match curly-quoted inline and gets duplicated", async () => {
      const line = "อย่ามาเสียตอนเช้านะ วันนี้ลูกค้าจองเมล็ดใหม่ไว้แล้ว";
      const prompt = `Cinematic two-shot. Irin says, “${line}”, jabbing the switch.`;
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt,
        protectedFragments: [`"${line}"`], // OLD straight-quoted form
        userId: 1,
        seriesId: 6,
      });
      expect(result.prompt.split(line).length - 1).toBe(2); // appended → duplicated
    });

    it("preserves protected dialogue after an over-cap refiner result omits it", async () => {
      const overCapPrompt = "x".repeat(VD_VIDEO_PROMPT_MAX + 200);
      mockExecuteRetry.mockResolvedValueOnce(refinerResult("concise camera motion", "video"));

      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: overCapPrompt,
        protectedFragments: ['Native dialogue (verbatim): "ห้ามทำบทพูดนี้หาย"'],
        userId: 1,
        seriesId: 6,
      });

      expect(result.prompt).toContain('"ห้ามทำบทพูดนี้หาย"');
      expect(result.prompt.length).toBeLessThanOrEqual(VD_VIDEO_PROMPT_MAX);
    });

    it("preserves an ordered protected block containing intentional repeated lines", async () => {
      const block = 'Native dialogue (verbatim): "พูดซ้ำ" / "พูดซ้ำ" / "ประโยคท้าย"';
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: "Camera holds on both speakers.",
        protectedFragments: [block],
        userId: 1,
        seriesId: 6,
      });

      expect(result.prompt).toContain(block);
      expect(result.prompt.match(/"พูดซ้ำ"/g)).toHaveLength(2);
    });

    it("throws explicitly when protected fragments alone exceed the hard cap", async () => {
      await expect(
        ensurePromptWithinLimit({
          kind: "video",
          prompt: "short",
          protectedFragments: ["ก".repeat(VD_VIDEO_PROMPT_MAX + 1)],
          userId: 1,
          seriesId: 6,
        }),
      ).rejects.toBeInstanceOf(PromptProtectedFragmentsOverflowError);
      expect(mockExecuteRetry).not.toHaveBeenCalled();
    });

    it("keeps the hard cap when protected content exactly fills the limit", async () => {
      const protectedBlock = "ก".repeat(VD_VIDEO_PROMPT_MAX);
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: "base text must be discarded",
        protectedFragments: [protectedBlock],
        userId: 1,
        seriesId: 6,
      });

      expect(result.prompt).toBe(protectedBlock);
      expect(result.prompt).toHaveLength(VD_VIDEO_PROMPT_MAX);
      expect(mockExecuteRetry).not.toHaveBeenCalled();
    });

    it("drops the base cleanly when protected content leaves zero base budget", async () => {
      const protectedBlock = "ก".repeat(VD_VIDEO_PROMPT_MAX - 1);
      const result = await ensurePromptWithinLimit({
        kind: "video",
        prompt: "base text must be discarded",
        protectedFragments: [protectedBlock],
        userId: 1,
        seriesId: 6,
      });

      expect(result.prompt).toBe(protectedBlock);
      expect(result.prompt.length).toBeLessThanOrEqual(VD_VIDEO_PROMPT_MAX);
      expect(mockExecuteRetry).not.toHaveBeenCalled();
    });

    it("over-cap prompt: refines successfully via cinematic-prompt-refiner-pro, deducts credits once", async () => {
      const overCapPrompt = "x".repeat(VD_IMAGE_PROMPT_MAX + 500);
      const refined = "y".repeat(VD_IMAGE_PROMPT_MAX - 100);
      mockExecuteRetry.mockResolvedValueOnce(refinerResult(refined));

      const result = await ensurePromptWithinLimit({
        kind: "image",
        prompt: overCapPrompt,
        userId: 1,
        seriesId: 6,
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
        seriesId: 6,
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
        seriesId: 6,
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
        seriesId: 6,
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
        seriesId: 6,
      });

      expect(result.truncated).toBe(true);
      expect(result.prompt.length).toBeLessThanOrEqual(VD_IMAGE_PROMPT_MAX);
      expect(mockExecuteRetry).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    // Dialogue-duplication fix (2026-07-15, ground truth from
    // logs/audit/audit-2026-07-15.jsonl) — the router's video-prompt
    // `ensurePromptWithinLimit` call sites now pass INDIVIDUAL bare-quoted
    // dialogue lines as `protectedFragments` (e.g. `["\"line one\"",
    // "\"line two\""]`) instead of the `buildNativeDialogueVerbatimBlock`
    // boilerplate block. These two tests prove that contract actually fixes
    // the duplication: the refiner already keeps dialogue inline while
    // compressing, so protecting the bare line (not the block) means
    // `finalizeProtectedFragments` recognizes it as already-present and
    // never re-appends a second copy — and a genuinely dropped line comes
    // back as a single bare quoted line, never the boilerplate block.
    describe("line-level protectedFragments (dialogue-duplication fix, 2026-07-15)", () => {
      it("inline dialogue already embedded by the refiner survives EXACTLY ONCE — no boilerplate block is re-appended on top", async () => {
        const overCapPrompt = "x".repeat(VD_VIDEO_PROMPT_MAX + 400);
        // The refiner keeps both lines inline/verbatim while compressing —
        // this mirrors the real `cinematic-prompt-refiner-pro` behavior the
        // production bug was rooted in.
        const refinedWithInlineDialogue =
          'Kla speaks: "สวัสดีนะ" while walking away. Nuna replies "อย่าลืมฉัน" softly.';
        mockExecuteRetry.mockResolvedValueOnce(
          refinerResult(refinedWithInlineDialogue, "video"),
        );

        const result = await ensurePromptWithinLimit({
          kind: "video",
          prompt: overCapPrompt,
          protectedFragments: ['"สวัสดีนะ"', '"อย่าลืมฉัน"'],
          userId: 1,
          seriesId: 6,
        });

        expect(result.prompt).toBe(refinedWithInlineDialogue);
        // Exactly one occurrence of each line — never duplicated.
        expect(result.prompt.match(/"สวัสดีนะ"/g)).toHaveLength(1);
        expect(result.prompt.match(/"อย่าลืมฉัน"/g)).toHaveLength(1);
        // The canonical boilerplate block marker must never be added on top
        // of already-inline dialogue.
        expect(result.prompt).not.toContain("Native dialogue (verbatim)");
      });

      it("a dialogue line the refiner dropped is re-appended EXACTLY ONCE as a bare quoted line — never the boilerplate block", async () => {
        const overCapPrompt = "x".repeat(VD_VIDEO_PROMPT_MAX + 400);
        // Refiner keeps the first line inline but drops the second entirely.
        const refinedMissingSecondLine = 'Kla speaks: "สวัสดีนะ" while walking away.';
        mockExecuteRetry.mockResolvedValueOnce(
          refinerResult(refinedMissingSecondLine, "video"),
        );

        const result = await ensurePromptWithinLimit({
          kind: "video",
          prompt: overCapPrompt,
          protectedFragments: ['"สวัสดีนะ"', '"อย่าลืมฉัน"'],
          userId: 1,
          seriesId: 6,
        });

        // First line: unchanged, still exactly once (already inline).
        expect(result.prompt.match(/"สวัสดีนะ"/g)).toHaveLength(1);
        // Second (missing) line: re-appended exactly once, as a bare quoted
        // line — not wrapped in the boilerplate block.
        expect(result.prompt.match(/"อย่าลืมฉัน"/g)).toHaveLength(1);
        expect(result.prompt).not.toContain("Native dialogue (verbatim)");
        expect(result.prompt.endsWith('"อย่าลืมฉัน"')).toBe(true);
      });
    });
  });
});
