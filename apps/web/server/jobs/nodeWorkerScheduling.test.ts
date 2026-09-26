import { describe, expect, it } from "vitest";

import {
  selectFairNodeWorkerTask,
  shouldDispatchNextNodeWorkerTask,
} from "./nodeWorkerScheduling";

describe("node worker scheduling", () => {
  it("admits task four after the fairness wait even while three remain active", () => {
    expect(shouldDispatchNextNodeWorkerTask({
      activeCount: 3,
      lastDispatchAt: 1_000,
      now: 3_000,
      hasQueuedWork: true,
    })).toBe(true);
  });

  it("does not dispatch the fourth task before the fairness window", () => {
    expect(shouldDispatchNextNodeWorkerTask({
      activeCount: 3,
      lastDispatchAt: 1_000,
      now: 2_999,
      hasQueuedWork: true,
    })).toBe(false);
  });

  it("keeps filling the initial window immediately", () => {
    expect(shouldDispatchNextNodeWorkerTask({
      activeCount: 2,
      lastDispatchAt: 2_900,
      now: 2_901,
      hasQueuedWork: true,
    })).toBe(true);
  });

  it("prefers a user not currently occupying the active set", () => {
    expect(selectFairNodeWorkerTask([
      { id: "same-user-old", userKey: "user-1" },
      { id: "other-user", userKey: "user-2" },
    ], new Set(["user-1"]))).toMatchObject({ id: "other-user" });
  });

  it("continues admitting tasks beyond the initial window", () => {
    expect(shouldDispatchNextNodeWorkerTask({
      activeCount: 20,
      lastDispatchAt: 1_000,
      now: 3_000,
      hasQueuedWork: true,
    })).toBe(true);
  });

  it("does not dispatch without queued work", () => {
    expect(shouldDispatchNextNodeWorkerTask({
      activeCount: 0,
      lastDispatchAt: null,
      now: 3_000,
      hasQueuedWork: false,
    })).toBe(false);
  });
});
