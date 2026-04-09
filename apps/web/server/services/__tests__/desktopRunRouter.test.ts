import { describe, expect, it } from "vitest";

import {
  resolveDesktopRunLocalityLabel,
  routeDesktopRun,
} from "../desktopRunRouter";

describe("desktopRunRouter", () => {
  it("selects Pi for local-file-heavy work and requires sidecar boundary", () => {
    const result = routeDesktopRun({
      packageTrustClass: "org_verified",
      requiresLocalFiles: true,
      requiresConnectors: false,
      platformSkillEligible: false,
      orchestrationComplexity: "moderate",
      piAvailable: true,
      agencyAvailable: true,
      openClawAvailable: false,
      cloudAllowed: true,
      offline: false,
      degradedGateway: false,
      rawInputLeavesDevice: true,
    });

    expect(result.selectedRuntime).toBe("pi");
    expect(result.reason).toBe("local_file_heavy");
    expect(result.sidecarBoundaryRequired).toBe(true);
    expect(result.labels.locality).toBe("hybrid");
  });

  it("selects Agency Swarm for connector-heavy or complex orchestration", () => {
    const result = routeDesktopRun({
      packageTrustClass: "org_verified",
      requiresLocalFiles: false,
      requiresConnectors: true,
      platformSkillEligible: false,
      orchestrationComplexity: "complex",
      piAvailable: true,
      agencyAvailable: true,
      openClawAvailable: false,
      cloudAllowed: true,
      offline: false,
      degradedGateway: false,
    });

    expect(result.selectedRuntime).toBe("agency_swarm");
    expect(result.reason).toBe("connector_orchestration");
    expect(result.labels.workspace).toBe("local_workspace");
  });

  it("keeps deterministic skill work on platform skill when local tooling is unnecessary", () => {
    const result = routeDesktopRun({
      packageTrustClass: "built_in_verified",
      requiresLocalFiles: false,
      requiresConnectors: false,
      platformSkillEligible: true,
      orchestrationComplexity: "simple",
      piAvailable: true,
      agencyAvailable: true,
      openClawAvailable: true,
      cloudAllowed: true,
      offline: false,
      degradedGateway: false,
    });

    expect(result.selectedRuntime).toBe("platform_skill");
    expect(result.reason).toBe("deterministic_skill");
  });

  it("falls back to gateway/cloud runtimes only when local runtimes are not the right fit", () => {
    const result = routeDesktopRun({
      packageTrustClass: "org_verified",
      requiresLocalFiles: false,
      requiresConnectors: false,
      platformSkillEligible: false,
      orchestrationComplexity: "moderate",
      piAvailable: false,
      agencyAvailable: false,
      openClawAvailable: true,
      cloudAllowed: true,
      offline: false,
      degradedGateway: false,
    });

    expect(result.selectedRuntime).toBe("openclaw_gateway");
    expect(result.labels.locality).toBe("external");
  });

  it("applies truthful locality labels", () => {
    expect(
      resolveDesktopRunLocalityLabel({
        runtime: "pi",
        rawInputLeavesDevice: false,
        serverToolsRequired: false,
      }),
    ).toBe("local");
    expect(
      resolveDesktopRunLocalityLabel({
        runtime: "pi",
        rawInputLeavesDevice: true,
      }),
    ).toBe("hybrid");
    expect(
      resolveDesktopRunLocalityLabel({
        runtime: "openclaw_gateway",
      }),
    ).toBe("external");
  });
});
