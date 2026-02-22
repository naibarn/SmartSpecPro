import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  convertOfficeSourceToPresentation,
  getPresentationCompatibilityOpen,
  resetPresentationConversionStateForTests,
} from "./presentationCompatibilityService";
import {
  buildSlideshowPayload,
  getPresentationExportStatus,
  resetPresentationExportStateForTests,
  triggerPresentationExport,
} from "./presentationPlaybackExport";
import {
  evaluatePresentationCanaryAbort,
  evaluatePresentationPostMigrationConsistency,
  evaluatePresentationReleaseGate,
} from "./presentationReleaseReadiness";
import { applyTemplateAssetToDeck } from "./presentationTemplateService";

const actor = {
  userId: 14,
  tenantId: "tenant-1",
  role: "user",
} as const;

const REQUIRED_EVIDENCE_FIELDS = [
  "evidence_id",
  "pipeline_id",
  "commit_sha",
  "captured_at",
  "suite_result",
  "metrics_snapshot_ref",
] as const;

const COMMIT_SHA_PATTERN = /^[a-f0-9]{7,40}$/;
const SUITE_RESULT_PATTERN = /^\d+\/\d+$/;

function extractMarkdownField(content: string, field: string): string | null {
  const pattern = new RegExp("-\\s*" + field + ":\\s*`([^`]+)`");
  const match = content.match(pattern);
  return match?.[1] ?? null;
}

function buildSourceItem() {
  return {
    id: 501,
    tenantId: actor.tenantId,
    ownerUserId: actor.userId,
    itemType: "document",
    source: "document_management",
    title: "QuarterlyReview.pptx",
    description: "Q1 planning",
    status: "ready",
    visibility: "private",
    metadata: { extension: "pptx" },
    sourceUrl: "https://example.com/QuarterlyReview.pptx",
    thumbnailUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("presentation workflow regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPresentationConversionStateForTests();
    resetPresentationExportStateForTests();
  });

  it("supports read-only open -> convert -> edit -> export -> reopen", async () => {
    vi.useFakeTimers();
    const deps = {
      useInMemoryStateFallback: true,
      getLibraryItemById: vi.fn().mockResolvedValue(buildSourceItem()),
      createLibraryItem: vi.fn().mockResolvedValue({
        item: { id: 901 },
        idempotent: false,
      }),
      createPresentationDeckForLibraryItem: vi.fn().mockResolvedValue({
        created: true,
        deck: { id: 902 },
      }),
      upsertSourceAttachment: vi.fn().mockResolvedValue(undefined),
    };

    const openResult = await getPresentationCompatibilityOpen(501, actor, deps as any);
    expect(openResult.mode).toBe("read_only");
    expect(openResult.canConvert).toBe(true);

    const conversion = await convertOfficeSourceToPresentation(
      { sourceItemId: 501, idempotencyKey: "workflow-1" },
      actor,
      deps as any,
    );

    expect(conversion.conversionStatus).toBe("created");
    expect(conversion.deckId).toBeDefined();
    expect(deps.upsertSourceAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLibraryItemId: 501,
        sourceFormat: "pptx",
      }),
    );

    const deckId = conversion.deckId as number;
    const editedSlides = [
      {
        id: 1,
        deckId,
        orderIndex: 0,
        version: 2,
        title: "Edited title",
        slideContent: {
          elements: [{ id: "txt-1", type: "text", text: "Updated text" }],
          transition: "fade",
          durationMs: 2800,
        },
        notes: null,
        createdAt: new Date("2026-02-22T11:00:00.000Z"),
        updatedAt: new Date("2026-02-22T11:00:00.000Z"),
      },
    ];

    try {
      const exportTs = Date.parse("2026-02-22T11:00:50.000Z");
      vi.setSystemTime(exportTs);

      const exportResult = await triggerPresentationExport(
        { deckId, format: "mp4", idempotencyKey: "workflow-export-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue({
            deck: {
              id: deckId,
              tenantId: actor.tenantId,
              libraryItemId: conversion.deckLibraryItemId,
              title: "QuarterlyReview",
              description: null,
              version: 2,
              slideCount: 1,
              totalAssetBytes: 0,
              createdAt: new Date("2026-02-22T11:00:00.000Z"),
              updatedAt: new Date("2026-02-22T11:00:00.000Z"),
            },
            slides: editedSlides,
            assets: [],
          }),
          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-workflow-1" }),
          now: () => exportTs,
        },
      );

      const exportStatus = getPresentationExportStatus(exportResult.exportId, actor);
      const reopenedSlideshow = buildSlideshowPayload(editedSlides as any, { deckId });

      expect(exportStatus.status).toBe("queued");
      expect(exportResult.renderSpec.slides[0].title).toBe("Edited title");
      expect(reopenedSlideshow.slides[0].title).toBe("Edited title");
      expect(reopenedSlideshow.slides[0].transition).toBe("fade");
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits rollout observability context for queued/degraded export paths", async () => {
    const recordLog = vi.fn();
    const deckId = 902;

    await triggerPresentationExport(
      { deckId, format: "png", idempotencyKey: "workflow-export-obs-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue({
          deck: {
            id: deckId,
            tenantId: actor.tenantId,
            libraryItemId: 1001,
            title: "Canary deck",
            description: null,
            version: 1,
            slideCount: 1,
            totalAssetBytes: 0,
            createdAt: new Date("2026-02-22T12:00:00.000Z"),
            updatedAt: new Date("2026-02-22T12:00:00.000Z"),
          },
          slides: [
            {
              id: 11,
              deckId,
              orderIndex: 0,
              version: 1,
              title: "Warning slide",
              slideContent: {
                elements: [{ id: "txt-1", type: "text", text: "Canary" }],
                transition: "wipe",
                durationMs: 2800,
              },
              notes: null,
              createdAt: new Date("2026-02-22T12:00:00.000Z"),
              updatedAt: new Date("2026-02-22T12:00:00.000Z"),
            },
          ],
          assets: [],
        }),
        enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-workflow-obs-1" }),
        now: () => Date.parse("2026-02-22T12:00:05.000Z"),
        recordLog,
      },
    );

    expect(recordLog).toHaveBeenCalledWith(
      "presentation_export_queued",
      expect.objectContaining({
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId,
        format: "png",
      }),
    );
    expect(recordLog).toHaveBeenCalledWith(
      "presentation_export_degradation",
      expect.objectContaining({
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId,
        warningCount: 1,
      }),
    );
  });

  it("keeps template apply repeatable and tenant-scoped", async () => {
    const getLibraryItemById = vi.fn().mockResolvedValue({
      id: 9101,
      tenantId: actor.tenantId,
      ownerUserId: actor.userId,
      itemType: "image",
      source: "internal_template_catalog",
      title: "Template image.png",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: { extension: "png", mimeType: "image/png", byteSize: 2048 },
      sourceUrl: "https://example.com/template.png",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const attachAssetToDeck = vi.fn().mockResolvedValue({
      link: {
        id: 5001,
        tenantId: actor.tenantId,
        deckId: 902,
        slideId: null,
        libraryItemId: 9101,
        byteSize: 2048,
        createdAt: new Date(),
      },
      totals: {
        totalAssetBytes: 2048,
        warningExceeded: false,
        hardLimitExceeded: false,
      },
    });
    const listAssetsForDeck = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 5001,
          tenantId: actor.tenantId,
          deckId: 902,
          slideId: null,
          libraryItemId: 9101,
          byteSize: 2048,
          createdAt: new Date(),
        },
      ]);

    const first = await applyTemplateAssetToDeck(
      {
        deckId: 902,
        expectedVersion: 1,
        templateAssetLibraryItemId: 9101,
      },
      actor,
      {
        getLibraryItemById,
        attachAssetToDeck,
        listAssetsForDeck,
        recordLog: vi.fn(),
      },
    );
    const second = await applyTemplateAssetToDeck(
      {
        deckId: 902,
        expectedVersion: 2,
        templateAssetLibraryItemId: 9101,
      },
      actor,
      {
        getLibraryItemById,
        attachAssetToDeck,
        listAssetsForDeck,
        recordLog: vi.fn(),
      },
    );

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(attachAssetToDeck).toHaveBeenCalledTimes(1);
  });

  it("fails release gate when mandatory evidence or readiness metrics are missing", () => {
    const result = evaluatePresentationReleaseGate({
      regressionSuitePassed: false,
      consistencyChecksPassed: false,
      monitoringReady: false,
      rollbackReady: false,
      canaryChecklistPassed: false,
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("regression_suite_failed");
    expect(result.failedChecks).toContain("consistency_checks_failed");
    expect(result.failedChecks).toContain("monitoring_not_ready");
    expect(result.failedChecks).toContain("rollback_not_ready");
    expect(result.failedChecks).toContain("canary_checklist_incomplete");
  });

  it("requires backup and restore artifacts before canary promotion", () => {
    const verificationReportPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/migration-verification-report.md",
    );

    expect(existsSync(verificationReportPath)).toBe(true);

    const report = readFileSync(verificationReportPath, "utf8");
    expect(report).toContain("presentation_decks");
    expect(report).toContain("presentation_slides");
    expect(report).toContain("presentation_asset_links");
    expect(report).toContain("restore rehearsal");

    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      expect(extractMarkdownField(report, field)).not.toBeNull();
    }

    const commitSha = extractMarkdownField(report, "commit_sha");
    const suiteResult = extractMarkdownField(report, "suite_result");
    expect(commitSha).toMatch(COMMIT_SHA_PATTERN);
    expect(suiteResult).toMatch(SUITE_RESULT_PATTERN);
  });

  it("requires launch decision artifact with owner signoff before cutover", () => {
    const launchDecisionLogPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/launch-decision-log.md",
    );

    expect(existsSync(launchDecisionLogPath)).toBe(true);

    const decisionLog = readFileSync(launchDecisionLogPath, "utf8");
    expect(decisionLog).toContain("Go/No-Go Decision");
    expect(decisionLog).toContain("Release lead signoff");
    expect(decisionLog).toContain("Timestamp");
    expect(decisionLog).toContain("go_selected_tenants_only");
    expect(decisionLog).toContain("scope: `selected_tenants_only`");

    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      expect(extractMarkdownField(decisionLog, field)).not.toBeNull();
    }

    const commitSha = extractMarkdownField(decisionLog, "commit_sha");
    const suiteResult = extractMarkdownField(decisionLog, "suite_result");
    expect(commitSha).toMatch(COMMIT_SHA_PATTERN);
    expect(suiteResult).toMatch(SUITE_RESULT_PATTERN);
  });

  it("keeps release evidence commit references aligned across artifacts", () => {
    const verificationReportPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/migration-verification-report.md",
    );
    const launchDecisionLogPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/launch-decision-log.md",
    );

    const verificationReport = readFileSync(verificationReportPath, "utf8");
    const launchDecisionLog = readFileSync(launchDecisionLogPath, "utf8");
    const reportSha = extractMarkdownField(verificationReport, "commit_sha");
    const launchSha = extractMarkdownField(launchDecisionLog, "commit_sha");

    expect(reportSha).toBe(launchSha);
    expect(reportSha).toMatch(COMMIT_SHA_PATTERN);
  });

  it("keeps progress blocked labels synchronized with blocked-task queue state", () => {
    const progressPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/implementation-progress.md",
    );
    const blockedTasksPath = resolve(
      __dirname,
      "../../../../specs/feature/021-CanvasEditor/implementation-blocked-tasks.md",
    );

    const progress = readFileSync(progressPath, "utf8");
    const blockedTasks = readFileSync(blockedTasksPath, "utf8");

    expect(blockedTasks).toContain("dropped-with-rationale");
    expect(progress).not.toContain("(blocked)");
    expect(progress).toContain("dropped-with-rationale");
  });

  it("passes simulated restore consistency checks for sample deck recovery", () => {
    const result = evaluatePresentationPostMigrationConsistency({
      slideCountRows: [{ deckId: 902, persistedSlideCount: 2, actualSlideCount: 2 }],
      orderRows: [{ deckId: 902, orderIndexes: [0, 1] }],
      byteTotalRows: [{ deckId: 902, persistedTotalBytes: 10240, summedAssetBytes: 10240 }],
      orphanAssetLinkIds: [],
      staleObjectKeys: [],
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("triggers rollback recommendation when canary abort thresholds are breached", () => {
    const abort = evaluatePresentationCanaryAbort({
      stage: "ramp_50",
      conflictRatePercent: 6.2,
      exportFailureRatePercent: 4.7,
      degradationWarningRatePercent: 18,
      queueP95Seconds: 88,
      autosaveP95Ms: 1760,
    });

    expect(abort.shouldAbort).toBe(true);
    expect(abort.reasons).toContain("conflict_rate_exceeded");
    expect(abort.reasons).toContain("export_failure_rate_exceeded");
    expect(abort.reasons).toContain("autosave_latency_exceeded");
    expect(abort.rollbackScope).toBe("global_editor_disable");
  });

  it("detects post-deploy anomalies in slide order and orphan asset links", () => {
    const result = evaluatePresentationPostMigrationConsistency({
      slideCountRows: [{ deckId: 903, persistedSlideCount: 3, actualSlideCount: 2 }],
      orderRows: [{ deckId: 903, orderIndexes: [0, 2] }],
      byteTotalRows: [{ deckId: 903, persistedTotalBytes: 1000, summedAssetBytes: 1000 }],
      orphanAssetLinkIds: [7001],
      staleObjectKeys: [],
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("slide_count_mismatch:903");
    expect(result.failures).toContain("order_invariant_failed:903");
    expect(result.failures).toContain("orphan_asset_links_detected");
  });
});
