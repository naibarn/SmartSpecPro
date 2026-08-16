import { describe, expect, it } from "vitest";

import {
  filterDesktopReleaseCatalogForPublic,
  isDesktopReleaseVersionBlockedFromPublic,
} from "../desktopReleases";

const release = (version: string, platform: "windows" | "macos" | "linux") => ({
  id: version === "0.1.4" ? 1 : 2,
  version,
  platform,
  channel: "stable" as const,
  installerFormat: "exe" as const,
  fileName: `${version}.exe`,
  contentType: "application/vnd.microsoft.portable-executable",
  fileSizeBytes: 1,
  fileSha256: "a".repeat(64),
  releaseNotes: null,
  isPublished: true,
  publishedAt: "2026-08-16T00:00:00.000Z",
  uploadedAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  uploadedByUserId: null,
  uploadedByName: null,
  downloadUrl: `/api/desktop-releases/${version}/download`,
});

describe("desktop release public visibility", () => {
  it("blocks only the stale 0.1.4 version", () => {
    expect(isDesktopReleaseVersionBlockedFromPublic("0.1.4")).toBe(true);
    expect(isDesktopReleaseVersionBlockedFromPublic("0.1.40")).toBe(false);
    expect(isDesktopReleaseVersionBlockedFromPublic("0.1.5")).toBe(false);
  });

  it("removes the stale version and recalculates the public latest release", () => {
    const stale = release("0.1.4", "windows");
    const current = release("0.1.5", "windows");
    const filtered = filterDesktopReleaseCatalogForPublic({
      generatedAt: "2026-08-16T00:00:00.000Z",
      releases: [stale, current],
      latestByPlatform: {
        windows: stale,
        macos: null,
        linux: null,
      },
    });

    expect(filtered.releases).toEqual([current]);
    expect(filtered.latestByPlatform.windows).toEqual(current);
  });
});
