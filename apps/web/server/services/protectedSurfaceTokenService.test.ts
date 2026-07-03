import { describe, expect, it } from "vitest";

import {
  getPolicyDayKey,
  issueProtectedSurfaceToken,
  validateProtectedSurfaceToken,
} from "./protectedSurfaceTokenService";

describe("protectedSurfaceTokenService", () => {
  const now = new Date("2026-07-02T12:00:00.000Z");
  const base = {
    userId: 7,
    tenantId: "tenant-1",
    pinVersion: 2,
    profileVersion: 3,
    policyVersion: "policy-1",
    jurisdictionPresetId: "US_COPPA_DEFAULT",
    dayKey: getPolicyDayKey(now),
  };

  it("issues and validates scoped protected-surface tokens", async () => {
    const token = issueProtectedSurfaceToken({
      ...base,
      scopes: ["age-policy:temporary-adult"],
    });
    await expect(validateProtectedSurfaceToken({
      ...base,
      token,
      requiredScope: "age-policy:temporary-adult",
    })).resolves.toBe(true);
  });

  it("rejects stale policy/profile/preset/day/scope context", async () => {
    const token = issueProtectedSurfaceToken({
      ...base,
      scopes: ["private-chat:access"],
    });
    await expect(validateProtectedSurfaceToken({
      ...base,
      token,
      requiredScope: "age-policy:temporary-adult",
    })).resolves.toBe(false);
    await expect(validateProtectedSurfaceToken({
      ...base,
      policyVersion: "policy-2",
      token,
      requiredScope: "private-chat:access",
    })).resolves.toBe(false);
    await expect(validateProtectedSurfaceToken({
      ...base,
      dayKey: "2026-07-03",
      token,
      requiredScope: "private-chat:access",
    })).resolves.toBe(false);
  });
});
