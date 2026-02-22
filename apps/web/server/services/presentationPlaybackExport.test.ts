import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import { PresentationServiceError } from "./presentationService";
import {
  buildPresentationRenderSpec,
  buildSlideshowPayload,
  resetPresentationExportStateForTests,
  triggerPresentationExport,
} from "./presentationPlaybackExport";

const actor = {
  userId: 9,
  tenantId: "tenant-1",
  role: "user",
} as const;

function buildDeckDetail(overrides?: Partial<Record<string, unknown>>) {
  return {
    deck: {
      id: 101,
      tenantId: "tenant-1",
      libraryItemId: 44,
      title: "Roadmap",
      description: null,
      version: 3,
      slideCount: 2,
      totalAssetBytes: 0,
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    },
    slides: [
      {
        id: 2,
        deckId: 101,
        orderIndex: 1,
        version: 1,
        title: "Second",
        slideContent: { elements: [], transition: "fade", durationMs: 2500 },
        notes: null,
        createdAt: new Date("2026-02-22T10:00:00.000Z"),
        updatedAt: new Date("2026-02-22T10:00:00.000Z"),
      },
      {
        id: 1,
        deckId: 101,
        orderIndex: 0,
        version: 1,
        title: "First",
        slideContent: { elements: [] },
        notes: null,
        createdAt: new Date("2026-02-22T10:00:00.000Z"),
        updatedAt: new Date("2026-02-22T10:00:00.000Z"),
      },
    ],
    assets: [],
    ...overrides,
  };
}

describe("presentationPlaybackExport", () => {
  beforeEach(() => {
    resetPresentationExportStateForTests();
    vi.clearAllMocks();
  });

  it("builds deterministic slideshow payload order and default durations", () => {
    const payload = buildSlideshowPayload(buildDeckDetail().slides as any, {
      defaultDurationMs: 3000,
    });

    expect(payload.schemaVersion).toBe("presentation_slideshow_v1");
    expect(payload.slides.map((slide) => slide.slideId)).toEqual([1, 2]);
    expect(payload.slides.map((slide) => slide.durationMs)).toEqual([3000, 2500]);
    expect(payload.slides.map((slide) => slide.transition)).toEqual(["cut", "fade"]);
  });

  it("rejects unsupported transitions before enqueue", async () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Bad transition",
          slideContent: { elements: [], transition: "wipe" },
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "req-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn(),
          now: () => 1_000,
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
        && error.message.includes("transition")
      );
    });
  });

  it("includes schema_version in render spec and rejects unknown versions", async () => {
    const deckDetail = buildDeckDetail();
    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "mp4",
    });

    expect(renderSpec.schemaVersion).toBe("presentation_render_v1");

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "req-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn(),
          now: () => 2_000,
          acceptedRenderSchemaVersions: ["presentation_render_v0"],
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.RENDER_SCHEMA_MISMATCH
      );
    });
  });

  it("dedupes duplicate export requests within the dedupe window", async () => {
    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-1" });
    const deckDetail = buildDeckDetail();
    let now = 10_000;

    const first = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "click-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => now,
      },
    );

    now += 1_000;

    const second = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "click-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => now,
      },
    );

    expect(enqueueExportJob).toHaveBeenCalledTimes(1);
    expect(first.exportId).toBe(second.exportId);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
  });

  it("enforces per-user and per-deck throttles with stable retry semantics", async () => {
    const deckDetail = buildDeckDetail();
    let now = 20_000;

    const dependencies = {
      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
      enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-throttle" }),
      now: () => now,
      maxUserRequestsPerMinute: 2,
      maxDeckRequestsPerMinute: 2,
    };

    await triggerPresentationExport({ deckId: 101, format: "mp4", idempotencyKey: "a" }, actor, dependencies);
    now += 1_000;
    await triggerPresentationExport({ deckId: 101, format: "mp4", idempotencyKey: "b" }, actor, dependencies);
    now += 1_000;

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "c" },
        actor,
        dependencies,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED
        && typeof (error.details as any)?.retryAfterSeconds === "number"
      );
    });
  });
});
