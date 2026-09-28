import { describe, expect, it } from "vitest";
import {
  CREDITS_PER_USD,
  mapResolutionToPresentation,
  normalizeContextSourceId,
  normalizePersistedCreditSourceType,
  creditsToUsdEstimate,
} from "./creditContextContracts";

describe("credit context contracts", () => {
  it("keeps service aliases separate from persisted source values", () => {
    expect(normalizePersistedCreditSourceType("vision_analysis")).toBe("other");
    expect(normalizePersistedCreditSourceType("skill")).toBe("skill");
    expect(normalizePersistedCreditSourceType("not-a-source")).toBeNull();
  });

  it("normalizes safe source ids and rejects control/oversized values", () => {
    expect(normalizeContextSourceId(42)).toBe("42");
    expect(() => normalizeContextSourceId("bad\nsource")).toThrow();
    expect(() => normalizeContextSourceId("x".repeat(192))).toThrow();
  });

  it("maps resolver states to safe presentation states", () => {
    expect(mapResolutionToPresentation("resolved")).toBe("linked");
    expect(mapResolutionToPresentation("historical_resolved")).toBe("linked");
    expect(mapResolutionToPresentation("archived")).toBe("linked");
    expect(mapResolutionToPresentation("partial")).toBe("partial");
    expect(mapResolutionToPresentation("ambiguous")).toBe("ambiguous");
    expect(mapResolutionToPresentation("unresolved")).toBe("unattributed");
  });

  it("uses the product cost estimate of 1000 credits per USD", () => {
    expect(CREDITS_PER_USD).toBe(1000);
    expect(creditsToUsdEstimate(1250)).toBe(1.25);
  });
});
