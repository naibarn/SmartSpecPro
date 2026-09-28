import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeHeadRows: [] as Array<{ bundleHash: string }>,
}));

vi.mock("../../../db", () => ({
  getDb: () => {
    const limit = vi.fn().mockResolvedValue(mocks.activeHeadRows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    return { select: vi.fn().mockReturnValue({ from }) };
  },
}));

import { getInferenceChatRolloutState } from "../rolloutBundle";

describe("Spec 231 primary Chat rollout gate", () => {
  beforeEach(() => {
    mocks.activeHeadRows = [];
    vi.stubEnv("INFERENCE_ROLLOUT_KEYS_JSON", "");
    vi.stubEnv("INFERENCE_ROLLOUT_ACTIVE_KEY_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("distinguishes an intentionally unactivated platform slot", async () => {
    await expect(getInferenceChatRolloutState()).resolves.toEqual({
      state: "no_active_bundle",
    });
  });

  it("blocks a present active head when its verification keyring is unavailable", async () => {
    mocks.activeHeadRows = [{ bundleHash: `sha256:${"a".repeat(64)}` }];
    await expect(getInferenceChatRolloutState()).resolves.toMatchObject({
      state: "active_bundle_invalid",
      reason: "KEYRING_MISSING",
    });
  });
});
