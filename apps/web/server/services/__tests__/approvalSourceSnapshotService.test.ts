import { describe, expect, it } from "vitest";

import {
  captureApprovalSnapshots,
  compareApprovalSnapshots,
} from "../approvalSourceSnapshotService";

describe("approvalSourceSnapshotService", () => {
  it("captures content-aware integrity markers when provided", () => {
    const snapshots = captureApprovalSnapshots({
      sourceRefs: [
        {
          sourceType: "case",
          sourceId: "case-1",
          label: "Launch campaign",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
      ],
      integrityMarkers: {
        "case-1": {
          approvedExcerpt: "Original case summary",
          summary: "Original case summary",
          versionMarker: "2026-04-21T00:00:00.000Z",
          contentHash: "hash-case-1",
          sanitizationState: "summary_only",
        },
      },
      capturedAt: "2026-04-21T00:00:00.000Z",
    });

    expect(snapshots).toEqual([
      expect.objectContaining({
        approvedExcerpt: "Original case summary",
        summary: "Original case summary",
        versionMarker: "2026-04-21T00:00:00.000Z",
        contentHash: "hash-case-1",
      }),
    ]);
  });

  it("detects drift when the current integrity marker hash changes", () => {
    const snapshots = captureApprovalSnapshots({
      sourceRefs: [
        {
          sourceType: "case",
          sourceId: "case-1",
          label: "Launch campaign",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
      ],
      integrityMarkers: {
        "case-1": {
          summary: "Original case summary",
          contentHash: "hash-case-1",
          versionMarker: "v1",
        },
      },
      capturedAt: "2026-04-21T00:00:00.000Z",
    });

    const comparison = compareApprovalSnapshots(
      snapshots,
      [
        {
          sourceType: "case",
          sourceId: "case-1",
          label: "Launch campaign",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
      ],
      {
        "case-1": {
          summary: "Updated case summary",
          contentHash: "hash-case-2",
          versionMarker: "v2",
        },
      },
    );

    expect(comparison).toEqual({
      hasDrift: true,
      reasonCode: "source_hash_mismatch",
      driftedSourceIds: ["case-1"],
    });
  });
});
