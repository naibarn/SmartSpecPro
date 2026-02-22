import { beforeEach, describe, expect, it, vi } from "vitest";

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

const actor = {
  userId: 14,
  tenantId: "tenant-1",
  role: "user",
} as const;

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
        now: () => Date.parse("2026-02-22T11:00:50.000Z"),
      },
    );

    const exportStatus = getPresentationExportStatus(exportResult.exportId, actor);
    const reopenedSlideshow = buildSlideshowPayload(editedSlides as any, { deckId });

    expect(exportStatus.status).toBe("queued");
    expect(exportResult.renderSpec.slides[0].title).toBe("Edited title");
    expect(reopenedSlideshow.slides[0].title).toBe("Edited title");
    expect(reopenedSlideshow.slides[0].transition).toBe("fade");
  });
});
