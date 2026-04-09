import { describe, expect, it } from "vitest";

import {
  desktopApprovalRuleSchema,
  desktopCapabilityManifestSchema,
  desktopDerivedStorePolicySchema,
  desktopLocalRootSchema,
  desktopRunSelectionResultSchema,
  desktopWorkspaceProfileSchema,
} from "../desktopHost";

describe("desktopHost policy contracts", () => {
  it("parses a managed local root policy", () => {
    const root = desktopLocalRootSchema.parse({
      rootId: "quotes",
      name: "Quotes",
      absolutePath: "/Users/demo/Documents/Quotes",
      writebackMode: "managed_output_only",
    });

    expect(root.indexingEnabled).toBe(true);
    expect(root.deniedByDefault).toBe(false);
  });

  it("parses derived store retention policy", () => {
    const policy = desktopDerivedStorePolicySchema.parse({
      storageProtection: "encrypted_at_rest",
      vectorIndexEnabled: true,
      purgeOnOffboarding: true,
    });

    expect(policy.previewCacheTtlDays).toBe(30);
    expect(policy.vectorIndexEnabled).toBe(true);
  });

  it("parses managed workspace profile descriptors", () => {
    const profile = desktopWorkspaceProfileSchema.parse({
      profileName: "pi_sidecar_managed",
      networkClass: "gateway_only",
      mounts: [{
        mountType: "project_workspace",
        sourcePath: "/workspace/project",
        targetPath: "/workspace",
        readOnly: false,
      }],
    });

    expect(profile.outputDirectoryName).toBe("outputs");
  });

  it("parses capability manifest and approval rules", () => {
    const capability = desktopCapabilityManifestSchema.parse({
      capabilities: ["local_file_search"],
      allowsConnectorActions: ["read_message"],
    });
    const rule = desktopApprovalRuleSchema.parse({
      action: "delete_file",
      decision: "confirm",
      rationale: "Destructive write requires confirmation.",
    });

    expect(capability.networkEgressClass).toBe("gateway_only");
    expect(rule.decision).toBe("confirm");
  });

  it("parses deterministic run-selection results", () => {
    const result = desktopRunSelectionResultSchema.parse({
      selectedRuntime: "pi",
      reason: "local_file_heavy",
      labels: {
        surface: "desktop",
        runtime: "pi",
        locality: "hybrid",
        workspace: "local_workspace",
        trustClass: "org_verified",
      },
      sidecarBoundaryRequired: true,
    });

    expect(result.transport.preferredTransport).toBe("http");
    expect(result.labels.locality).toBe("hybrid");
  });
});
