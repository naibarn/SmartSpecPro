import { describe, expect, it } from "vitest";
import {
  buildSituationDigest,
  classifyFeedFreshness,
  coalesceWeatherSlots,
  compareFeedMaterialChange,
  rankSituationFeedCandidates,
} from "./feedSemantics";

const NOW = "2026-10-01T12:00:00.000Z";

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: "feed-1",
  threadId: "thread-1",
  factClass: "OBSERVATION" as const,
  safetyPriority: 50,
  authority: "VERIFIED" as const,
  sourceQuality: 60,
  spatialRelation: "IN_VIEWPORT" as const,
  materiality: 50,
  operationalRelevance: 50,
  freshness: "FRESH" as const,
  observedAt: "2026-10-01T11:55:00.000Z",
  ...overrides,
});

describe("feed semantics", () => {
  it("orders fixed inputs deterministically and exposes the reasons instead of an opaque rank", () => {
    const input = [
      candidate({ id: "later", threadId: "later", safetyPriority: 60, relevanceReasons: ["FOCUS_MATCH"] }),
      candidate({ id: "first", threadId: "first", safetyPriority: 60, relevanceReasons: ["FOCUS_MATCH"] }),
    ];

    const first = rankSituationFeedCandidates(input);
    expect(first.map(item => item.id)).toEqual(["first", "later"]);
    expect(first[0]).toMatchObject({ policyVersion: "spec262-feed-v1", reasons: expect.arrayContaining(["SAFETY_PRIORITY", "FOCUS_MATCH"]) });
    expect(rankSituationFeedCandidates([...input].reverse())).toEqual(first);
  });

  it("never lets sponsorship demote a critical official warning", () => {
    const ranked = rankSituationFeedCandidates([
      candidate({ id: "sponsored", safetyPriority: 99, sponsored: true, sourceQuality: 100 }),
      candidate({ id: "official", factClass: "OFFICIAL_ALERT", safetyPriority: 100, authority: "OFFICIAL", sourceQuality: 1, freshness: "STALE" }),
    ]);

    expect(ranked.map(item => item.id)).toEqual(["official", "sponsored"]);
    expect(ranked[0].reasons).toContain("CRITICAL_OFFICIAL_ALERT");
  });

  it("classifies age and validity from source times without treating a recent fetch as a recent observation", () => {
    expect(classifyFeedFreshness({ now: NOW, observedAt: "2026-10-01T11:50:00.000Z", maximumAgeMinutes: 15 })).toBe("FRESH");
    expect(classifyFeedFreshness({ now: NOW, observedAt: "2026-10-01T08:00:00.000Z", fetchedAt: NOW, maximumAgeMinutes: 15 })).toBe("STALE");
    expect(classifyFeedFreshness({ now: NOW, validUntil: "2026-10-01T11:00:00.000Z" })).toBe("EXPIRED");
    expect(classifyFeedFreshness({ now: NOW })).toBe("UNKNOWN");
  });

  it("updates a stable thread only for a material fingerprint change and coalesces unchanged evening/night weather", () => {
    const previous = candidate({ materialFingerprint: "rain:20-30" });
    expect(compareFeedMaterialChange(previous, { ...previous, observedAt: NOW })).toEqual({ changed: false, reason: "UNCHANGED" });
    expect(compareFeedMaterialChange(previous, { ...previous, materialFingerprint: "rain:60-80" })).toEqual({ changed: true, reason: "MATERIAL_FINGERPRINT_CHANGED" });

    expect(coalesceWeatherSlots([
      { slot: "THIS_EVENING", fingerprint: "rain:20-30", id: "evening" },
      { slot: "TONIGHT", fingerprint: "rain:20-30", id: "night" },
      { slot: "TOMORROW", fingerprint: "rain:60-80", id: "tomorrow" },
    ])).toEqual([
      { slot: "THIS_EVENING", fingerprint: "rain:20-30", id: "evening" },
      { slot: "TOMORROW", fingerprint: "rain:60-80", id: "tomorrow" },
    ]);
  });

  it("keeps every critical official alert when digest budget truncates ordinary items", () => {
    const items = [
      candidate({ id: "warning-a", factClass: "OFFICIAL_ALERT", safetyPriority: 100, authority: "OFFICIAL" }),
      candidate({ id: "warning-b", factClass: "OFFICIAL_ALERT", safetyPriority: 100, authority: "OFFICIAL" }),
      ...Array.from({ length: 7 }, (_, index) => candidate({ id: `ordinary-${index}`, threadId: `ordinary-${index}`, safetyPriority: 20 })),
    ];
    const digest = buildSituationDigest(rankSituationFeedCandidates(items), { budget: 5 });

    expect(digest.items.map(item => item.id)).toEqual(["warning-a", "warning-b", "ordinary-0", "ordinary-1", "ordinary-2"]);
    expect(digest.truncated).toBe(true);
  });
});
