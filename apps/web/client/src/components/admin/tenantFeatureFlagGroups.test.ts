import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";
import {
  buildTenantFeatureFlagGroups,
  getUngroupedTenantFeatureFlagKeys,
} from "./tenantFeatureFlagGroups";

describe("tenantFeatureFlagGroups", () => {
  it("includes the local client llm feature flag in grouped admin flags", () => {
    const allKeys = buildTenantFeatureFlagGroups().flatMap((group) =>
      group.flags.map((flag) => flag.key),
    );

    expect(allKeys).toContain("localClientLlmMode");
  });

  it("includes the agency hybrid ADK controls in grouped admin flags", () => {
    const allKeys = buildTenantFeatureFlagGroups().flatMap((group) =>
      group.flags.map((flag) => flag.key),
    );

    expect(allKeys).toContain("agencyHybridAdk");
    expect(allKeys).toContain("agencyHybridAdkKillSwitch");
  });

  it("includes the Hermes expansion slices in grouped admin flags", () => {
    const allKeys = buildTenantFeatureFlagGroups().flatMap((group) =>
      group.flags.map((flag) => flag.key),
    );

    expect(allKeys).toContain("hermesProfileExperience");
    expect(allKeys).toContain("hermesChannelWorkflowExpansion");
    expect(allKeys).toContain("hermesMemoryContextSync");
    expect(allKeys).toContain("hermesTaskModes");
    expect(allKeys).toContain("hermesVisibilitySummaries");
  });

  it("keeps the Desktop + ZeroClaw flag label aligned with the runtime name", () => {
    const desktopGroup = buildTenantFeatureFlagGroups().find((group) => group.title === "Desktop Host");
    const desktopZeroClawFlag = desktopGroup?.flags.find((flag) => flag.key === "desktopZeroClawWorker");

    expect(desktopZeroClawFlag).toEqual(expect.objectContaining({
      label: "Desktop + ZeroClaw Managed Runtime",
      description: expect.stringContaining("Desktop + ZeroClaw"),
    }));
  });

  it("keeps the NemoClaw and HiClaw flag labels aligned with their runtime names", () => {
    const desktopGroup = buildTenantFeatureFlagGroups().find((group) => group.title === "Desktop Host");
    const nemoClawFlag = desktopGroup?.flags.find((flag) => flag.key === "nemoClawSecureWorkerPool");
    const hiClawFlag = desktopGroup?.flags.find((flag) => flag.key === "hiClawClusterRuntime");

    expect(nemoClawFlag).toEqual(expect.objectContaining({
      label: "NemoClaw Secure Sandbox",
      description: expect.stringContaining("secure sandbox"),
    }));
    expect(hiClawFlag).toEqual(expect.objectContaining({
      label: "HiClaw Collaborative Cluster",
      description: expect.stringContaining("collaborative cluster"),
    }));
  });

  it("covers every declared tenant feature flag", () => {
    const groupedKeys = new Set(
      buildTenantFeatureFlagGroups().flatMap((group) => group.flags.map((flag) => flag.key)),
    );
    const declaredKeys = Object.keys(FEATURE_FLAG_DEFAULTS);

    expect(getUngroupedTenantFeatureFlagKeys()).toEqual([]);
    expect(groupedKeys.size).toBe(declaredKeys.length);
    expect([...groupedKeys].sort()).toEqual([...declaredKeys].sort());
  });
});
