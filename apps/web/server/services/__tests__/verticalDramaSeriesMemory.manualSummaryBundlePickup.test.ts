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
        payload: { source: "manual", episodeNumber: 3, fact: "Aria is CFO of Vantor Group" },
        summaryText: "Aria is CFO of Vantor Group",
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "hook_opened",
        payload: { source: "manual", episodeNumber: 3, hookId: "h_clinic", hook: "sister's clinic funding" },
        summaryText: "sister's clinic funding",
      }),
      manualEvent({
        memoryEventId: "3",
        memoryKind: "continuity_warning",
        payload: { source: "manual", episodeNumber: 3, warning: "wardrobe drift" },
        summaryText: "wardrobe drift",
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 4);

    expect(bundle.canonicalFacts).toContain("Aria is CFO of Vantor Group");
    expect(bundle.unresolvedHooks).toContain("sister's clinic funding");
    expect(bundle.continuityWarnings).toContain("wardrobe drift");
  });

  it("projects only the latest manual re-summarize revision for an episode", () => {
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

    // Storage remains append-only, while the prompt projection uses only the
    // current source revision for this episode.
    expect(bundle.episodeSummaries.map((s) => s.summary)).toEqual([
      "Re-summarized version",
    ]);
  });

  it("uses approved facts from prior episodes only and omits current, future, and unapproved events", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: "accepted prior fact" },
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: "unapproved prior fact" },
        approved: false,
      }),
      manualEvent({
        memoryEventId: "3",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 2, fact: "current episode fact" },
      }),
      manualEvent({
        memoryEventId: "4",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 3, fact: "future episode fact" },
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 2);

    expect(bundle.canonicalFacts).toEqual(["accepted prior fact"]);
  });

  it("omits malformed memory values instead of coercing objects into prompt facts", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: { invented: "value" } },
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "hook_opened",
        payload: { episodeNumber: 1, hookId: { invalid: true }, hook: { invalid: true } },
      }),
      manualEvent({
        memoryEventId: "3",
        memoryKind: "continuity_warning",
        payload: { episodeNumber: 1, warning: { invalid: true } },
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 2);

    expect(bundle.canonicalFacts).toEqual([]);
    expect(bundle.unresolvedHooks).toEqual([]);
    expect(bundle.continuityWarnings).toEqual([]);
  });

  it("drops superseded source-episode memory from the prompt projection", () => {
    const events: VerticalDramaMemoryEvent[] = [
      manualEvent({
        memoryEventId: "1",
        memoryKind: "episode_summary",
        payload: { episodeNumber: 1, summary: "old approved recap" },
        summaryText: "old approved recap",
        createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
      }),
      manualEvent({
        memoryEventId: "2",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: "old accepted wardrobe" },
        createdAt: new Date("2026-07-07T00:01:00.000Z").toISOString(),
      }),
      manualEvent({
        memoryEventId: "3",
        memoryKind: "episode_summary",
        payload: { episodeNumber: 1, summary: "revised approved recap" },
        summaryText: "revised approved recap",
        createdAt: new Date("2026-07-07T01:00:00.000Z").toISOString(),
      }),
      manualEvent({
        memoryEventId: "4",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: "revised accepted wardrobe" },
        createdAt: new Date("2026-07-07T01:01:00.000Z").toISOString(),
      }),
    ];

    const bundle = buildEpisodeMemoryBundle(events, 2);

    expect(bundle.episodeSummaries.map(summary => summary.summary)).toEqual([
      "revised approved recap",
    ]);
    expect(bundle.canonicalFacts).toEqual(["revised accepted wardrobe"]);
  });

  it("does not expose a rejected or unapproved proposal through compacted prompt memory", () => {
    const accepted = Array.from({ length: 41 }, (_, index) =>
      manualEvent({
        memoryEventId: String(index + 1),
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: `accepted fact ${index + 1}` },
        createdAt: new Date(Date.UTC(2026, 6, 7, 0, index)).toISOString(),
      }),
    );
    accepted.push(
      manualEvent({
        memoryEventId: "42",
        memoryKind: "retcon_proposal",
        payload: { episodeNumber: 1, proposedFact: "unapproved retcon secret" },
        approved: false,
      }),
      manualEvent({
        memoryEventId: "43",
        memoryKind: "canonical_fact",
        payload: { episodeNumber: 1, fact: { hidden: "malformed memory" } },
      }),
    );

    const bundle = buildEpisodeMemoryBundle(accepted, 2);

    expect(bundle.usedCompaction).toBe(true);
    expect(bundle.compactedMemoryText).not.toContain("unapproved retcon secret");
    expect(bundle.compactedMemoryText).not.toContain("malformed memory");
  });
});
