import { describe, expect, it } from "vitest";
import {
  buildAccessibleSpatialNarrative,
  deriveOfflineAccessState,
  parseOfflineMutationEnvelope,
} from "../../packages/shared/src/emergency/offlineAccess";

describe("Spec 262 offline access boundaries", () => {
  it("labels cached data as non-live and marks it stale from its data-through time", () => {
    expect(deriveOfflineAccessState({
      network: "offline",
      dataThrough: "2026-10-01T10:00:00Z",
      now: "2026-10-01T10:04:00Z",
      freshForMs: 5 * 60_000,
    })).toEqual({
      connectivity: "OFFLINE_CACHED",
      dataThrough: "2026-10-01T10:00:00Z",
      isLive: false,
      actionRequiresRevalidation: true,
    });
    expect(deriveOfflineAccessState({
      network: "offline",
      dataThrough: "2026-10-01T10:00:00Z",
      now: "2026-10-01T10:06:00Z",
      freshForMs: 5 * 60_000,
    })).toMatchObject({ connectivity: "OFFLINE_STALE", isLive: false, actionRequiresRevalidation: true });
  });

  it("creates a bounded text equivalent for authorized approximate geometry", () => {
    expect(buildAccessibleSpatialNarrative({
      featureRef: "alert-42",
      label: "Flood warning",
      geometryKind: "area",
      relation: "north-east",
      distanceMeters: 1250,
      precision: "approximate",
      dataThrough: "2026-10-01T10:00:00Z",
    })).toEqual({
      featureRef: "alert-42",
      text: "Flood warning: approximate area, about 1.3 km north-east. Data through 2026-10-01T10:00:00Z.",
    });
    expect(buildAccessibleSpatialNarrative({
      featureRef: "alert-42",
      label: "x".repeat(129),
      geometryKind: "point",
      relation: "north",
      distanceMeters: 1,
      precision: "exact",
      dataThrough: "2026-10-01T10:00:00Z",
    })).toBeUndefined();
  });

  it("accepts only bounded pending local intent with a stable idempotency key", () => {
    const pending = {
      schemaVersion: 1,
      localOperationId: "offline-op-1",
      idempotencyKey: "offline-op-1",
      environment: "LIVE",
      operationType: "emergency-report-create",
      clientCreatedAt: "2026-10-01T10:00:00Z",
      clientSequence: 7,
      payloadRef: "local-payload-1",
      mediaUploadRefs: ["media-1"],
      state: "PENDING",
      retryCount: 0,
    };
    expect(parseOfflineMutationEnvelope(pending)).toEqual(pending);
    expect(parseOfflineMutationEnvelope({ ...pending, idempotencyKey: "new-key" })).toBeUndefined();
    expect(parseOfflineMutationEnvelope({ ...pending, operationType: "delete-all" })).toBeUndefined();
    expect(parseOfflineMutationEnvelope({ ...pending, environment: "EXERCISE", targetCanonicalRef: "live-case-1" })).toBeUndefined();
  });
});
