import { describe, expect, it } from "vitest";

import { stagedRenderLibrarySourceUrlForTest } from "../marketplaceAutoReviewService";

describe("Marketplace Auto Review staged render Library source", () => {
  it("keeps private Worker App render paths managed during Library finalization", () => {
    expect(
      stagedRenderLibrarySourceUrlForTest(
        "/api/storage/files/worker-artifacts/tenant-1/job-1/final.mp4",
        "https://smartaihub.app/api/storage/files/worker-artifacts/tenant-1/job-1/final.mp4",
      )
    ).toBe("/api/storage/files/worker-artifacts/tenant-1/job-1/final.mp4");
    expect(
      stagedRenderLibrarySourceUrlForTest(
        "https://cdn.example.test/final.mp4",
        "https://cdn.example.test/final.mp4",
      )
    ).toBe("https://cdn.example.test/final.mp4");
  });
});
