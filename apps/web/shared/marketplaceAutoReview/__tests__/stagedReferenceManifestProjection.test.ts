import { describe, expect, it } from "vitest";

import { projectStagedReferenceManifestEntry } from "../stagedReferenceManifestProjection";

describe("staged reference manifest projection", () => {
  it("preserves a minor character flag when returning manifest data to the editor", () => {
    const projected = projectStagedReferenceManifestEntry({
      index: 2,
      url: " https://example.test/child.png ",
      role: "character",
      active: true,
      characterName: " Child ",
      ageRange: "under_18",
      depictsMinor: true,
    });

    expect(projected).toMatchObject({
      index: 2,
      url: "https://example.test/child.png",
      role: "character",
      active: true,
      characterName: "Child",
      ageRange: "under_18",
      depictsMinor: true,
    });
  });

  it("preserves explicit false without treating an absent value as false", () => {
    const base = {
      index: 0,
      url: "https://example.test/adult.png",
      role: "character",
      active: true,
    };

    expect(
      projectStagedReferenceManifestEntry({ ...base, depictsMinor: false })
        .depictsMinor
    ).toBe(false);
    expect(
      projectStagedReferenceManifestEntry(base).depictsMinor
    ).toBeUndefined();
  });
});
