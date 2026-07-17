import { describe, expect, it, vi } from "vitest";

import {
  classifyManualDialogueEditLiveSpeechCoverage,
  classifyPremiumOverallScore,
  computeDeepDraftCallRounds,
  computeDeepDraftDisplayHorizon,
  computeDeepDraftExtendCount,
  computePremiumDeepDraftCallEstimate,
  DEEP_DRAFT_EPISODES_PER_CALL,
  DEEP_DRAFT_EXTEND_DEFAULT_EPISODES,
  pollVerticalDramaStoryJob,
  readDeepDraftCliffhangerLine,
  readDeepDraftCompleteness,
  readDeepDraftManualDialogueEditShotNumbers,
  readDeepDraftScorecard,
  readDeepDraftShotDrafts,
  resolveDeepDraftCreatedCharactersSummary,
  resolveManualDialogueEditShotDurationSeconds,
  selectBelowFloorPremiumDimensions,
  sumDeepDraftChunkSizes,
  toManualDialogueEditDraftLines,
  toManualDialogueEditLineInput,
} from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";

function shot(overrides: Partial<{ shot_number: number; summary: string; dialogue_lines: unknown[]; silence_intent: string }> = {}) {
  return {
    shot_number: overrides.shot_number ?? 1,
    summary: overrides.summary ?? "Summary",
    dialogue_lines: overrides.dialogue_lines ?? [{ speaker: "A", line: "Hello" }],
    ...(overrides.silence_intent ? { silence_intent: overrides.silence_intent } : {}),
  };
}

function nineShots(overrides: Partial<Parameters<typeof shot>[0]> = {}) {
  return Array.from({ length: 9 }, (_, i) => shot({ ...overrides, shot_number: i + 1 }));
}

describe("computeDeepDraftDisplayHorizon", () => {
  it("returns totalEpisodes unchanged for a series at or under the 20-episode threshold", () => {
    expect(computeDeepDraftDisplayHorizon(10)).toBe(10);
    expect(computeDeepDraftDisplayHorizon(20)).toBe(20);
  });

  // Large-series no-op fix (plan `planning/vertical-drama-deep-draft-update-all-noop`,
  // 2026-07-14) — the primary CTA now drafts ALL episodes, so the display
  // horizon reflects the full count instead of the old large-series cap of 3.
  it("returns the full episode count for a series larger than 20 episodes (no 3-cap)", () => {
    expect(computeDeepDraftDisplayHorizon(30)).toBe(30);
    expect(computeDeepDraftDisplayHorizon(100)).toBe(100);
  });

  it("returns 0 for a zero-episode series", () => {
    expect(computeDeepDraftDisplayHorizon(0)).toBe(0);
  });

  it("never throws on negative/NaN input", () => {
    expect(computeDeepDraftDisplayHorizon(-5)).toBe(0);
    expect(computeDeepDraftDisplayHorizon(Number.NaN)).toBe(0);
  });
});

describe("computeDeepDraftCallRounds", () => {
  it("matches ceil(horizon / 5) — the owner-approved chunk size", () => {
    expect(DEEP_DRAFT_EPISODES_PER_CALL).toBe(5);
    expect(computeDeepDraftCallRounds(10)).toBe(2);
    expect(computeDeepDraftCallRounds(12)).toBe(3);
    expect(computeDeepDraftCallRounds(3)).toBe(1);
    expect(computeDeepDraftCallRounds(5)).toBe(1);
  });

  it("returns 0 for a zero/negative horizon", () => {
    expect(computeDeepDraftCallRounds(0)).toBe(0);
    expect(computeDeepDraftCallRounds(-1)).toBe(0);
  });
});

/**
 * Owner-reported fix (2026-07-08) — the extend CTA's label previously always
 * read a hardcoded "+5" even when fewer episodes remained (e.g. 9/10 showed
 * "ขยายร่างอีก 5 ตอน" instead of "...อีก 1 ตอน"). This is the pure count the
 * label now interpolates: `min(DEEP_DRAFT_EXTEND_DEFAULT_EPISODES,
 * totalEpisodes - horizonEndEpisode)`.
 */
describe("computeDeepDraftExtendCount", () => {
  it("matches the owner-approved default (5 episodes per extend)", () => {
    expect(DEEP_DRAFT_EXTEND_DEFAULT_EPISODES).toBe(5);
  });

  it("caps at the default when many episodes remain", () => {
    expect(computeDeepDraftExtendCount(100, 3)).toBe(5);
    expect(computeDeepDraftExtendCount(10, 5)).toBe(5);
  });

  it("returns the exact remaining count when fewer than the default remain", () => {
    expect(computeDeepDraftExtendCount(10, 9)).toBe(1);
    expect(computeDeepDraftExtendCount(10, 8)).toBe(2);
  });

  it("never goes negative when horizonEndEpisode is already at/over totalEpisodes (defensive)", () => {
    expect(computeDeepDraftExtendCount(10, 10)).toBe(0);
    expect(computeDeepDraftExtendCount(10, 11)).toBe(0);
  });
});

describe("sumDeepDraftChunkSizes", () => {
  it("sums a chunk-sizes array (the count actually drafted THIS run)", () => {
    expect(sumDeepDraftChunkSizes([5, 5])).toBe(10);
    expect(sumDeepDraftChunkSizes([3])).toBe(3);
  });

  it("returns 0 for empty/null/undefined input, never throws", () => {
    expect(sumDeepDraftChunkSizes([])).toBe(0);
    expect(sumDeepDraftChunkSizes(null)).toBe(0);
    expect(sumDeepDraftChunkSizes(undefined)).toBe(0);
  });
});

describe("readDeepDraftShotDrafts", () => {
  it("returns null when shotDrafts is absent", () => {
    expect(readDeepDraftShotDrafts({ episodeNumber: 1, workingTitle: "T", logline: "L", keyBeats: ["b"] })).toBeNull();
  });

  it("returns null for null/undefined/non-object item, never throws", () => {
    expect(readDeepDraftShotDrafts(null)).toBeNull();
    expect(readDeepDraftShotDrafts(undefined)).toBeNull();
    expect(readDeepDraftShotDrafts("not-an-object")).toBeNull();
  });

  it("returns null for a malformed shotDrafts array (wrong length)", () => {
    expect(readDeepDraftShotDrafts({ shotDrafts: [shot()] })).toBeNull();
  });

  it("parses a valid 9-shot array", () => {
    const result = readDeepDraftShotDrafts({ shotDrafts: nineShots() });
    expect(result).toHaveLength(9);
    expect(result?.[0].shot_number).toBe(1);
    expect(result?.[0].dialogue_lines[0]).toEqual({ speaker: "A", line: "Hello" });
  });

  it("preserves an optional silence_intent field", () => {
    const result = readDeepDraftShotDrafts({
      shotDrafts: nineShots().map((s, i) => (i === 0 ? { ...s, dialogue_lines: [], silence_intent: "establishing" } : s)),
    });
    expect(result?.[0].silence_intent).toBe("establishing");
  });
});

describe("readDeepDraftCliffhangerLine", () => {
  it("returns the trimmed line when present and non-empty", () => {
    expect(readDeepDraftCliffhangerLine({ cliffhanger_line: "The door creaks open." })).toBe(
      "The door creaks open.",
    );
  });

  it("returns undefined when absent, blank, or item is malformed", () => {
    expect(readDeepDraftCliffhangerLine({})).toBeUndefined();
    expect(readDeepDraftCliffhangerLine({ cliffhanger_line: "   " })).toBeUndefined();
    expect(readDeepDraftCliffhangerLine(null)).toBeUndefined();
  });
});

describe("readDeepDraftCompleteness", () => {
  it("parses a valid draftCompleteness object", () => {
    const result = readDeepDraftCompleteness({
      draftCompleteness: {
        dialogueEveryShot: true,
        allSpeakable: true,
        estimatedSpeechSeconds: 42.4,
        coverageStatus: "ok",
      },
    });
    expect(result).toEqual({
      dialogueEveryShot: true,
      allSpeakable: true,
      estimatedSpeechSeconds: 42.4,
      coverageStatus: "ok",
    });
  });

  it("returns null when absent or malformed, never throws", () => {
    expect(readDeepDraftCompleteness({})).toBeNull();
    expect(readDeepDraftCompleteness({ draftCompleteness: { coverageStatus: "not-a-real-status" } })).toBeNull();
    expect(readDeepDraftCompleteness(undefined)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Premium multi-round drafts (W11-B)                                         */
/* -------------------------------------------------------------------------- */

function fullScorecard(overrides: Record<string, number> = {}) {
  return {
    hook_strength: 5,
    reversal_sharpness: 5,
    emotion_variety: 5,
    dialogue_naturalness: 5,
    pacing: 5,
    cliffhanger_strength: 5,
    continuity_with_recap: 5,
    season_cohesion: 5,
    overall: 5,
    judgedAtRound: 0,
    ...overrides,
  };
}

describe("computePremiumDeepDraftCallEstimate", () => {
  it("matches chunkCount*10+2 — the owner-approved conservative pre-check estimate", () => {
    expect(computePremiumDeepDraftCallEstimate(1)).toBe(12);
    expect(computePremiumDeepDraftCallEstimate(3)).toBe(32);
  });

  it("clamps a zero/negative chunk count to 0 before applying the flat +2", () => {
    expect(computePremiumDeepDraftCallEstimate(0)).toBe(2);
    expect(computePremiumDeepDraftCallEstimate(-5)).toBe(2);
  });
});

describe("readDeepDraftScorecard", () => {
  it("returns null when draftScorecard is absent", () => {
    expect(readDeepDraftScorecard({ episodeNumber: 1 })).toBeNull();
  });

  it("returns null for null/undefined/non-object item, never throws", () => {
    expect(readDeepDraftScorecard(null)).toBeNull();
    expect(readDeepDraftScorecard(undefined)).toBeNull();
    expect(readDeepDraftScorecard("not-an-object")).toBeNull();
  });

  it("returns null for a malformed scorecard (missing a dimension)", () => {
    const { pacing: _pacing, ...missingPacing } = fullScorecard();
    expect(readDeepDraftScorecard({ draftScorecard: missingPacing })).toBeNull();
  });

  it("returns null when a dimension score is out of the 1-5 range", () => {
    expect(readDeepDraftScorecard({ draftScorecard: fullScorecard({ pacing: 6 }) })).toBeNull();
  });

  it("parses a valid scorecard", () => {
    const result = readDeepDraftScorecard({ draftScorecard: fullScorecard({ pacing: 2, overall: 3.5 }) });
    expect(result?.pacing).toBe(2);
    expect(result?.overall).toBe(3.5);
    expect(result?.judgedAtRound).toBe(0);
  });
});

describe("selectBelowFloorPremiumDimensions", () => {
  it("returns an empty array when every dimension meets the floor (>= 3)", () => {
    expect(selectBelowFloorPremiumDimensions(fullScorecard())).toEqual([]);
  });

  it("returns only the dimensions scoring below 3, in canonical dimension order", () => {
    const result = selectBelowFloorPremiumDimensions(
      fullScorecard({ pacing: 2, hook_strength: 1, dialogue_naturalness: 2.9 }),
    );
    expect(result).toEqual([
      { dimension: "hook_strength", score: 1 },
      { dimension: "dialogue_naturalness", score: 2.9 },
      { dimension: "pacing", score: 2 },
    ]);
  });

  it("treats exactly 3 as meeting the floor (not below)", () => {
    expect(selectBelowFloorPremiumDimensions(fullScorecard({ pacing: 3 }))).toEqual([]);
  });
});

describe("classifyPremiumOverallScore", () => {
  it("classifies >= 4 as ok (emerald)", () => {
    expect(classifyPremiumOverallScore(4)).toBe("ok");
    expect(classifyPremiumOverallScore(5)).toBe("ok");
  });

  it("classifies 3 to 3.9 as warning (amber)", () => {
    expect(classifyPremiumOverallScore(3)).toBe("warning");
    expect(classifyPremiumOverallScore(3.9)).toBe("warning");
  });

  it("classifies below 3 as error (destructive)", () => {
    expect(classifyPremiumOverallScore(2.9)).toBe("error");
    expect(classifyPremiumOverallScore(1)).toBe("error");
  });
});

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits (W10.5) — inline per-shot editor pure helpers        */
/* -------------------------------------------------------------------------- */

describe("readDeepDraftManualDialogueEditShotNumbers", () => {
  it("returns [] when manualDialogueEdit is absent", () => {
    expect(readDeepDraftManualDialogueEditShotNumbers({ episodeNumber: 1 })).toEqual([]);
  });

  it("returns [] for null/undefined/non-object item, never throws", () => {
    expect(readDeepDraftManualDialogueEditShotNumbers(null)).toEqual([]);
    expect(readDeepDraftManualDialogueEditShotNumbers(undefined)).toEqual([]);
    expect(readDeepDraftManualDialogueEditShotNumbers("not-an-object")).toEqual([]);
  });

  it("returns [] for a malformed stamp (shotNumbers out of 1-9 range), never throws", () => {
    expect(
      readDeepDraftManualDialogueEditShotNumbers({ manualDialogueEdit: { shotNumbers: [0, 10] } }),
    ).toEqual([]);
  });

  it("parses the shotNumbers array from a valid stamp", () => {
    expect(
      readDeepDraftManualDialogueEditShotNumbers({
        manualDialogueEdit: {
          editedAt: "2026-07-08T00:00:00.000Z",
          editedByUserId: 42,
          shotNumbers: [2, 5],
        },
      }),
    ).toEqual([2, 5]);
  });
});

describe("resolveManualDialogueEditShotDurationSeconds", () => {
  it("matches the canonical 60s/9-shot fallback profile exactly, by position", () => {
    expect(resolveManualDialogueEditShotDurationSeconds(1)).toBe(8);
    expect(resolveManualDialogueEditShotDurationSeconds(4)).toBe(4);
    expect(resolveManualDialogueEditShotDurationSeconds(9)).toBe(4);
  });

  it("clamps out-of-range shot numbers to the first/last entry, never throws", () => {
    expect(resolveManualDialogueEditShotDurationSeconds(0)).toBe(8);
    expect(resolveManualDialogueEditShotDurationSeconds(99)).toBe(4);
  });
});

describe("classifyManualDialogueEditLiveSpeechCoverage", () => {
  it("classifies live >= target as ok", () => {
    expect(classifyManualDialogueEditLiveSpeechCoverage(6, 5.44)).toBe("ok");
    expect(classifyManualDialogueEditLiveSpeechCoverage(5.44, 5.44)).toBe("ok");
  });

  it("classifies live between half-target and target as warning", () => {
    expect(classifyManualDialogueEditLiveSpeechCoverage(3, 5.44)).toBe("warning");
  });

  it("classifies live below half-target as error", () => {
    expect(classifyManualDialogueEditLiveSpeechCoverage(1, 5.44)).toBe("error");
    expect(classifyManualDialogueEditLiveSpeechCoverage(0, 5.44)).toBe("error");
  });

  it("treats a zero/negative target as always ok (nothing to fall short of)", () => {
    expect(classifyManualDialogueEditLiveSpeechCoverage(0, 0)).toBe("ok");
    expect(classifyManualDialogueEditLiveSpeechCoverage(5, -1)).toBe("ok");
  });
});

describe("toManualDialogueEditDraftLines", () => {
  it("seeds one draft row per stored line, coercing an absent speaker/delivery to empty strings", () => {
    expect(
      toManualDialogueEditDraftLines([
        { speaker: "Aria", line: "Hello there", delivery: "whispering" },
        { line: "No speaker or delivery" },
      ]),
    ).toEqual([
      { speaker: "Aria", line: "Hello there", delivery: "whispering" },
      { speaker: "", line: "No speaker or delivery", delivery: "" },
    ]);
  });

  it("returns [] for an empty input array", () => {
    expect(toManualDialogueEditDraftLines([])).toEqual([]);
  });
});

describe("toManualDialogueEditLineInput", () => {
  it("trims every field and omits speaker/delivery entirely when blank (post-trim)", () => {
    expect(toManualDialogueEditLineInput({ speaker: "  ", line: "  Hello  ", delivery: "  " })).toEqual({
      line: "Hello",
    });
  });

  it("includes speaker/delivery when non-blank, trimmed", () => {
    expect(
      toManualDialogueEditLineInput({ speaker: " Aria ", line: " Hi ", delivery: " whispering " }),
    ).toEqual({ speaker: "Aria", line: "Hi", delivery: "whispering" });
  });
});

/**
 * Async story jobs (#28, added 2026-07-08) — `pollVerticalDramaStoryJob`
 * mirrors `VerticalDramaEpisodePage.tsx`'s `pollVideoClipTask` convention
 * (fixed-interval poll, no backoff, a bounded attempt count) but is kind-
 * agnostic and shared by generate/extend/critique/apply. Tests use tiny
 * `intervalMs`/`maxAttempts` overrides instead of fake timers.
 */
describe("pollVerticalDramaStoryJob", () => {
  it("calls onSucceeded with the result + kind and stops polling on the FIRST 'succeeded' response", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      kind: "deep_generate",
      status: "succeeded",
      progress: null,
      result: { ok: true },
    });
    const onSucceeded = vi.fn();
    const onFailed = vi.fn();
    const onProgress = vi.fn();

    await pollVerticalDramaStoryJob({ fetchStatus, onProgress, onSucceeded, onFailed, onTimeout: vi.fn() });

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(onSucceeded).toHaveBeenCalledWith({ ok: true }, "deep_generate");
    expect(onFailed).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("calls onFailed with the error message + kind and stops polling on 'failed'", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      kind: "critique",
      status: "failed",
      progress: null,
      error: "boom",
    });
    const onFailed = vi.fn();

    await pollVerticalDramaStoryJob({
      fetchStatus,
      onProgress: vi.fn(),
      onSucceeded: vi.fn(),
      onFailed,
      onTimeout: vi.fn(),
    });

    expect(onFailed).toHaveBeenCalledWith("boom", "critique");
  });

  it("calls onNotFound (never onFailed/onTimeout) when the status fetch returns null", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(null);
    const onNotFound = vi.fn();
    const onFailed = vi.fn();
    const onTimeout = vi.fn();

    await pollVerticalDramaStoryJob({
      fetchStatus,
      onProgress: vi.fn(),
      onSucceeded: vi.fn(),
      onFailed,
      onTimeout,
      onNotFound,
    });

    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("keeps polling (reporting progress each time) while status stays queued/running, then resolves on the eventual 'succeeded'", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ kind: "extend", status: "queued", progress: null })
      .mockResolvedValueOnce({
        kind: "extend",
        status: "running",
        progress: { phase: "draft", chunkIndex: 1, chunkCount: 2 },
      })
      .mockResolvedValueOnce({ kind: "extend", status: "succeeded", progress: null, result: { done: true } });
    const onProgress = vi.fn();
    const onSucceeded = vi.fn();

    await pollVerticalDramaStoryJob({
      fetchStatus,
      onProgress,
      onSucceeded,
      onFailed: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 1, // no real 2.5s wait in tests — the interval itself is covered by the "default" test below.
    });

    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, null, "extend");
    expect(onProgress).toHaveBeenNthCalledWith(2, { phase: "draft", chunkIndex: 1, chunkCount: 2 }, "extend");
    expect(onSucceeded).toHaveBeenCalledWith({ done: true }, "extend");
  });

  it("gives up and calls onTimeout after exhausting maxAttempts without ever reaching a terminal status", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ kind: "apply_critique", status: "running", progress: null });
    const onTimeout = vi.fn();
    const onSucceeded = vi.fn();
    const onFailed = vi.fn();

    await pollVerticalDramaStoryJob({
      fetchStatus,
      onProgress: vi.fn(),
      onSucceeded,
      onFailed,
      onTimeout,
      intervalMs: 1,
      maxAttempts: 3,
    });

    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSucceeded).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("defaults to a 2.5s interval and 720 max attempts (30 minutes — production-grade full-story generation upgrade, 2026-07-13, raised from 240/10 minutes for the longer-running premium quality loop) when not overridden", async () => {
    vi.useFakeTimers();
    try {
      const fetchStatus = vi
        .fn()
        .mockResolvedValueOnce({ kind: "deep_generate", status: "running", progress: null })
        .mockResolvedValueOnce({ kind: "deep_generate", status: "succeeded", progress: null, result: {} });
      const pollPromise = pollVerticalDramaStoryJob({
        fetchStatus,
        onProgress: vi.fn(),
        onSucceeded: vi.fn(),
        onFailed: vi.fn(),
        onTimeout: vi.fn(),
      });

      await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
      // Still only 1 call just under the interval — proves it's genuinely waiting, not busy-polling.
      await vi.advanceTimersByTimeAsync(2499);
      expect(fetchStatus).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));

      await pollPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Set B (`vd-stuck-generation-and-lost-characters` plan, 2026-07-16) —
 * tolerant read of the deep-draft job result's `createdCharacters` field
 * (server's `VdDeepDraftCreatedCharactersSummary`), mirroring
 * `resolveDeepDraftCreatedLocationsCount`'s own "never throw" convention.
 */
describe("resolveDeepDraftCreatedCharactersSummary", () => {
  it("reads count and names when both are present", () => {
    const result = {
      createdCharacters: { count: 2, names: ["ป้าแก้ว", "ลุงมี"] },
    };
    expect(resolveDeepDraftCreatedCharactersSummary(result)).toEqual({
      count: 2,
      names: ["ป้าแก้ว", "ลุงมี"],
    });
  });

  it("defaults to count 0 and an empty names array when the field is entirely absent (older result shape)", () => {
    expect(resolveDeepDraftCreatedCharactersSummary({})).toEqual({
      count: 0,
      names: [],
    });
    expect(resolveDeepDraftCreatedCharactersSummary(null)).toEqual({
      count: 0,
      names: [],
    });
    expect(resolveDeepDraftCreatedCharactersSummary(undefined)).toEqual({
      count: 0,
      names: [],
    });
  });

  it("treats a zero or non-finite count as 0, never throwing", () => {
    expect(
      resolveDeepDraftCreatedCharactersSummary({
        createdCharacters: { count: 0, names: [] },
      })
    ).toEqual({ count: 0, names: [] });
    expect(
      resolveDeepDraftCreatedCharactersSummary({
        createdCharacters: { count: Number.NaN, names: ["x"] },
      })
    ).toEqual({ count: 0, names: ["x"] });
  });

  it("filters out non-string entries from names defensively", () => {
    expect(
      resolveDeepDraftCreatedCharactersSummary({
        createdCharacters: { count: 2, names: ["ok", 5, null, "also-ok"] },
      })
    ).toEqual({ count: 2, names: ["ok", "also-ok"] });
  });
});
