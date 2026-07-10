/**
 * Feature 132 §5.3 (F132B, ledgers-and-story-state) coverage:
 * `deriveStoryStateForEpisode` + `buildEpisodeMemoryBundle`'s flag-gated
 * `storyState` field. Mirrors `verticalDramaSeriesMemory.bundleItem9.test.ts`'s
 * pure (DB-free) style.
 */
import { describe, expect, it } from "vitest";
import {
  buildEpisodeMemoryBundle,
  deriveStoryStateForEpisode,
} from "../verticalDramaSeriesMemory";
import type { VerticalDramaMemoryEvent } from "@shared/verticalDramaSeries";

function event(
  over: Partial<VerticalDramaMemoryEvent> & Pick<VerticalDramaMemoryEvent, "memoryKind">,
): VerticalDramaMemoryEvent {
  return {
    memoryEventId: over.memoryEventId ?? "1",
    seriesId: "10",
    episodeId: "100",
    payload: {},
    createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    ...over,
  };
}

function storyStateEvent(memoryEventId: string, episode: number, over: Record<string, unknown> = {}) {
  return event({
    memoryEventId,
    memoryKind: "story_state",
    payload: {
      storyState: {
        episode,
        knownByProtagonist: [],
        knownByAudience: [],
        knownOnlyByAntagonist: [],
        evidenceGained: [],
        evidenceLostOrDamaged: [],
        trustChanges: [],
        emotionalResidue: [],
        threatLevel: 2,
        unresolvedThreadIds: [],
        requiredNextEpisodeResponse: `respond to episode ${episode}`,
        ...over,
      },
    },
  });
}

describe("deriveStoryStateForEpisode (pure)", () => {
  it("returns undefined for an empty event list", () => {
    expect(deriveStoryStateForEpisode([], 5)).toBeUndefined();
  });

  it("returns the highest-episode state <= the target episode (never a future one)", () => {
    const events = [storyStateEvent("1", 3), storyStateEvent("2", 5)];
    expect(deriveStoryStateForEpisode(events, 5)?.episode).toBe(5);
    expect(deriveStoryStateForEpisode(events, 4)?.episode).toBe(3);
  });

  it("skips a malformed story_state payload without throwing", () => {
    const malformed = event({ memoryKind: "story_state", payload: { storyState: { episode: "not-a-number" } } });
    expect(deriveStoryStateForEpisode([malformed], 5)).toBeUndefined();
  });
});

describe("buildEpisodeMemoryBundle — storyState flag gating (F132B)", () => {
  it("omits storyState entirely when ledgersEnabled is absent/false, even with story_state events present", () => {
    const events = [storyStateEvent("1", 3)];
    const bundle = buildEpisodeMemoryBundle(events, 5);
    expect(bundle.storyState).toBeUndefined();
    expect("storyState" in bundle).toBe(false);
  });

  it("includes storyState when ledgersEnabled is true and a matching event exists", () => {
    const events = [storyStateEvent("1", 3), storyStateEvent("2", 5)];
    const bundle = buildEpisodeMemoryBundle(events, 5, undefined, { ledgersEnabled: true });
    expect(bundle.storyState?.episode).toBe(5);
  });

  it("omits storyState when ledgersEnabled is true but no story_state event exists yet", () => {
    const bundle = buildEpisodeMemoryBundle([], 5, undefined, { ledgersEnabled: true });
    expect(bundle.storyState).toBeUndefined();
  });
});
