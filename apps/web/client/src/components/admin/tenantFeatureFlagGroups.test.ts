import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS,
} from "@shared/featureFlags";
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

  it("groups Marketplace HyperFrames controls with media production flags", () => {
    const mediaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Media Production & HyperFrames"
    );

    expect(mediaGroup?.flags.map((flag) => flag.key)).toEqual(
      expect.arrayContaining([
        "marketplaceHyperframesEnabled",
        "marketplaceHyperframesWorkerEnabled",
        "marketplaceHyperframesLibrarySaveEnabled",
        "marketplaceHyperframesOperatorEnabled",
      ])
    );
    expect(
      mediaGroup?.flags.find(
        (flag) => flag.key === "marketplaceHyperframesEnabled"
      )
    ).toEqual(
      expect.objectContaining({
        label: "Marketplace HyperFrames",
        description: expect.stringContaining("Auto Storyboard Review"),
      })
    );
  });

  it("groups Agent Experience controls without Persona naming", () => {
    const agentExperienceGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Agent Experience"
    );

    expect(agentExperienceGroup?.flags.map((flag) => flag.key)).toEqual(
      expect.arrayContaining([
        "agentExperienceLayer",
        "agentExperienceShadowMode",
        "agentExperienceAgencyPreview",
        "agentExperienceTeamPreview",
        "agentExperienceChatPreview",
        "agentExperienceRuntypeRenderer",
        "agentExperienceDebugInspector",
        "agentExperienceForceRollback",
        "agentExperienceWebsiteWidget",
        "agentExperiencePageActions",
      ])
    );
    expect(agentExperienceGroup?.flags.some((flag) => /persona/i.test(flag.label))).toBe(false);
  });

  it("groups the Deep Story Drafts flag (F131T) with Vertical Drama Series", () => {
    const dramaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Vertical Drama Series",
    );
    const deepDraftsFlag = dramaGroup?.flags.find(
      (flag) => flag.key === "verticalDramaSeriesDeepStoryDrafts",
    );

    expect(deepDraftsFlag).toEqual(
      expect.objectContaining({
        label: "Deep Story Drafts",
        description: expect.stringContaining("F131T"),
      }),
    );
  });

  it("groups the Story Lock flag (F131V) with Vertical Drama Series exactly once", () => {
    const dramaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Vertical Drama Series",
    );
    const storyLockFlags = dramaGroup?.flags.filter(
      (flag) => flag.key === "verticalDramaSeriesStoryLock",
    );

    expect(storyLockFlags).toHaveLength(1);
    expect(storyLockFlags?.[0]).toEqual(
      expect.objectContaining({
        label: "Story Lock",
        description: expect.stringContaining("F131V"),
      }),
    );
  });

  it("groups the Share Links flag (F131AA) with Vertical Drama Series exactly once", () => {
    const dramaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Vertical Drama Series",
    );
    const shareLinksFlags = dramaGroup?.flags.filter(
      (flag) => flag.key === "verticalDramaSeriesShareLinks",
    );

    expect(shareLinksFlags).toHaveLength(1);
    expect(shareLinksFlags?.[0]).toEqual(
      expect.objectContaining({
        label: "Share Links",
        description: expect.stringContaining("F131AA"),
      }),
    );
  });

  it("groups the special tie-in episode flag with an actionable label", () => {
    const dramaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Vertical Drama Series",
    );
    const specialFlags = dramaGroup?.flags.filter(
      (flag) => flag.key === "verticalDramaSpecialEpisodes",
    );

    expect(specialFlags).toHaveLength(1);
    expect(specialFlags?.[0]).toEqual(
      expect.objectContaining({
        label: "Special Tie-in Episodes",
        description: expect.stringContaining("special product/location/store"),
      }),
    );
  });

  it("groups all 9 Feature 132 quality-engine flags (F132A-I) with Vertical Drama Series, each with a non-empty label/description", () => {
    const dramaGroup = buildTenantFeatureFlagGroups().find(
      (group) => group.title === "Vertical Drama Series",
    );

    expect(VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS).toHaveLength(9);

    for (const key of VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS) {
      const flag = dramaGroup?.flags.find((f) => f.key === key);
      expect(flag, `expected Vertical Drama Series group to contain flag "${key}"`).toBeDefined();
      expect(flag?.label?.length ?? 0).toBeGreaterThan(0);
      expect(flag?.description?.length ?? 0).toBeGreaterThan(0);
    }
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
