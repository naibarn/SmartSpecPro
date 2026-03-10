import { describe, expect, it } from "vitest";

import { getBrowserToolLaunchGuardError } from "../services/browserPolicyLaunchGuard";

describe("browser tool launch guard", () => {
  it("blocks tenant-facing raw browser access until policy wiring is ready", () => {
    expect(
      getBrowserToolLaunchGuardError({
        browserToolEnabled: true,
        browserPolicyContractWired: false,
      }),
    ).toEqual({
      status: 503,
      code: "POLICY_NOT_READY",
      message: "Browser automation policy enforcement is not wired for the raw browser tool.",
    });
  });

  it("allows launch when the raw browser surface is disabled", () => {
    expect(
      getBrowserToolLaunchGuardError({
        browserToolEnabled: false,
        browserPolicyContractWired: false,
      }),
    ).toBeNull();
  });

  it("allows launch when policy wiring is ready", () => {
    expect(
      getBrowserToolLaunchGuardError({
        browserToolEnabled: true,
        browserPolicyContractWired: true,
      }),
    ).toBeNull();
  });
});
