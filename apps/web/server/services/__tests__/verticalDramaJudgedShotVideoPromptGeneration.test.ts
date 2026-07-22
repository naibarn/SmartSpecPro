/**
 * Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
 * quality/plan.md`, Phase 2) — coverage for
 * `generateJudgedVerticalDramaShotVideoPrompt` AND the full matching
 * 6-scenario matrix for its speaker-switch sibling
 * `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch` (parity gap
 * closed — the sibling previously had only 2 smoke tests). Same
 * `executeWithFallback` mock pattern as `verticalDramaShotVideoPromptGeneration.test.ts`
 * (its sibling Phase-1 suite) — a single `mockExecute` whose
 * `mockImplementation` routes each call by CONTENT (never by call-index/
 * order), because the 2 candidate generations run in parallel via
 * `Promise.allSettled` and this file must not assume which of the two
 * `executeWithFallback` calls lands first.
 *
 * Content routing markers (all mutually exclusive by construction):
 *  - judge call (either attempt): user text contains "--- CANDIDATES ---"
 *    (emitted by `buildJudgeUserPrompt`, never by a generation call).
 *  - candidate B: user text contains "VARIATION DIRECTIVE" (only candidate
 *    B's `repairInstruction` carries it).
 *  - repair call: user text contains the test's own repair-instruction
 *    marker string (only the judge's `repair_instruction` — echoed into the
 *    repair call's `repairInstruction` — carries it).
 *  - candidate A: none of the above.
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
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(),
}));
vi.mock("../verticalDramaProviderRouting", () => ({
  detectProviderFamily: vi.fn(),
}));
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
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateJudgedVerticalDramaShotVideoPrompt,
  generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch,
} from "../verticalDramaVideoMotionPromptGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { resolveVerticalDramaCapabilities } from "../modelRegistry";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
const mockResolveVerticalDramaCapabilities = vi.mocked(resolveVerticalDramaCapabilities);

function baseParams(
  overrides: Partial<Parameters<typeof generateJudgedVerticalDramaShotVideoPrompt>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 3,
    imageUrl: "https://cdn.example.com/uploads/vd/shot-3.png",
    imagePrompt: "A young man kneels in a cold corridor, morning light.",
    shotContext: {
      description: "Frame stays high, panic rises",
      camera: "push-in, vertical",
      emotion: "urgent",
      dialogueLines: [] as Array<{
        characterKey?: string;
        lineTh: string;
        emotion?: string;
        delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
        subtext?: string;
      }>,
    },
    selectedVideoModelId: "higgsfield/veo3_1_lite",
    selectedVideoModel: {
      type: "video" as const,
      aspectRatios: ["9:16"],
      configJson: {},
      provider: "higgsfield",
      aliases: [],
      id: "higgsfield/veo3_1_lite",
    },
    locale: "th" as const,
    idempotencyKey: "idem-key-1",
    ...overrides,
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

/** Extracts the plain-text user-message content of one `executeWithFallback` call, regardless of vision (array-of-parts) vs text-only (string) shape. */
function extractUserText(call: any): string {
  const userMessage = call.messages[1];
  if (typeof userMessage.content === "string") return userMessage.content;
  return (userMessage.content as any[]).map(p => p.text ?? "").join("\n");
}

const CANDIDATE_A_PROMPT = "Camera holds steady on the corridor, tension rising.";
const CANDIDATE_B_PROMPT = "Camera pushes in slowly, dread building in his eyes.";
const REPAIR_MARKER = "REPAIR_MARKER_7f3a";

describe("generateJudgedVerticalDramaShotVideoPrompt (Phase 2 — judged best-of-2 quality loop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockIsAllowed.mockReturnValue(true);
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockResolveSkillDirCandidates.mockReturnValue(["/fake/skills"]);
    mockResolveSkillManifestPath.mockReturnValue("/fake/skills/skill.md");
    mockExistsSync.mockReturnValue(true);
    // Both loaders (`loadShotVideoPromptSystemPrompt` and
    // `loadJudgeSystemPrompt`) read through the SAME mocked
    // `fs.readFileSync`/`parseSkillFile` pair — the exact system-prompt text
    // is irrelevant to every test in this file (routing is by USER text
    // content, never system-prompt content), so one shared canned value is
    // fine for both.
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "vision-model-1" } as any]);
    mockSelectBestLlmModel.mockReturnValue("vision-model-1");
    // nativeAudioDialogue: false + no characterReferenceImages keeps every
    // Phase-1 compliance/position-anchor retry OFF for every candidate in
    // this file, so `mockExecute` call counts reflect ONLY this file's own
    // Phase-2 orchestration (2 gen + 1 judge + <=1 repair), never a Phase-1
    // sub-retry — see the module-level `resolveShotVideoPromptModelFamily`
    // gate this mirrors.
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
  });

  it("(a) judged happy path: exactly 3 LLM calls, judge accepts, ships candidate B when winner_index is 1", async () => {
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        return successResponse({ winner_index: 1, verdict: "accept", scores: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(result.prompt).toBe(CANDIDATE_B_PROMPT);
    expect(result.creditsUsed).toBe(15); // 5 (A) + 5 (B) + 5 (judge)
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "accept",
      repaired: false,
    });
  });

  it("(b) repair path: exactly 4 calls, repaired prompt ships when hard facts are equal (tie -> repaired)", async () => {
    const REPAIRED_PROMPT = "Camera holds steady, then eases into a slow, deliberate push.";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        return successResponse({
          winner_index: 0,
          verdict: "repair",
          scores: [],
          repair_instruction: `${REPAIR_MARKER}: tighten the emotional beat.`,
        });
      }
      if (text.includes(REPAIR_MARKER)) {
        return successResponse({ prompt: REPAIRED_PROMPT, dialogue: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    // Hard bound: 2 gen (parallel) + 1 judge + 1 repair = 4, never more.
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(result.prompt).toBe(REPAIRED_PROMPT);
    expect(result.creditsUsed).toBe(20); // 5*4
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "repair",
      repaired: true,
    });
  });

  it("(c) repair path: repaired candidate WORSE on hard facts (over cap) -> original winner ships, repaired:false + warning", async () => {
    const overCapPrompt = "X".repeat(2001);
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        return successResponse({
          winner_index: 0,
          verdict: "repair",
          scores: [],
          repair_instruction: `${REPAIR_MARKER}: expand the camera description.`,
        });
      }
      if (text.includes(REPAIR_MARKER)) {
        return successResponse({ prompt: overCapPrompt, dialogue: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    expect(mockExecute).toHaveBeenCalledTimes(4);
    // Original winner (candidate A, winner_index 0) ships — the repair
    // attempt is discarded because it went over the 2000-char cap.
    expect(result.prompt).toBe(CANDIDATE_A_PROMPT);
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "repair",
      repaired: false,
    });
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.some(w => w.includes("did not improve on hard facts"))).toBe(true);
  });

  it("(d) judge returns invalid JSON on both attempts -> ships candidate A + warning, mode judged, verdict undefined", async () => {
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        // Missing the required `winner_index` field on EVERY attempt (first
        // + the executeVisionAwareJsonCallWithRetry JSON-retry) — both fail
        // schema validation, exhausting the judge's own retry budget.
        return successResponse({ verdict: "accept" });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    // 2 gen (clean) + 2 judge attempts (both invalid) = 4, still within the
    // <=4 hard bound (no repair is ever attempted when the judge itself
    // never produced a usable verdict).
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(result.prompt).toBe(CANDIDATE_A_PROMPT);
    expect(result.promptQuality.mode).toBe("judged");
    expect(result.promptQuality.candidates).toBe(2);
    expect(result.promptQuality.verdict).toBeUndefined();
    expect(result.promptQuality.repaired).toBe(false);
    expect(result.warnings?.some(w => w.includes("judge unavailable"))).toBe(true);
  });

  it("(e) one candidate rejects -> survivor ships, mode single, judge never called", async () => {
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("VARIATION DIRECTIVE")) {
        // Candidate B fails schema validation on BOTH its own attempts
        // (missing the required `prompt` field) -> generateVerticalDramaShotVideoPrompt
        // throws VdSchemaValidationError, rejecting that candidate.
        return successResponse({ dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    // Candidate A: 1 call. Candidate B: 2 calls (first attempt + its own
    // JSON-retry, both invalid). Judge: 0 calls — never reached.
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute.mock.calls.every(call => !extractUserText(call[0]).includes("--- CANDIDATES ---"))).toBe(
      true,
    );
    expect(result.prompt).toBe(CANDIDATE_A_PROMPT);
    expect(result.promptQuality).toEqual({ mode: "single", candidates: 1, repaired: false });
    expect(result.warnings?.some(w => w.includes("one candidate failed to generate"))).toBe(true);
  });

  it("(f) qualityLoop: false -> exactly 1 LLM call, mode single, byte-compatible with Phase 1", async () => {
    mockExecute.mockResolvedValue(successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] }));

    const result = await generateJudgedVerticalDramaShotVideoPrompt(
      baseParams({ qualityLoop: false }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.prompt).toBe(CANDIDATE_A_PROMPT);
    expect(result.promptQuality).toEqual({ mode: "single", candidates: 1, repaired: false });
  });

  it("both candidates reject -> throws (same as today), judge never called", async () => {
    mockExecute.mockImplementation(async () => {
      // Every generation attempt (both candidates, both of each candidate's
      // own JSON-retry attempts) fails schema validation.
      return successResponse({ dialogue: [] });
    });

    await expect(generateJudgedVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow();
    expect(mockExecute.mock.calls.every(call => !extractUserText(call[0]).includes("--- CANDIDATES ---"))).toBe(
      true,
    );
  });

  // Recorded gap fix: `findPositionAnchorIssues`/`buildCandidateFactSheet`
  // now gate the "frame_analysis.people is missing or empty" issue on the
  // SAME `hasEstablishedCharacters` (2+ established characters) signal the
  // rest of this file already uses to decide whether `frame_analysis` was
  // even requested from the skill — a solo/fewer-than-2-established-
  // character shot never asks for `frame_analysis`, so it must never be
  // penalized for omitting it. `baseParams()` supplies zero
  // `characterReferenceImages` and empty `dialogueLines`, so
  // `perLineVerbatimCoverage`/its issues stay empty either way — isolating
  // this assertion to exactly the gated fact.
  it("(g) position-anchor fact sheet: solo-character candidate (fewer than 2 established characters) with no frame_analysis reports 0 issues, no phantom defect sent to the judge", async () => {
    let judgeUserText = "";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        judgeUserText = text;
        return successResponse({ winner_index: 0, verdict: "accept", scores: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(baseParams());

    // No Phase-1 corrective retry fires for this solo-character shot: 2 gen
    // (parallel) + 1 judge = 3, never more.
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(result.promptQuality.mode).toBe("judged");
    expect(judgeUserText).toContain('"positionAnchorIssueCount":0');
    expect(judgeUserText).not.toContain("frame_analysis.people is missing or empty");
  });

  it("(h) position-anchor fact sheet: 2+ established-character candidate with no frame_analysis still flags 1 issue", async () => {
    let judgeUserText = "";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        judgeUserText = text;
        return successResponse({ winner_index: 0, verdict: "accept", scores: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(
      baseParams({
        characterReferenceImages: [
          { characterKey: "alice", name: "Alice", url: "https://cdn.example.com/uploads/vd/alice.png" },
          { characterKey: "bob", name: "Bob", url: "https://cdn.example.com/uploads/vd/bob.png" },
        ],
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(result.promptQuality.mode).toBe("judged");
    expect(judgeUserText).toContain('"positionAnchorIssueCount":1');
    expect(judgeUserText).toContain("frame_analysis.people is missing or empty");
  });
});

describe("generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch (Phase 2 — full 6-scenario matrix, mirrors the non-split orchestrator exactly)", () => {
  function baseSpeakerSwitchParams(
    overrides: Partial<Parameters<typeof generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch>[0]> = {},
  ) {
    return {
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 42,
      episodeId: 7,
      shotNumber: 3,
      imageUrl: "https://example.com/shot3.png",
      shotContext: {
        description: "Two characters argue in a kitchen",
        camera: "medium two-shot",
        dialogueLines: [
          { characterKey: "alice", lineTh: "Why didn't you tell me?" },
          { characterKey: "bob", lineTh: "I was going to." },
        ],
      },
      selectedVideoModelId: "kling-2.0",
      selectedVideoModel: {
        id: "kling-2.0",
        type: "video" as const,
        aspectRatios: ["9:16"],
        configJson: {},
        provider: "test-provider",
        aliases: [],
      },
      locale: "en" as const,
      subShotWindows: [
        { subShotNumber: 1, characterKey: "alice", lineIndexes: [0], durationSeconds: 3 },
        { subShotNumber: 2, characterKey: "bob", lineIndexes: [1], durationSeconds: 5 },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockIsAllowed.mockReturnValue(true);
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockResolveSkillDirCandidates.mockReturnValue(["/fake/skills"]);
    mockResolveSkillManifestPath.mockReturnValue("/fake/skills/skill.md");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "vision-model-1" } as any]);
    mockSelectBestLlmModel.mockReturnValue("vision-model-1");
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
  });

  const SPEAKER_SWITCH_CANDIDATE_A_PROMPT =
    "A: a continuous kitchen argument, cutting between the hero and the villain.";
  const SPEAKER_SWITCH_CANDIDATE_B_PROMPT =
    "B: cutting between the hero and the villain, second take.";

  it("(a) judged happy path: 3 LLM calls, includes timed-segment facts in the judge prompt, returns promptQuality", async () => {
    let judgeUserText = "";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        judgeUserText = text;
        return successResponse({ winner_index: 0, verdict: "accept", scores: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "accept",
      repaired: false,
    });
    expect(judgeUserText).toContain("Timed segments");
    expect(judgeUserText).toContain("anchor speaker alice");
    expect(judgeUserText).toContain("anchor speaker bob");
  });

  // Recorded gap fix — this file previously had only 2 smoke tests for the
  // speaker-switch judged orchestrator while the non-split orchestrator
  // (`describe` block above) had the full 6-scenario matrix. (b)-(e) below
  // port those exact scenarios onto `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch`
  // / `baseSpeakerSwitchParams()`, using the SAME content-routed mock
  // pattern (never call-order-based `mockResolvedValueOnce` chains, since
  // both candidates run in parallel via `Promise.allSettled`).
  it("(b) repair path: exactly 4 calls, repaired prompt ships when hard facts are equal (tie -> repaired)", async () => {
    const REPAIRED_PROMPT =
      "Camera holds on the kitchen, then cuts cleanly between the hero and the villain.";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        return successResponse({
          winner_index: 0,
          verdict: "repair",
          scores: [],
          repair_instruction: `${REPAIR_MARKER}: tighten the cut timing.`,
        });
      }
      if (text.includes(REPAIR_MARKER)) {
        return successResponse({ prompt: REPAIRED_PROMPT, dialogue: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    // Hard bound: 2 gen (parallel) + 1 judge + 1 repair = 4, never more.
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(result.prompt).toBe(REPAIRED_PROMPT);
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "repair",
      repaired: true,
    });
  });

  it("(c) repair path: repaired candidate WORSE on hard facts (over cap) -> original winner ships, repaired:false + warning", async () => {
    const overCapPrompt = "X".repeat(2001);
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        return successResponse({
          winner_index: 0,
          verdict: "repair",
          scores: [],
          repair_instruction: `${REPAIR_MARKER}: expand the camera description.`,
        });
      }
      if (text.includes(REPAIR_MARKER)) {
        return successResponse({ prompt: overCapPrompt, dialogue: [] });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    expect(mockExecute).toHaveBeenCalledTimes(4);
    // Original winner (candidate A, winner_index 0) ships — the repair
    // attempt is discarded because it went over the 2000-char cap.
    expect(result.prompt).toBe(SPEAKER_SWITCH_CANDIDATE_A_PROMPT);
    expect(result.promptQuality).toEqual({
      mode: "judged",
      candidates: 2,
      verdict: "repair",
      repaired: false,
    });
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.some(w => w.includes("did not improve on hard facts"))).toBe(true);
  });

  it("(d) judge returns invalid JSON on both attempts -> ships candidate A + warning, mode judged, verdict undefined", async () => {
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        // Missing the required `winner_index` field on EVERY attempt (first
        // + the executeVisionAwareJsonCallWithRetry JSON-retry) — both fail
        // schema validation, exhausting the judge's own retry budget.
        return successResponse({ verdict: "accept" });
      }
      if (text.includes("VARIATION DIRECTIVE")) {
        return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_B_PROMPT, dialogue: [] });
      }
      return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    // 2 gen (clean) + 2 judge attempts (both invalid) = 4, still within the
    // <=4 hard bound (no repair is ever attempted when the judge itself
    // never produced a usable verdict).
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(result.prompt).toBe(SPEAKER_SWITCH_CANDIDATE_A_PROMPT);
    expect(result.promptQuality.mode).toBe("judged");
    expect(result.promptQuality.candidates).toBe(2);
    expect(result.promptQuality.verdict).toBeUndefined();
    expect(result.promptQuality.repaired).toBe(false);
    expect(result.warnings?.some(w => w.includes("judge unavailable"))).toBe(true);
  });

  it("(e) one candidate rejects -> survivor ships, mode single, judge never invoked", async () => {
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("VARIATION DIRECTIVE")) {
        // Candidate B fails schema validation on BOTH its own attempts
        // (missing the required `prompt` field) -> generateVerticalDramaShotVideoPromptSpeakerSwitch
        // throws VdSchemaValidationError, rejecting that candidate.
        return successResponse({ dialogue: [] });
      }
      return successResponse({ prompt: SPEAKER_SWITCH_CANDIDATE_A_PROMPT, dialogue: [] });
    });

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    // Candidate A: 1 call. Candidate B: 2 calls (first attempt + its own
    // JSON-retry, both invalid). Judge: 0 calls — never reached.
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute.mock.calls.every(call => !extractUserText(call[0]).includes("--- CANDIDATES ---"))).toBe(
      true,
    );
    expect(result.prompt).toBe(SPEAKER_SWITCH_CANDIDATE_A_PROMPT);
    expect(result.promptQuality).toEqual({ mode: "single", candidates: 1, repaired: false });
    expect(result.warnings?.some(w => w.includes("one candidate failed to generate"))).toBe(true);
  });

  it("(f) qualityLoop: false -> exactly 1 LLM call, mode single", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Solo take.", dialogue: [] }),
    );

    const result = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams({ qualityLoop: false }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.promptQuality).toEqual({ mode: "single", candidates: 1, repaired: false });
  });
});
