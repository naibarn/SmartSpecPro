import { describe, expect, it } from "vitest";

import {
  assertDesktopManagedRolloutAllowed,
  evaluateDesktopManagedRollout,
} from "../desktopRolloutGates";
import { buildDesktopRolloutGateStates } from "../desktopPolicyService";

describe("desktopRolloutGates", () => {
  it("blocks enterprise managed default when required gates are unsatisfied", () => {
    const gates = buildDesktopRolloutGateStates({
      deviceBindingReady: true,
      signedPackagesEnforced: true,
      signedUpdatesEnforced: false,
      managedFileRootsDefault: true,
      piGatewayOnly: true,
      agencyGatewayOnly: true,
      offboardingCleanupReady: false,
    });

    const result = evaluateDesktopManagedRollout({
      phase: "enterprise_managed_default",
      gates,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingGates.map((gate) => gate.gate)).toEqual([
      "signed_updates_enforced",
      "offboarding_cleanup_ready",
    ]);
  });

  it("allows runtime rollout only after its required gates pass", () => {
    const gates = buildDesktopRolloutGateStates({
      deviceBindingReady: true,
      signedPackagesEnforced: true,
      signedUpdatesEnforced: true,
      managedFileRootsDefault: true,
      piGatewayOnly: true,
      agencyGatewayOnly: true,
      offboardingCleanupReady: true,
    });

    expect(() =>
      assertDesktopManagedRolloutAllowed({
        phase: "agency_runtime",
        gates,
      }),
    ).not.toThrow();
  });
});
