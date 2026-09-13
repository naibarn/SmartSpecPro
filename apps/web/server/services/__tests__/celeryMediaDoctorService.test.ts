import { describe, expect, it } from "vitest";
import {
  CELERY_MEDIA_MAX_IN_FLIGHT_PER_USER,
  deriveQueueUserState,
} from "../celeryMediaDoctorService";

describe("celeryMediaDoctorService queue classification", () => {
  const base = {
    pendingCount: 0,
    processingCount: 0,
    claimedPendingCount: 0,
    unclaimedPendingCount: 0,
    oldUnclaimedPendingCount: 0,
  };

  it("does not classify normal backlog as stale when all three slots are in flight", () => {
    const state = deriveQueueUserState({
      ...base,
      pendingCount: 7,
      processingCount: 3,
      unclaimedPendingCount: 7,
      oldUnclaimedPendingCount: 7,
    });

    expect(CELERY_MEDIA_MAX_IN_FLIGHT_PER_USER).toBe(3);
    expect(state.inFlightCount).toBe(3);
    expect(state.stalePendingCount).toBe(0);
    expect(state.dispatchableStaleCount).toBe(0);
  });

  it("classifies old unclaimed work when a user has an available slot", () => {
    const state = deriveQueueUserState({
      ...base,
      pendingCount: 2,
      processingCount: 2,
      unclaimedPendingCount: 2,
      oldUnclaimedPendingCount: 1,
    });

    expect(state.inFlightCount).toBe(2);
    expect(state.stalePendingCount).toBe(1);
    expect(state.dispatchableStaleCount).toBe(1);
  });

  it("does not classify claimed pending work as a dispatch stall", () => {
    const state = deriveQueueUserState({
      ...base,
      pendingCount: 1,
      claimedPendingCount: 1,
    });

    expect(state.inFlightCount).toBe(1);
    expect(state.stalePendingCount).toBe(0);
  });

  it("ignores fresh unclaimed work", () => {
    const state = deriveQueueUserState({
      ...base,
      pendingCount: 1,
      unclaimedPendingCount: 1,
    });

    expect(state.stalePendingCount).toBe(0);
  });
});
