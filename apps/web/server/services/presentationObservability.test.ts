import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import {
  convertOfficeSourceToPresentation,
  resetPresentationConversionStateForTests,
} from "./presentationCompatibilityService";
import {
  evaluatePresentationAlertThresholds,
  getPresentationMetricValue,
  getPresentationObservabilityLogs,
  recordPresentationLog,
  resetPresentationObservabilityStateForTests,
} from "./presentationObservability";
import {
  resetPresentationExportStateForTests,
  triggerPresentationExport,
} from "./presentationPlaybackExport";
import { PresentationServiceError } from "./presentationService";

const actor = {
  userId: 9,
  tenantId: "tenant-1",
  role: "user",
} as const;

function buildDeckDetail() {
  return {
    deck: {
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Roadmap",
      description: null,
      version: 3,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    },
    slides: [
      {
        id: 1,
        deckId: 101,
        orderIndex: 0,
        version: 1,
        title: "First",
        slideContent: { elements: [], transition: "cut", durationMs: 3000 },
        notes: null,
        createdAt: new Date("2026-02-22T10:00:00.000Z"),
        updatedAt: new Date("2026-02-22T10:00:00.000Z"),
      },
    ],
    assets: [],
  };
}

describe("presentationObservability", () => {
  beforeEach(() => {
    resetPresentationObservabilityStateForTests();
    resetPresentationExportStateForTests();
    resetPresentationConversionStateForTests();
    vi.clearAllMocks();
  });

  it("emits structured logs with tenant-safe metadata only", () => {
    recordPresentationLog("presentation_export_queued", {
      tenantId: "tenant-1",
      userId: 12,
      deckId: 88,
      format: "mp4",
      email: "secret@example.com",
      token: "redacted",
    });

    const entries = getPresentationObservabilityLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: "presentation_export_queued",
      tenantId: "tenant-1",
      userId: 12,
      deckId: 88,
      format: "mp4",
    });
    expect((entries[0] as any).email).toBeUndefined();
    expect((entries[0] as any).token).toBeUndefined();
  });

  it("records metrics on export success and throttle failure branches", async () => {
    const deckDetail = buildDeckDetail();
    let now = 1_000;

    await triggerPresentationExport(
      { deckId: 101, format: "mp4", idempotencyKey: "req-a" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-1" }),
        now: () => now,
        maxUserRequestsPerMinute: 1,
        maxDeckRequestsPerMinute: 1,
      },
    );

    expect(getPresentationMetricValue("presentation.export.queued")).toBe(1);

    now += 1_000;
    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "req-b" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-2" }),
          now: () => now,
          maxUserRequestsPerMinute: 1,
          maxDeckRequestsPerMinute: 1,
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof PresentationServiceError && error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED;
    });

    expect(getPresentationMetricValue("presentation.export.throttle_rejection.total")).toBe(1);
  });

  it("records conversion failure metrics for unsupported conversion requests", async () => {
    const deps = {
      getLibraryItemById: vi.fn().mockResolvedValue({
        id: 501,
        tenantId: actor.tenantId,
        ownerUserId: actor.userId,
        itemType: "document",
        source: "document_management",
        title: "Legacy.unknown",
        description: "Unknown",
        status: "ready",
        visibility: "private",
        metadata: { extension: "txt" },
        sourceUrl: "https://example.com/Legacy.txt",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createLibraryItem: vi.fn(),
      createPresentationDeckForLibraryItem: vi.fn(),
      upsertSourceAttachment: vi.fn(),
    };

    await expect(
      convertOfficeSourceToPresentation(
        {
          sourceItemId: 501,
          idempotencyKey: "unsupported-1",
        },
        actor,
        deps as any,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof PresentationServiceError && error.code === PRESENTATION_ERROR_CODE.UNSUPPORTED_ITEM_TYPE;
    });

    expect(getPresentationMetricValue("presentation.conversion.failure.total")).toBe(1);
  });

  it("triggers alerts when thresholds are exceeded and stays quiet below thresholds", () => {
    const failing = evaluatePresentationAlertThresholds({
      conflictRate: 0.08,
      conversionFailureRate: 0.05,
      queueLatencyP95Ms: 150_000,
      exportFailureRate: 0.07,
      throttleRejectionRate: 0.25,
      duplicateSuppressionRate: 0.0,
    });

    expect(failing.triggered).toBe(true);
    expect(failing.alerts).toContain("conflict_rate_exceeded");
    expect(failing.alerts).toContain("queue_latency_p95_exceeded");

    const passing = evaluatePresentationAlertThresholds({
      conflictRate: 0.01,
      conversionFailureRate: 0.01,
      queueLatencyP95Ms: 30_000,
      exportFailureRate: 0.01,
      throttleRejectionRate: 0.01,
      duplicateSuppressionRate: 0.05,
    });

    expect(passing.triggered).toBe(false);
    expect(passing.alerts).toEqual([]);
  });
});
