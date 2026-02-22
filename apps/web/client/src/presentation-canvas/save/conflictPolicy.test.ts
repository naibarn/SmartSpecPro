import { describe, expect, it } from "vitest";

import {
  createConflictPolicyState,
  normalizeConflictPolicy,
  registerConflict,
  registerSaveSuccess,
  releaseStaleBlock,
  shouldBlockSaveAttempt,
} from "./conflictPolicy";

describe("conflictPolicy", () => {
  it("enters cooldown on first conflict and blocks autosave immediately", () => {
    const now = 1_000;
    const initial = createConflictPolicyState();
    const next = registerConflict(initial, now, 500);

    expect(next.phase).toBe("cooldown");
    expect(next.conflictCount).toBe(1);
    expect(shouldBlockSaveAttempt(next, "autosave", now + 100)).toBe("cooldown");
    expect(shouldBlockSaveAttempt(next, "manual", now + 100)).toBeNull();
  });

  it("moves from cooldown to normal after cooldown expires", () => {
    const now = 1_000;
    const afterConflict = registerConflict(createConflictPolicyState(), now, 500);
    const normalized = normalizeConflictPolicy(afterConflict, now + 500);

    expect(normalized.phase).toBe("normal");
    expect(shouldBlockSaveAttempt(normalized, "autosave", now + 500)).toBeNull();
  });

  it("enters stale-blocked mode after repeated conflicts", () => {
    const now = 1_000;
    const first = registerConflict(createConflictPolicyState(), now, 500);
    const second = registerConflict(first, now + 600, 500);

    expect(second.phase).toBe("stale_blocked");
    expect(shouldBlockSaveAttempt(second, "autosave", now + 700)).toBe("stale_blocked");
    expect(shouldBlockSaveAttempt(second, "manual", now + 700)).toBe("stale_blocked");
  });

  it("resets stale block and conflict counters on explicit release or save success", () => {
    const now = 1_000;
    const stale = registerConflict(
      registerConflict(createConflictPolicyState(), now, 500),
      now + 600,
      500,
    );

    expect(releaseStaleBlock()).toEqual(createConflictPolicyState());
    expect(registerSaveSuccess()).toEqual(createConflictPolicyState());
    expect(stale.phase).toBe("stale_blocked");
  });
});
