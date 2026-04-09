import { describe, expect, it } from "vitest";

import {
  buildDefaultDesktopApprovalRules,
  buildDesktopLocalRootPolicy,
  buildDesktopOffboardingPlan,
  buildDesktopRolloutGateStates,
  buildDesktopWorkspaceProfile,
  buildManagedDesktopHostPolicySnapshot,
  enforceDesktopCapabilityManifest,
  evaluateDesktopOutboundPolicy,
  isSensitiveDesktopRootPath,
} from "../desktopPolicyService";

describe("desktopPolicyService", () => {
  it("blocks sensitive roots by default", () => {
    expect(isSensitiveDesktopRootPath("/etc/ssl")).toBe(true);
    expect(isSensitiveDesktopRootPath("C:/Windows/System32")).toBe(true);

    const root = buildDesktopLocalRootPolicy({
      rootId: "etc",
      name: "etc",
      absolutePath: "/etc/ssl",
    });

    expect(root.deniedByDefault).toBe(true);
    expect(root.writebackMode).toBe("read_search_only");
  });

  it("preserves Windows absolute paths without coercing them into posix-prefixed roots", () => {
    const root = buildDesktopLocalRootPolicy({
      rootId: "quotes",
      name: "Quotes",
      absolutePath: "C:/Users/demo/Documents/Quotes",
    });

    expect(root.absolutePath).toBe("C:/Users/demo/Documents/Quotes");
    expect(root.deniedByDefault).toBe(false);
  });

  it("builds workspace profiles with managed mounts and gateway-only network by default", () => {
    const profile = buildDesktopWorkspaceProfile({
      profileName: "pi_sidecar_managed",
      projectWorkspacePath: "/workspace/project",
      packageCachePath: "/workspace/packages",
      localRoots: [
        buildDesktopLocalRootPolicy({
          rootId: "quotes",
          name: "Quotes",
          absolutePath: "/Users/demo/Documents/Quotes",
        }),
      ],
    });

    expect(profile.networkClass).toBe("gateway_only");
    expect(profile.mounts.map((mount) => mount.targetPath)).toContain("/workspace");
    expect(profile.mounts.map((mount) => mount.targetPath)).toContain("/roots/quotes");
  });

  it("builds approval rules and rollout gates that fail closed", () => {
    const approvalRules = buildDefaultDesktopApprovalRules(false);
    const rolloutGates = buildDesktopRolloutGateStates({
      deviceBindingReady: true,
      signedPackagesEnforced: true,
      signedUpdatesEnforced: false,
      managedFileRootsDefault: true,
      piGatewayOnly: true,
      agencyGatewayOnly: false,
      offboardingCleanupReady: true,
    });

    expect(
      approvalRules.find((rule) => rule.action === "shell_exec")?.decision,
    ).toBe("deny");
    expect(
      rolloutGates.find((gate) => gate.gate === "signed_updates_enforced")?.satisfied,
    ).toBe(false);
  });

  it("composes managed desktop host snapshots with local roots and approval rules", () => {
    const root = buildDesktopLocalRootPolicy({
      rootId: "quotes",
      name: "Quotes",
      absolutePath: "/Users/demo/Documents/Quotes",
    });

    const snapshot = buildManagedDesktopHostPolicySnapshot({
      tenantId: "tenant-1",
      deviceId: "device-1",
      policyVersion: "policy-v1",
      fetchedAt: "2026-04-09T10:00:00.000Z",
      expiresAt: "2026-04-09T11:00:00.000Z",
      trustFreshnessTtlSeconds: 3600,
      localRoots: [root],
      workspaceProfiles: [
        buildDesktopWorkspaceProfile({
          profileName: "standard_managed",
          projectWorkspacePath: "/workspace/project",
          localRoots: [root],
        }),
      ],
    });

    expect(snapshot.localRoots).toHaveLength(1);
    expect(snapshot.approvalRules.length).toBeGreaterThan(0);
    expect(snapshot.workspaceProfiles[0]?.networkClass).toBe("gateway_only");
  });

  it("plans offboarding cleanup for package caches and derived stores", () => {
    const plan = buildDesktopOffboardingPlan({
      deviceId: "device-1",
      packageCachePaths: ["/cache/packages"],
      localRoots: [
        buildDesktopLocalRootPolicy({
          rootId: "quotes",
          name: "Quotes",
          absolutePath: "/Users/demo/Documents/Quotes",
        }),
      ],
    });

    expect(plan.revokeTokensImmediately).toBe(true);
    expect(plan.purgeDerivedStores).toBe(true);
    expect(plan.localRootIds).toEqual(["quotes"]);
  });

  it("enforces capability manifests and outbound policy decisions", () => {
    expect(() =>
      enforceDesktopCapabilityManifest({
        capabilityManifest: {
          capabilities: ["local_file_search"],
        },
        requiredCapability: "connector.send_message",
      }),
    ).toThrow(/required desktop capability/i);

    expect(
      evaluateDesktopOutboundPolicy({
        destinationClass: "connector",
        dataSensitivity: "high",
        trustTaintedOutput: false,
      }),
    ).toBe("confirm");
    expect(
      evaluateDesktopOutboundPolicy({
        destinationClass: "server",
        dataSensitivity: "low",
        trustTaintedOutput: true,
      }),
    ).toBe("deny");
  });
});
