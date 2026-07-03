import { describe, expect, it } from "vitest";

import {
  getSecurityPinVersion,
  hashSecurityPin,
  isSecurityPinEnabled,
  isSecurityPinLocked,
  recordSecurityPinFailure,
  recordSecurityPinSuccess,
  verifySecurityPin,
} from "./securityPinService";

describe("securityPinService", () => {
  it("uses securityPin or Private Vault storage as compatibility source", () => {
    expect(isSecurityPinEnabled({ privateVault: { enabled: true, pinHash: "hash", pinVersion: 4 } })).toBe(true);
    expect(getSecurityPinVersion({ privateVault: { enabled: true, pinHash: "hash", pinVersion: 4 } })).toBe(4);
  });

  it("hashes and verifies PINs", async () => {
    const hash = await hashSecurityPin("123456");
    await expect(verifySecurityPin("123456", hash)).resolves.toBe(true);
    await expect(verifySecurityPin("000000", hash)).resolves.toBe(false);
  });

  it("rate-limits repeated failures and clears on success", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    let prefs: unknown = { securityPin: { enabled: true, pinHash: "hash", pinVersion: 1 } };
    for (let index = 0; index < 5; index += 1) {
      prefs = recordSecurityPinFailure(prefs, now);
    }
    expect(isSecurityPinLocked(prefs, now)).toBe(true);
    expect(recordSecurityPinSuccess(prefs).securityPin?.failedAttempts).toBe(0);
  });
});
