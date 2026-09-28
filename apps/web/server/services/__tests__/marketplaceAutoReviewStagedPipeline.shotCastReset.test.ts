import { describe, expect, it } from "vitest";

import { resolveShotCastSelectionFromMetadata } from "../marketplaceAutoReviewStagedPipelineService";

/**
 * `planning/marketplace-four-character-cast/plan.md` — precedence and staleness
 * around per-shot cast.
 *
 * Two hazards this pins:
 *
 * 1. **State wins over plan.** A user who removes someone from a shot must not
 *    have the story planner put them back on the next compile. Vertical Drama
 *    uses the same precedence (`frame.requiredCharacterRefs` overrides the
 *    storyboard's own list).
 * 2. **Absent means everyone.** Every pre-existing run has no `castInShot` at
 *    all; reading that as "nobody" would strip the cast out of live runs.
 */
describe("resolveShotCastSelectionFromMetadata", () => {
  const plan = {
    shots: [
      { shotId: 1, castInShot: ["cast-1", "cast-2"] },
      { shotId: 2, castInShot: ["cast-1", "cast-2", "cast-3"] },
    ],
  };

  it("prefers the STATE shot's castInShot — the user's own edit wins", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: {
        stagedSequentialStoryboard: {
          shots: [{ shotId: 2, castInShot: ["cast-1"] }],
        },
      },
      plan,
      shotId: 2,
    });
    expect(resolved.castInShot).toEqual(["cast-1"]);
  });

  it("falls back to the PLAN shot when the state has no override", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: { stagedSequentialStoryboard: { shots: [{ shotId: 2 }] } },
      plan,
      shotId: 2,
    });
    expect(resolved.castInShot).toEqual(["cast-1", "cast-2", "cast-3"]);
  });

  it("returns undefined (= everyone) when neither side says anything", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: {},
      plan: { shots: [] },
      shotId: 1,
    });
    expect(resolved.castInShot).toBeUndefined();
    expect(resolved.castLooks).toBeUndefined();
  });

  it("reads castLooks from the state shot only", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: {
        stagedSequentialStoryboard: {
          shots: [
            {
              shotId: 1,
              castLooks: { "cast-1": { url: "https://cdn.test/casual.png" } },
            },
          ],
        },
      },
      plan,
      shotId: 1,
    });
    expect(resolved.castLooks).toEqual({
      "cast-1": { url: "https://cdn.test/casual.png" },
    });
  });

  it("ignores a malformed castLooks value rather than throwing", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: {
        stagedSequentialStoryboard: {
          shots: [{ shotId: 1, castLooks: ["not", "an", "object"] }],
        },
      },
      plan,
      shotId: 1,
    });
    expect(resolved.castLooks).toBeUndefined();
  });

  it("tolerates string shotIds on either side (jsonb round-trips are untyped)", () => {
    const resolved = resolveShotCastSelectionFromMetadata({
      metadata: {
        stagedSequentialStoryboard: {
          shots: [{ shotId: "2", castInShot: ["cast-4"] }],
        },
      },
      plan: { shots: [{ shotId: "2" as any, castInShot: ["cast-1"] }] },
      shotId: 2,
    });
    expect(resolved.castInShot).toEqual(["cast-4"]);
  });
});
