import { describe, expect, it } from "vitest";
import {
  validateBrollTimeline,
  validateVisualCoverage,
  validateVisualUsageRef,
  visualSourceFingerprint,
  visualSourceStaleReasons,
} from "../verticalDramaVisualSourceCore";
import type {
  ShotBrollBinding,
  VisualSourceSnapshot,
  VisualSourceSlot,
} from "@shared/verticalDramaSeries/visualSource";

const fingerprint = "a".repeat(64);

function slot(overrides: Partial<VisualSourceSlot> = {}): VisualSourceSlot {
  return {
    slotId: "location",
    slotKey: "location_identity",
    title: "Location",
    description: "A real location",
    semanticRole: "scene_anchor",
    mediaType: "image",
    origin: "user_upload",
    evidenceStatus: "needs_verification",
    sourceAssetId: 10,
    mediaAssetId: 20,
    segmentIds: [],
    rightsStatus: "creator_owned",
    disclosureStatus: "not_required",
    factualScope: [],
    required: true,
    sortOrder: 0,
    ...overrides,
  };
}

function snapshot(overrides: Partial<VisualSourceSnapshot> = {}): VisualSourceSnapshot {
  return {
    snapshotId: "snapshot-1",
    revision: 1,
    fingerprint,
    packId: 1,
    seriesId: 2,
    profileId: "location_review",
    profileVersion: 1,
    slots: [slot()],
    segments: [],
    coverage: [
      {
        requirementId: "req-location",
        scope: "series",
        scopeKey: "series",
        description: "Location identity",
        allowedRoles: ["scene_anchor"],
        allowedMediaTypes: ["image"],
        requiredEvidence: "illustrative",
        required: true,
        fulfilledBySlotIds: ["location"],
      },
    ],
    capturedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("vertical drama visual source core", () => {
  it("creates an order-independent fingerprint", () => {
    const first = snapshot();
    const second = snapshot({ slots: [...first.slots].reverse() });
    expect(visualSourceFingerprint(first)).toBe(visualSourceFingerprint(second));
    expect(
      visualSourceFingerprint(snapshot({ profileId: "news_report" }))
    ).not.toBe(visualSourceFingerprint(first));
  });

  it("reports required coverage and allows an illustrative visual", () => {
    const current = snapshot();
    expect(
      validateVisualCoverage({
        requirements: current.coverage,
        slots: current.slots,
      })
    ).toEqual([]);
    expect(
      validateVisualCoverage({
        requirements: [{ ...current.coverage[0], fulfilledBySlotIds: [] }],
        slots: current.slots,
      })[0]?.severity
    ).toBe("blocking");
  });

  it("rejects a usage role or snapshot revision mismatch", () => {
    const findings = validateVisualUsageRef(
      {
        usageId: "usage-1",
        slotId: "location",
        semanticRole: "reference",
        mediaType: "image",
        sourceAssetId: 10,
        mediaAssetId: 20,
        segmentId: null,
        segmentRevision: null,
        inSeconds: null,
        outSeconds: null,
        displayDurationSeconds: 3,
        audioPolicy: "mute",
        labelMode: "none",
        snapshotRevision: 2,
        snapshotFingerprint: fingerprint,
      },
      snapshot()
    );
    expect(findings.map(item => item.code)).toEqual([
      "visual_role_conflict",
      "visual_snapshot_stale",
    ]);
  });

  it("blocks non-B-roll roles and duration overflow", () => {
    const binding: ShotBrollBinding = {
      bindingId: "binding-1",
      episodeId: 1,
      shotNumber: 1,
      usage: {
        usageId: "usage-1",
        slotId: "location",
        semanticRole: "reference",
        mediaType: "image",
        sourceAssetId: 10,
        mediaAssetId: 20,
        segmentId: null,
        segmentRevision: null,
        inSeconds: null,
        outSeconds: null,
        displayDurationSeconds: 10,
        audioPolicy: "mute",
        labelMode: "none",
        snapshotRevision: 1,
        snapshotFingerprint: fingerprint,
      },
      order: 0,
      fitMode: "cover",
      active: true,
      status: "draft",
    };
    expect(
      validateBrollTimeline({ bindings: [binding], durationBudgetSeconds: 5 }).map(
        item => item.code
      )
    ).toEqual(["broll_duration_overflow", "broll_role_invalid"]);
  });

  it("reports only the stale reasons that changed", () => {
    expect(
      visualSourceStaleReasons({
        expectedRevision: 1,
        expectedFingerprint: fingerprint,
        actualRevision: 2,
        actualFingerprint: "b".repeat(64),
        evidenceChanged: true,
      })
    ).toEqual(["visual_source_snapshot_changed", "evidence_revision_changed"]);
  });
});
