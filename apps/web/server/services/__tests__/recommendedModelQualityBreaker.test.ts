/**
 * Quality circuit breaker for the recommended model set (2026-07-24).
 * Pure window/threshold math + attribution classifier + DB-less no-op path.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  RECOMMENDED_MODEL_STRIKE_THRESHOLD,
  RECOMMENDED_MODEL_STRIKE_WINDOW_MS,
  computeNextRecommendedStrikeState,
  isRecommendedModelQualityStrikeStatus,
  recordRecommendedModelQualityStrike,
} from "../recommendedModelQualityBreaker";

describe("isRecommendedModelQualityStrikeStatus — attribution boundary", () => {
  it("counts only model-attributable output failures", () => {
    expect(isRecommendedModelQualityStrikeStatus("contract_violation")).toBe(true);
    expect(isRecommendedModelQualityStrikeStatus("disqualified")).toBe(true);
  });

  it("NEVER counts transport/ledger/balance failures or successes", () => {
    expect(isRecommendedModelQualityStrikeStatus("invocation_failed")).toBe(false);
    expect(isRecommendedModelQualityStrikeStatus("completed")).toBe(false);
    expect(isRecommendedModelQualityStrikeStatus("")).toBe(false);
  });
});

describe("computeNextRecommendedStrikeState — sliding window", () => {
  const now = new Date("2026-07-24T10:00:00Z");

  it("starts a fresh window at 1 when none exists", () => {
    const next = computeNextRecommendedStrikeState({
      currentCount: 0,
      windowStartedAt: null,
      now,
    });
    expect(next.nextCount).toBe(1);
    expect(next.nextWindowStartedAt).toEqual(now);
    expect(next.thresholdCrossed).toBe(false);
  });

  it("increments inside the window and keeps the window start", () => {
    const start = new Date(now.getTime() - 60_000);
    const next = computeNextRecommendedStrikeState({
      currentCount: 2,
      windowStartedAt: start,
      now,
    });
    expect(next.nextCount).toBe(3);
    expect(next.nextWindowStartedAt).toEqual(start);
  });

  it("resets to 1 when the window has expired", () => {
    const start = new Date(
      now.getTime() - RECOMMENDED_MODEL_STRIKE_WINDOW_MS - 1
    );
    const next = computeNextRecommendedStrikeState({
      currentCount: 5,
      windowStartedAt: start,
      now,
    });
    expect(next.nextCount).toBe(1);
    expect(next.nextWindowStartedAt).toEqual(now);
    expect(next.thresholdCrossed).toBe(false);
  });

  it("crosses the threshold at the configured strike count", () => {
    const start = new Date(now.getTime() - 60_000);
    const next = computeNextRecommendedStrikeState({
      currentCount: RECOMMENDED_MODEL_STRIKE_THRESHOLD - 1,
      windowStartedAt: start,
      now,
    });
    expect(next.thresholdCrossed).toBe(true);
  });
});

describe("recordRecommendedModelQualityStrike — safety envelope", () => {
  it("no-ops without a db and never throws", async () => {
    const result = await recordRecommendedModelQualityStrike({
      modelId: "some/model",
      runId: "mar_x",
      reason: "contract_violation",
    });
    expect(result).toEqual({ recorded: false, revoked: false, strikeCount: 0 });
  });

  it("no-ops on an empty model id", async () => {
    const result = await recordRecommendedModelQualityStrike({
      modelId: "",
      reason: "disqualified",
    });
    expect(result.recorded).toBe(false);
  });
});
