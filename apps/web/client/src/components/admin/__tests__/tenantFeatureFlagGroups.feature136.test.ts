/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 §4.2. Pure data test — imports `BASE_TENANT_FLAG_GROUPS` directly (no
 * jsdom mount needed; hermes memory: big admin panels cannot mount in
 * jsdom, so this test deliberately never imports the panel component).
 */
import { describe, expect, it } from "vitest";

import { BASE_TENANT_FLAG_GROUPS } from "../tenantFeatureFlagGroups";

const THAI_TEXT_PATTERN = /[฀-๿]/;
const MEDIA_PRODUCTION_GROUP_TITLE = "Media Production & HyperFrames";

describe("Feature 136 — tenant flag groups (Media Production & HyperFrames)", () => {
  it("adds exactly one entry per new flag inside the Media Production & HyperFrames group", () => {
    const group = BASE_TENANT_FLAG_GROUPS.find(
      (candidate) => candidate.title === MEDIA_PRODUCTION_GROUP_TITLE,
    );
    expect(group).toBeDefined();

    const sequentialEntries = group!.flags.filter(
      (flag) => flag.key === "marketplaceSequentialStoryboard",
    );
    const evidenceGuardEntries = group!.flags.filter(
      (flag) => flag.key === "marketplaceReviewEvidenceGuard",
    );
    expect(sequentialEntries).toHaveLength(1);
    expect(evidenceGuardEntries).toHaveLength(1);
  });

  it("gives both new flags non-empty labels and Thai-language descriptions", () => {
    const group = BASE_TENANT_FLAG_GROUPS.find(
      (candidate) => candidate.title === MEDIA_PRODUCTION_GROUP_TITLE,
    );
    const entries = (group?.flags ?? []).filter(
      (flag) =>
        flag.key === "marketplaceSequentialStoryboard" ||
        flag.key === "marketplaceReviewEvidenceGuard",
    );
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.description).toMatch(THAI_TEXT_PATTERN);
    }
  });
});
