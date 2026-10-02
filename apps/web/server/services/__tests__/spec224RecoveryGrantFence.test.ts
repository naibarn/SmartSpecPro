import { describe, expect, it } from "vitest";

import { spec224RecoveryGrantFenceIdentity } from "../spec224RecoveryGrantFence";

describe("Spec 224 recovery grant fence identity", () => {
  it("normalizes UUID case and separates tenant and grant authority", () => {
    expect(
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000224".toUpperCase(),
        grantId: "00000000-0000-4000-8000-000000000376".toUpperCase(),
      })
    ).toBe(
      "spec224:recovery-grant:00000000-0000-4000-8000-000000000224:00000000-0000-4000-8000-000000000376"
    );
    expect(
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000224",
        grantId: "00000000-0000-4000-8000-000000000377",
      })
    ).not.toBe(
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000224",
        grantId: "00000000-0000-4000-8000-000000000376",
      })
    );
    expect(
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000225",
        grantId: "00000000-0000-4000-8000-000000000376",
      })
    ).not.toBe(
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000224",
        grantId: "00000000-0000-4000-8000-000000000376",
      })
    );
  });

  it.each([
    "",
    "not-a-uuid",
    "00000000-0000-4000-8000-000000000224:evil",
    "é0000000-0000-4000-8000-000000000224",
  ])("rejects malformed tenant identity %s", tenantId => {
    expect(() =>
      spec224RecoveryGrantFenceIdentity({
        tenantId,
        grantId: "00000000-0000-4000-8000-000000000376",
      })
    ).toThrow("SPEC224_RECOVERY_GRANT_FENCE_IDENTITY_INVALID");
  });

  it.each([
    "",
    "not-a-uuid",
    "00000000-0000-4000-8000-000000000376:evil",
    "é0000000-0000-4000-8000-000000000376",
  ])("rejects malformed grant identity %s", grantId => {
    expect(() =>
      spec224RecoveryGrantFenceIdentity({
        tenantId: "00000000-0000-4000-8000-000000000224",
        grantId,
      })
    ).toThrow("SPEC224_RECOVERY_GRANT_FENCE_IDENTITY_INVALID");
  });
});
