/**
 * Read-path coverage: memory events appended via the MANUAL
 * `summarizeEpisodeToMemory` router mutation (`payload.source === "manual"`)
 * are picked up by `buildEpisodeMemoryBundle` exactly like events appended via
 * the pipeline-run `approveCheckpoint`/`approveRunCheckpoint` path — the
 * bundle builder has no special-casing on `source`, so this is really a
 * regression guard: it fails loudly if that ever changes.
 *
 * Uses `buildEpisodeMemoryBundle`'s pure (DB-free) form directly, exactly as
 * the sibling `verticalDramaSeriesMemory.ts` pure-function tests would.
 */
import { describe, expect, it } from "vitest";
import { buildEpisodeMemoryBundle } from "../verticalDramaSeriesMemory";
import type { VerticalDramaMemoryEvent } from "@shared/verticalDramaSeries";

function manualEvent(
  over: Partial<VerticalDramaMemoryEvent> & Pick<VerticalDramaMemoryEvent, "memoryKind">,
): VerticalDramaMemoryEvent {
  return {
    memoryEventId: over.memoryEventId ?? "1",
    seriesId: "10",
    episodeId: "100",
    payload: { source: "manual" },
    approved: true,
    approvedByUserId: "42",
    createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    ...over,
  };
}

describe("buildEpisodeMemoryBundle — manual summarizeEpisodeToMemory events are picked up", () => {
  it("includes a manually-appended episode_summary in the last-N episode summaries", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "episode_summary",
        payload: {
          source: "manual",
          episodeNumber: 3,
          summary: "Episode 3: Aria uncovers the hidden clause.",
        },
        summaryText: "Episode 3: Aria uncovers the hidden clause.",
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 4);

    expect(bundle.episodeSummaries).toHaveLength(1);
    expect(bundle.episodeSummaries[0].summary).toBe(
      "Episode 3: Aria uncovers the hidden clause.",
    );
    expect(bundle.episodeSummaries[0].episodeNumber).toBe(3);
  });

  it("includes manually-appended canonical facts, hooks, and continuity warnings", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "canonical_fact",
        payload: { source: "manual", fact: "Aria is CFO of Vantor Group" },
        summaryText: "Aria is CFO of Vantor Group",
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "hook_opened",
        payload: { source: "manual", hookId: "h_clinic", hook: "sister's clinic funding" },
        summaryText: "sister's clinic funding",
      }),
      manualEvent({
        memoryEventId: "3",
        memoryKind: "continuity_warning",
        payload: { source: "manual", warning: "wardrobe drift" },
        summaryText: "wardrobe drift",
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 4);

    expect(bundle.canonicalFacts).toContain("Aria is CFO of Vantor Group");
    expect(bundle.unresolvedHooks).toContain("sister's clinic funding");
    expect(bundle.continuityWarnings).toContain("wardrobe drift");
  });

  it("a later manual re-summarize (force) event wins in the last-N summaries without deleting the prior one", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "episode_summary",
        payload: { source: "manual", episodeNumber: 3, summary: "First summary" },
        summaryText: "First summary",
        createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "episode_summary",
        payload: { source: "manual", episodeNumber: 3, summary: "Re-summarized version" },
        summaryText: "Re-summarized version",
        createdAt: new Date("2026-07-07T01:00:00.000Z").toISOString(),
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 4);

    // Append-only: BOTH events remain visible in the projection (last-N
    // summaries includes every episode_summary event, ordered chronologically
    // — neither is deleted or mutated).
    expect(bundle.episodeSummaries.map((s) => s.summary)).toEqual([
      "First summary",
      "Re-summarized version",
    ]);
  });
});
