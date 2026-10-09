import { describe, expect, it } from "vitest";

import {
  createInitialAttentionState,
  NOTIFICATION_ATTENTION_TIMING,
  reduceNotificationAttention,
  type AttentionState,
  type AuthorizedNotificationSignal,
} from "./notificationAttention";

const signal = (
  key: string,
  version: number,
  options: Partial<AuthorizedNotificationSignal> = {}
): AuthorizedNotificationSignal => ({
  opaqueStableKey: key,
  trustedCategory: "general",
  trustedSeverity: "normal",
  version,
  scopeGeneration: 1,
  authorization: "verified",
  ...options,
});

const start = (scopeGeneration = 1): AttentionState =>
  createInitialAttentionState({ scopeGeneration, enabled: true });

const action = (
  state: AttentionState,
  next: Parameters<typeof reduceNotificationAttention>[1]
) => reduceNotificationAttention(state, next);

const baseline = (
  state: AttentionState,
  rows: AuthorizedNotificationSignal[] = []
) => action(state, { type: "BASELINE", signals: rows });

const live = (
  state: AttentionState,
  row: AuthorizedNotificationSignal,
  now: number,
  viewport: "desktop" | "mobile" = "desktop"
) =>
  action(state, {
    type: "NEW_NOTIFICATION",
    signal: row,
    source: "live",
    now,
    viewport,
  });

describe("notificationAttention reducer", () => {
  it("silently baselines historical rows and rejects baseline replay", () => {
    let state = start();
    state = baseline(state, [signal("old-a", 8), signal("old-b", 9)]);

    expect(state.status).toBe("QUIET");
    expect(state.episode).toBeNull();
    expect(state.deadlineAt).toBeNull();
    expect(live(state, signal("old-a", 10), 100).status).toBe("QUIET");
    expect(live(state, signal("new", 11), 101).status).toBe("COALESCING");
  });

  it("coalesces distinct rows into one bounded mobile episode", () => {
    let state = baseline(start());
    state = live(state, signal("row-a", 1), 1_000, "mobile");
    expect(state.status).toBe("COALESCING");
    expect(state.deadlineAt).toBe(3_000);
    state = live(state, signal("row-b", 2), 2_000, "mobile");
    expect(state.episode?.grouped).toBe(true);
    expect(state.deadlineAt).toBe(3_000);
    state = action(state, { type: "ADVANCE", now: 3_000 });
    expect(state.status).toBe("BALLOON_VISIBLE");
    expect(state.deadlineAt).toBe(6_000);
    state = action(state, { type: "ADVANCE", now: 6_000 });
    expect(state.status).toBe("COOLDOWN");
    expect(state.deadlineAt).toBe(66_000);
  });

  it("rejects duplicate, reordered, old-scope, unverified and reconnect signals", () => {
    let state = baseline(start(), [signal("already-seen", 10)]);
    state = live(state, signal("already-seen", 12), 20);
    expect(state.status).toBe("QUIET");

    state = live(state, signal("out-of-order", 9), 21);
    expect(state.status).toBe("QUIET");
    expect(state.seenKeys).toContain("out-of-order");

    state = action(state, {
      type: "NEW_NOTIFICATION",
      signal: signal("reconnect-row", 13),
      source: "reconnect",
      now: 22,
      viewport: "desktop",
    });
    expect(state.status).toBe("QUIET");
    expect(live(state, signal("reconnect-row", 14), 23).status).toBe("QUIET");

    state = live(state, signal("old-user-row", 15, { scopeGeneration: 0 }), 24);
    expect(state.status).toBe("QUIET");

    const unverified = {
      ...signal("untrusted", 16),
      trustedCategory: "not-a-category",
    } as unknown as AuthorizedNotificationSignal;
    state = live(state, unverified, 25);
    expect(state.status).toBe("QUIET");
  });

  it("enforces normal and trusted critical cooldowns independently", () => {
    let state = baseline(start());
    state = live(state, signal("normal-a", 1), 0);
    state = action(state, { type: "DISMISS", now: 2_000 });
    expect(state.normalCooldownUntil).toBe(62_000);

    state = live(state, signal("normal-b", 2), 10_000);
    expect(state.status).toBe("COOLDOWN");
    state = live(
      state,
      signal("critical-a", 3, {
        trustedCategory: "critical",
        trustedSeverity: "critical",
      }),
      10_001
    );
    expect(state.status).toBe("COALESCING");
    state = action(state, { type: "DISMISS", now: 12_001 });
    expect(state.criticalCooldownUntil).toBe(27_001);

    state = live(
      state,
      signal("critical-b", 4, {
        trustedCategory: "critical",
        trustedSeverity: "critical",
      }),
      20_000
    );
    expect(state.status).toBe("COOLDOWN");
    state = live(
      state,
      signal("critical-c", 5, {
        trustedCategory: "critical",
        trustedSeverity: "critical",
      }),
      27_001
    );
    expect(state.status).toBe("COALESCING");
  });

  it("pauses timeout while focused and dismisses on suspension without replay", () => {
    let state = baseline(start());
    state = live(state, signal("focused", 1), 0);
    state = action(state, {
      type: "ADVANCE",
      now: NOTIFICATION_ATTENTION_TIMING.coalesceMs,
    });
    state = action(state, {
      type: "SET_FOCUS_WITHIN_BALLOON",
      focused: true,
      now: 2_500,
    });
    expect(state.deadlineAt).toBeNull();
    state = action(state, { type: "ADVANCE", now: 90_000 });
    expect(state.status).toBe("BALLOON_VISIBLE");
    state = action(state, {
      type: "SET_FOCUS_WITHIN_BALLOON",
      focused: false,
      now: 90_000,
    });
    expect(state.deadlineAt).toBe(94_500);

    state = action(state, { type: "SUSPEND", now: 91_000 });
    expect(state.status).toBe("SUSPENDED");
    expect(state.episode).toBeNull();
    state = action(state, { type: "SET_VISIBLE", visible: true, now: 91_500 });
    expect(state.status).toBe("COOLDOWN");
    expect(live(state, signal("focused", 2), 91_600).episode).toBeNull();
  });

  it("resets identity state on scope change and requires a fresh scoped baseline", () => {
    let state = baseline(start(), [signal("same-row-id", 20)]);
    state = live(state, signal("old-arrival", 21), 100);
    state = action(state, { type: "DISMISS", now: 2_100 });
    expect(state.normalCooldownUntil).toBe(62_100);

    state = action(state, { type: "SET_SCOPE", scopeGeneration: 2, now: 3_000 });
    expect(state.scopeGeneration).toBe(2);
    expect(state.status).toBe("INITIALIZING");
    expect(state.baselineComplete).toBe(false);
    expect(state.seenKeys).toEqual([]);
    expect(state.latestVersion).toBe(-1);
    expect(state.normalCooldownUntil).toBe(0);
    expect(state.criticalCooldownUntil).toBe(0);

    // An arrival from the prior scope is stale, and even a current-scope
    // arrival is ignored until the new identity's history is baselined.
    expect(live(state, signal("old-arrival", 22), 3_001).status).toBe("INITIALIZING");
    state = live(
      state,
      signal("same-row-id", 0, { scopeGeneration: 2 }),
      3_002,
    );
    expect(state.status).toBe("INITIALIZING");

    state = baseline(state, [signal("same-row-id", 0, { scopeGeneration: 2 })]);
    expect(state.status).toBe("QUIET");
    expect(
      live(state, signal("same-row-id", 1, { scopeGeneration: 1 }), 3_003).status,
    ).toBe("QUIET");
    expect(
      live(state, signal("same-row-id", 1, { scopeGeneration: 2 }), 3_004).status,
    ).toBe("QUIET");
    expect(
      live(state, signal("new-scope-row", 1, { scopeGeneration: 2 }), 3_005).status,
    ).toBe("COALESCING");
  });

  it("ignores stale or repeated scope generations", () => {
    const state = baseline(start(), [signal("seen", 1)]);
    expect(action(state, { type: "SET_SCOPE", scopeGeneration: 1, now: 2 })).toBe(state);
    expect(action(state, { type: "SET_SCOPE", scopeGeneration: 0, now: 3 })).toBe(state);
  });

  it("fails closed at its bounded seen-key ceiling", () => {
    let state = baseline(start());
    for (
      let index = 0;
      index < NOTIFICATION_ATTENTION_TIMING.maxSeenKeys;
      index += 1
    ) {
      state = live(state, signal(`row-${index}`, index + 1), index * 3_000);
      if (state.episode)
        state = action(state, { type: "DISMISS", now: index * 3_000 + 1 });
      state = action(state, { type: "ADVANCE", now: index * 3_000 + 61_001 });
    }
    const before = state.seenKeys.length;
    state = live(state, signal("overflow", 10_000), 1_000_000);
    expect(state.seenKeys).toHaveLength(before);
    expect(state.status).toBe("QUIET");
  });
});
