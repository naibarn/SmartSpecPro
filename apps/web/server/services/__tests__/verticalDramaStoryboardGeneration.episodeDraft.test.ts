/**
 * Coverage for `verticalDramaStoryboardGeneration.ts`'s deep story drafts
 * hydration (W10-B, spec/section-16 refine-mode, added 2026-07-08) — the
 * storyboard-side twin of
 * `verticalDramaScriptGeneration.episodeDraft.test.ts`:
 *  - `episode_draft` prompt injection, flag-gated on
 *    `opts.episodeDraftHydrationEnabled`, decoupled from the `episodeDraft`
 *    payload itself;
 *  - the exact draft shot/dialogue content round-trips into the prompt
 *    unchanged;
 *  - a non-draft episode (no `episodeDraft` supplied) produces a
 *    byte-identical prompt to before this change, even with the flag on.
 *
 * Mirrors `verticalDramaStoryboardGeneration.test.ts`'s mocking pattern
 * exactly.
 */
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
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<
    typeof import("../verticalDramaStoryBible")
  >("../verticalDramaStoryBible");
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { generateStoryboardShotgrid } from "../verticalDramaStoryboardGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateStoryboardShotgrid>[0]> = {}
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    episodeNumber: 1,
    locale: "en" as const,
    durationSeconds: 90,
    storySource: {
      logline: "l",
      keyBeats: ["b1"],
      mainPlot: "p",
      seasonArc: "a",
      tone: "t",
    },
    characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
    ...overrides,
  };
}

function validShot(n: number) {
  return {
    shot_number: n,
    timecode: `00:0${n}`,
    duration_seconds: 10,
    narrative_purpose: "advance plot",
    characters: ["char-1"],
    required_character_refs: ["char-1"],
    camera: {
      shot_type: "medium",
      angle: "eye-level",
      lens_feel: "50mm",
      movement: "static",
      composition: "rule of thirds",
    },
    visual_description: "A scene",
    image_prompt: "A vivid image prompt",
  };
}

function validOutput(shotCount = 9) {
  return {
    storyboard_summary: {},
    canonical_style_bible: {},
    shot_grid_plan: {},
    shots: Array.from({ length: shotCount }, (_, i) => validShot(i + 1)),
    plain_text_storyboard: "Full storyboard text",
    storyboard_handoff_json: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

/** A vetted W10-A per-shot draft — exact shape `readItemShotDrafts` returns. */
function sampleEpisodeDraft() {
  return {
    shots: [
      {
        shot_number: 1,
        summary: "A quiet establishing beat before the confrontation",
        dialogue_lines: [],
        silence_intent: "establishing" as const,
      },
      {
        shot_number: 2,
        summary: "Aria confronts the rival across the boardroom table",
        dialogue_lines: [
          { speaker: "char_aria", line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ", delivery: "เย็นชา" },
        ],
      },
    ],
    cliffhanger_line: "Her assistant whispers that the rival's own board just called an emergency vote.",
  };
}

describe("generateStoryboardShotgrid — episode draft hydration (refine mode, flag-gated, W10-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-storyboard-shotgrid",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-storyboard-shotgrid/skill.md"
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: test\n---\nSystem prompt body" as any
    );
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("injects episode_draft with the exact draft shot/dialogue content when opts.episodeDraftHydrationEnabled is true and episodeDraft is supplied", async () => {
    const episodeDraft = sampleEpisodeDraft();

    await generateStoryboardShotgrid(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true },
        episodeDraft,
      } as any),
    );

    const callArgs = mockExecute.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("episode_draft");
    expect(userMessage.content).toContain(
      "A vetted per-shot draft exists — REFINE it into the full storyboard shot schema",
    );
    expect(userMessage.content).toContain("preserve the 9-shot allocation");

    // The exact draft content round-trips unchanged — same compact-JSON
    // extraction technique as the script-builder twin test, but this file's
    // `buildUserPrompt` joins sections with a SINGLE "\n" (not "\n\n"): since
    // JSON.stringify emits compact JSON with no embedded newlines anywhere,
    // the first (and only) "}" immediately followed by a real newline is
    // still guaranteed to be the outermost one.
    const match = userMessage.content.match(/episode_draft: (\{.*?\})\n/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(match![1]);
    expect(payload).toEqual(episodeDraft);
    expect(payload.shots[0].silence_intent).toBe("establishing");
    expect(payload.shots[1].dialogue_lines[0].line).toBe("เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ");
    expect(payload.cliffhanger_line).toBe(episodeDraft.cliffhanger_line);
  });

  it("omits episode_draft entirely when the flag is off, even though episodeDraft is supplied (byte-identical to before this change)", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        episodeDraft: sampleEpisodeDraft(),
      } as any),
    );

    const callArgs = mockExecute.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
    expect(userMessage.content).not.toContain("REFINE it into the full storyboard shot schema");
  });

  it("omits episode_draft when the flag is explicitly false, even with episodeDraft supplied", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        opts: { episodeDraftHydrationEnabled: false },
        episodeDraft: sampleEpisodeDraft(),
      } as any),
    );

    const callArgs = mockExecute.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
  });

  it("omits episode_draft when the flag is on but no episodeDraft is supplied (non-draft episode — payload byte-identical to today)", async () => {
    await generateStoryboardShotgrid(
      baseParams({ opts: { episodeDraftHydrationEnabled: true } } as any),
    );

    const callArgs = mockExecute.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
  });

  it("produces a fully byte-identical prompt to a call with no opts/episodeDraft at all when both are omitted (control case)", async () => {
    await generateStoryboardShotgrid(baseParams());
    const withoutAnything = mockExecute.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(
      baseParams({ opts: { episodeDraftHydrationEnabled: false } } as any),
    );
    const withFlagFalse = mockExecute.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    expect(withFlagFalse).toBe(withoutAnything);
  });

  it("still produces a valid 9-shot storyboard and deducts credits normally when episode draft hydration is on (generation is not skipped)", async () => {
    const result = await generateStoryboardShotgrid(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true },
        episodeDraft: sampleEpisodeDraft(),
      } as any),
    );

    expect(result.storyboard.shots).toHaveLength(9);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});
