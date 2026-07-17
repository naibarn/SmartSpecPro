import { describe, expect, it } from "vitest";
import {
  RELATIONSHIP_LIMITATION_NOTE,
  buildSeriesMemoryBackfillPreview,
  formatSeriesMemoryBackfillTable,
  isStoredMemoryUserEdited,
  resolveBackfillEpisodeMemory,
  validateSeriesMemoryApplyPreconditions,
  type VdSeriesMemoryBackfillEpisodeRow,
} from "../backfill-vertical-drama-series-memory";
import { foldSeriesMemory } from "@shared/verticalDramaSeries/seriesMemoryState";

/** A minimal, schema-valid `plan_episode_script` output (real-shape fixture, mirrors series-16 dev-DB rows). */
function realScript(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 1,
    episode_title: "ตอนทดสอบ",
    hook: "hook line",
    structure: { mode: "beat", beats: [] },
    scene_dialogue_summary: [],
    cliffhanger: "cliffhanger line",
    character_state_deltas: [],
    product_tie_in_plan: {},
    continuity_notes: ["ข้อเท็จจริงถาวรตอนนี้"],
    warnings: [],
    repair_queue: [],
    open_loops: [
      {
        question: "ใครคือคนร้ายตัวจริง",
        planted_at_beat: 2,
        expected_resolution: "future_episode",
      },
    ],
    ...overrides,
  };
}

const stubScript = { _draftSummary: { logline: "L", keyBeats: ["a", "b"] } };

describe("resolveBackfillEpisodeMemory", () => {
  it("returns null for a null script", () => {
    expect(resolveBackfillEpisodeMemory({ episodeNumber: 1, script: null })).toBeNull();
  });

  it("returns null for a _draftSummary stub (not a real script)", () => {
    expect(
      resolveBackfillEpisodeMemory({ episodeNumber: 1, script: stubScript })
    ).toBeNull();
  });

  it("returns null for a malformed/incomplete script object", () => {
    expect(
      resolveBackfillEpisodeMemory({ episodeNumber: 1, script: { foo: "bar" } })
    ).toBeNull();
  });

  it("resolves a real script into a VdEpisodeMemory with the enrichment resolveScriptEpisodeMemory provides", () => {
    const memory = resolveBackfillEpisodeMemory({
      episodeNumber: 3,
      script: realScript(),
    });
    expect(memory).not.toBeNull();
    expect(memory!.episodeNumber).toBe(3);
    expect(memory!.canonicalFacts).toContain("ข้อเท็จจริงถาวรตอนนี้");
    expect(memory!.threadsOpened).toEqual([
      {
        threadId: "script-open-loop-ep3-0",
        description: "ใครคือคนร้ายตัวจริง",
        threadClass: "plot",
        openedEpisode: 3,
      },
    ]);
    // The known, permanent limitation — never fabricated here.
    expect(memory!.relationshipChanges).toEqual([]);
  });
});

describe("isStoredMemoryUserEdited", () => {
  it("is false for null/undefined/non-object", () => {
    expect(isStoredMemoryUserEdited(null)).toBe(false);
    expect(isStoredMemoryUserEdited(undefined)).toBe(false);
    expect(isStoredMemoryUserEdited("string")).toBe(false);
  });

  it("is false when userEdited is absent or not exactly true", () => {
    expect(isStoredMemoryUserEdited({})).toBe(false);
    expect(isStoredMemoryUserEdited({ userEdited: "true" })).toBe(false);
  });

  it("is true only when userEdited === true", () => {
    expect(isStoredMemoryUserEdited({ userEdited: true })).toBe(true);
  });
});

describe("buildSeriesMemoryBackfillPreview", () => {
  const series = {
    id: 16,
    title: "คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ",
    tenantId: "tenant-a",
    userId: 1,
    memory: null as unknown,
  };

  it("no-op (skipReason 'no_real_script') for a series with no scripted episodes", () => {
    const episodes: VdSeriesMemoryBackfillEpisodeRow[] = [
      { episodeNumber: 1, script: null },
      { episodeNumber: 2, script: stubScript },
    ];
    const preview = buildSeriesMemoryBackfillPreview(series, episodes);
    expect(preview.skipReason).toBe("no_real_script");
    expect(preview.episodeMemoriesToWrite).toEqual([]);
    expect(preview.episodesWithRealScript).toBe(0);
    expect(preview.episodesWithNoScript).toBe(1);
    expect(preview.episodesWithStubOnly).toBe(1);
    expect(preview.relationshipCount).toBe(0);
  });

  it("skips a series whose stored memory.userEdited === true, without --force", () => {
    const preview = buildSeriesMemoryBackfillPreview(
      { ...series, memory: { userEdited: true } },
      [{ episodeNumber: 1, script: realScript() }]
    );
    expect(preview.skipReason).toBe("user_edited");
    expect(preview.episodeMemoriesToWrite).toEqual([]);
  });

  it("does NOT skip a userEdited series when force is passed", () => {
    const preview = buildSeriesMemoryBackfillPreview(
      { ...series, memory: { userEdited: true } },
      [{ episodeNumber: 1, script: realScript() }],
      { force: true }
    );
    expect(preview.skipReason).toBeNull();
    expect(preview.episodeMemoriesToWrite).toHaveLength(1);
  });

  it("builds episodeMemoriesToWrite + a folded preview matching foldSeriesMemory on the same input", () => {
    const episodes: VdSeriesMemoryBackfillEpisodeRow[] = [
      { episodeNumber: 1, script: realScript({ continuity_notes: ["fact one"] }) },
      {
        episodeNumber: 2,
        script: realScript({
          continuity_notes: ["fact two"],
          open_loops: [
            { question: "q2", planted_at_beat: 1, expected_resolution: "season" },
          ],
        }),
      },
      { episodeNumber: 3, script: stubScript }, // stub — excluded
    ];
    const preview = buildSeriesMemoryBackfillPreview(series, episodes);

    expect(preview.skipReason).toBeNull();
    expect(preview.totalEpisodes).toBe(3);
    expect(preview.episodesWithRealScript).toBe(2);
    expect(preview.episodesWithStubOnly).toBe(1);
    expect(preview.episodesWithNoScript).toBe(0);
    expect(preview.episodeMemoriesToWrite).toHaveLength(2);

    // The preview's folded facts must match an independent foldSeriesMemory
    // call over the exact same resolved episode memories.
    const expectedFold = foldSeriesMemory(preview.episodeMemoriesToWrite);
    expect(preview.canonicalFactCount).toBe(expectedFold.canonicalFacts.length);
    const expectedThreadCounts: Record<string, number> = {};
    for (const thread of expectedFold.openThreads) {
      expectedThreadCounts[thread.threadClass] =
        (expectedThreadCounts[thread.threadClass] ?? 0) + 1;
    }
    expect(preview.threadCountsByClass).toEqual(expectedThreadCounts);
    expect(preview.relationshipCount).toBe(expectedFold.relationships.length);
    expect(preview.relationshipCount).toBe(0);
    expect(preview.compactSummaryLength).toBeGreaterThan(0);
    expect(preview.relationshipLimitationNote).toBe(RELATIONSHIP_LIMITATION_NOTE);
  });

  it("truncates a long compactSummary preview with an ellipsis, keeping the full length separately reported", () => {
    const longContinuity = Array.from({ length: 80 }, (_, i) => `ยาวมาก ${i}`.repeat(10));
    const episodes: VdSeriesMemoryBackfillEpisodeRow[] = [
      { episodeNumber: 1, script: realScript({ continuity_notes: longContinuity }) },
    ];
    const preview = buildSeriesMemoryBackfillPreview(series, episodes);
    expect(preview.compactSummaryPreview.endsWith("…")).toBe(true);
    expect(preview.compactSummaryPreview.length).toBeLessThan(preview.compactSummaryLength);
  });
});

describe("formatSeriesMemoryBackfillTable", () => {
  it("renders a header + one pipe-delimited row per preview", () => {
    const table = formatSeriesMemoryBackfillTable([
      {
        seriesId: 16,
        title: "Title A",
        tenantId: "t",
        userId: 1,
        totalEpisodes: 20,
        episodesWithRealScript: 20,
        episodesWithStubOnly: 0,
        episodesWithNoScript: 0,
        episodeMemoriesToWrite: [],
        skipReason: null,
        threadCountsByClass: { plot: 20 },
        relationshipCount: 0,
        canonicalFactCount: 39,
        compactSummaryLength: 8327,
        compactSummaryPreview: "...",
        relationshipLimitationNote: RELATIONSHIP_LIMITATION_NOTE,
      },
    ]);
    expect(table).toContain("seriesId | title");
    expect(table).toContain("16 | Title A | 20 | 20 | 0 | 0 | 0 | - | 20 | 0 | 39 | 8327");
  });
});

describe("validateSeriesMemoryApplyPreconditions", () => {
  it("refuses when --backup is missing", () => {
    const error = validateSeriesMemoryApplyPreconditions({
      backupExists: false,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/--backup/);
  });

  it("refuses when the backup file does not exist on disk", () => {
    const error = validateSeriesMemoryApplyPreconditions({
      backupPath: "/tmp/does-not-exist.sql",
      backupExists: false,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/not found/);
  });

  it("refuses when the backup file is empty", () => {
    const error = validateSeriesMemoryApplyPreconditions({
      backupPath: "/tmp/empty.sql",
      backupExists: true,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/empty/);
  });

  it("passes (null) when a real, non-empty backup is present", () => {
    const error = validateSeriesMemoryApplyPreconditions({
      backupPath: "/tmp/backup.sql",
      backupExists: true,
      backupSizeBytes: 4096,
    });
    expect(error).toBeNull();
  });
});
