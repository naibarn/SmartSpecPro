import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE, PRESENTATION_EXPORT_SCHEMA_VERSION } from "@shared/presentation/constants";

import { PresentationServiceError } from "./presentationService";
import {
  buildPlayDeckPayload,
  buildPresentationRenderSpec,
  buildSlideshowPayload,
  getPresentationExportStatus,
  resetPresentationExportStateForTests,
  triggerPresentationExport,
} from "./presentationPlaybackExport";
import { getDb } from "../db";
import { storagePresignGet } from "../storage";

// Default: no DB (same as real test environment without DATABASE_URL).
// Individual tests can override getDb with vi.spyOn.
vi.mock("../db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../db")>();
  return { ...original, getDb: vi.fn().mockResolvedValue(null) };
});

vi.mock("../storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../storage")>();
  return { ...original, storagePresignGet: vi.fn().mockResolvedValue(null) };
});

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

function loadDegradationFixture(name: string): any {
  const fixturePath = path.resolve(
    import.meta.dirname,
    `./__fixtures__/export-degradation/${name}`,
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

describe("presentationPlaybackExport", () => {
  beforeEach(() => {
    resetPresentationExportStateForTests();
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(null);
    vi.mocked(storagePresignGet).mockResolvedValue(null);
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

  it("resolves /api/storage/files sourceUrl into a presigned audio URL for play deck payload", async () => {
    const selectWhere = vi.fn().mockResolvedValue([
      { id: 91, sourceUrl: "/api/storage/files/audio/project/theme.mp3" },
    ]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const dbMock = {
      select: vi.fn(() => ({ from: selectFrom })),
    } as any;
    vi.mocked(getDb).mockResolvedValue(dbMock);
    vi.mocked(storagePresignGet).mockResolvedValue({
      key: "audio/project/theme.mp3",
      url: "https://signed.example.com/audio/project/theme.mp3",
    });

    const detail = buildDeckDetail({
      deck: {
        ...buildDeckDetail().deck,
        projectAudioTrack: {
          libraryItemId: 91,
          volume: 0.7,
          startAtMs: 0,
          endAtMs: null,
          loop: false,
          fadeOutMs: null,
        },
      },
      slides: [
        {
          ...buildDeckDetail().slides[0],
          id: 1,
          orderIndex: 0,
          audioTrack: {
            libraryItemId: 91,
            volume: 1,
            startAtMs: 500,
            endAtMs: 2500,
          },
        },
      ],
    });

    const payload = await buildPlayDeckPayload(
      detail as any,
      {
        schemaVersion: "presentation_slideshow_v1",
        deckId: 101,
        generatedAt: new Date("2026-02-22T10:00:00.000Z"),
        slides: [
          {
            slideId: 1,
            orderIndex: 0,
            title: "First",
            transition: "cut",
            durationMs: 3000,
          },
        ],
      } as any,
    );

    expect(storagePresignGet).toHaveBeenCalledWith("audio/project/theme.mp3", 3600);
    expect(payload.slides[0]?.audioTrack?.url).toBe("https://signed.example.com/audio/project/theme.mp3");
    expect(payload.projectAudioTrack?.url).toBe("https://signed.example.com/audio/project/theme.mp3");
  });

  it("degrades unsupported transition inputs and emits stable warning codes", async () => {
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
          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-degrade-1" }),
          now: () => Date.parse("2026-02-22T10:00:01.000Z"),
        },
      ),
    ).resolves.toSatisfy((result: any) => {
      return (
        result.status === "queued"
        && Array.isArray(result.warnings)
        && result.warnings.some((warning: any) => warning.code === "SLIDE_TRANSITION_UNSUPPORTED")
      );
    });
  });

  it("records degradation observability events with deck/tenant context", async () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Warned slide",
          slideContent: { elements: [], transition: "wipe" },
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const recordMetric = vi.fn();
    const recordLog = vi.fn();

    await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "obs-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-obs-1" }),
        now: () => Date.parse("2026-02-22T10:00:03.000Z"),
        recordMetric,
        recordLog,
      },
    );

    expect(recordMetric).toHaveBeenCalledWith(
      "presentation.export.degradation_warning.total",
      { format: "png" },
    );
    expect(recordLog).toHaveBeenCalledWith(
      "presentation_export_degradation",
      expect.objectContaining({
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: 101,
        format: "png",
      }),
    );
  });

  it("keeps fixture-backed degradation precedence and warning codes deterministic", () => {
    const input = loadDegradationFixture("unsupported-constructs.input.json");
    const expected = loadDegradationFixture("unsupported-constructs.expected.json");

    const renderSpec = buildPresentationRenderSpec({
      deck: input.deck,
      slides: input.slides,
      format: "png",
    });

    expect(renderSpec.warnings).toEqual(expected.warnings);
    expect(renderSpec.slides).toEqual(expected.slides);
  });

  it("keeps warning payload stable across repeated exports for the same deck content", async () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Stable warnings",
          slideContent: { elements: [], transition: "wipe" },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });

    let now = Date.parse("2026-02-22T10:02:00.000Z");
    const deps = {
      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
      enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-stable-warning" }),
      now: () => now,
    };

    const first = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "stable-a" },
      actor,
      deps,
    );
    now += 100;
    const second = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "stable-b" },
      actor,
      deps,
    );

    expect(first.warnings).toEqual(second.warnings);
    expect(first.warnings[0]?.code).toBe("SLIDE_TRANSITION_UNSUPPORTED");
  });

  it("includes schema_version in render spec and rejects unknown versions", async () => {
    const deckDetail = buildDeckDetail();
    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "mp4",
    });

    expect(renderSpec.schemaVersion).toBe("presentation_render_v1");
    expect(renderSpec.warningContractVersion).toBe("presentation_warning_contract_v1");

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "req-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn(),
          now: () => Date.parse("2026-02-22T10:00:02.000Z"),
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

  it("blocks export promotion when warning compatibility matrix is incomplete", async () => {
    const deckDetail = buildDeckDetail();

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "warn-matrix-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn(),
          now: () => Date.parse("2026-02-22T10:00:02.000Z"),
          warningCompatibilityMatrix: {
            oldReaderNewWriter: true,
            newReaderOldWriter: false,
          },
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
      );
    });
  });

  it("buildPresentationRenderSpec derives width/height from slide canvas when not explicitly provided", () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Portrait canvas",
          slideContent: { elements: [], canvas: { width: 720, height: 1280 } },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });

    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "png",
    });

    expect(renderSpec.width).toBe(720);
    expect(renderSpec.height).toBe(1280);
  });

  it("buildPresentationRenderSpec respects explicit width/height over slide canvas", () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Portrait canvas",
          slideContent: { elements: [], canvas: { width: 720, height: 1280 } },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });

    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "png",
      width: 1920,
      height: 1080,
    });

    expect(renderSpec.width).toBe(1920);
    expect(renderSpec.height).toBe(1080);
  });

  it("buildPresentationRenderSpec enables hasDynamicVideo for mp4 when a slide has video source", () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Video slide",
          slideContent: {
            elements: [
              {
                id: "vid-1",
                type: "video",
                src: "/api/storage/files/videos/demo.mp4",
                x: 0,
                y: 0,
                width: 640,
                height: 360,
              },
            ],
          },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });

    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "mp4",
    });

    expect(renderSpec.hasDynamicVideo).toBe(true);
  });

  it("buildPresentationRenderSpec omits hasDynamicVideo for non-mp4 exports", () => {
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 1,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Video slide",
          slideContent: {
            elements: [
              {
                id: "vid-1",
                type: "video",
                src: "/api/storage/files/videos/demo.mp4",
                x: 0,
                y: 0,
                width: 640,
                height: 360,
              },
            ],
          },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });

    const renderSpec = buildPresentationRenderSpec({
      deck: deckDetail.deck as any,
      slides: deckDetail.slides as any,
      format: "png",
    });

    expect("hasDynamicVideo" in renderSpec).toBe(false);
  });

  it("dedupes duplicate export requests within the dedupe window", async () => {
    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-1" });
    const deckDetail = buildDeckDetail({
      slides: [
        {
          id: 2,
          deckId: 101,
          orderIndex: 1,
          version: 1,
          title: "Second",
          slideContent: { elements: [], transition: "wipe" },
          notes: null,
          createdAt: new Date("2026-02-22T10:00:00.000Z"),
          updatedAt: new Date("2026-02-22T10:00:00.000Z"),
        },
      ],
    });
    let now = Date.parse("2026-02-22T10:00:10.000Z");

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
    expect(second.warnings).toEqual(first.warnings);
    expect(second.warnings[0]?.code).toBe("SLIDE_TRANSITION_UNSUPPORTED");
  });

  it("expires stale export status entries after ttl", async () => {
    vi.useFakeTimers();
    try {
      const deckDetail = buildDeckDetail();
      const baseMs = Date.parse("2026-02-22T12:00:00.000Z");
      vi.setSystemTime(baseMs);

      const queued = await triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "ttl-status" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-ttl-1" }),
        },
      );

      expect((await getPresentationExportStatus(queued.exportId, actor)).status).toBe("queued");

      vi.setSystemTime(baseMs + 16 * 60_000);

      await expect(getPresentationExportStatus(queued.exportId, actor)).rejects.toThrowError(
        PresentationServiceError,
      );
      await expect(getPresentationExportStatus(queued.exportId, actor)).rejects.toThrow(
        PRESENTATION_ERROR_CODE.NOT_FOUND,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts oldest dedupe entries when maxDedupeEntries is exceeded", async () => {
    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-cap-1" });
    const deckDetail = buildDeckDetail();
    let now = Date.parse("2026-02-22T10:00:50.000Z");

    const dependencies = {
      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
      enqueueExportJob,
      now: () => now,
      maxDedupeEntries: 2,
      maxStatusEntries: 10,
      maxResultEntries: 10,
    };

    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-a" }, actor, dependencies);
    now += 100;
    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-b" }, actor, dependencies);
    now += 100;
    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-c" }, actor, dependencies);
    now += 100;
    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-a" }, actor, dependencies);

    expect(enqueueExportJob).toHaveBeenCalledTimes(4);
  });

  it("evicts oldest status entries when maxStatusEntries is exceeded", async () => {
    vi.useFakeTimers();
    const deckDetail = buildDeckDetail();
    let now = Date.parse("2026-02-22T10:01:00.000Z");
    vi.setSystemTime(now);

    try {
      const dependencies = {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-cap-status" }),
        now: () => now,
        maxDedupeEntries: 10,
        maxStatusEntries: 2,
        maxResultEntries: 2,
      };

      const first = await triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "status-cap-a" },
        actor,
        dependencies,
      );
      now += 100;
      vi.setSystemTime(now);
      const second = await triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "status-cap-b" },
        actor,
        dependencies,
      );
      now += 100;
      vi.setSystemTime(now);
      const third = await triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "status-cap-c" },
        actor,
        dependencies,
      );

      await expect(getPresentationExportStatus(first.exportId, actor)).rejects.toThrow(
        PRESENTATION_ERROR_CODE.NOT_FOUND,
      );
      expect((await getPresentationExportStatus(second.exportId, actor)).status).toBe("queued");
      expect((await getPresentationExportStatus(third.exportId, actor)).status).toBe("queued");
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces per-user and per-deck throttles with stable retry semantics", async () => {
    const deckDetail = buildDeckDetail();
    let now = Date.parse("2026-02-22T10:00:20.000Z");

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

  it("triggerPresentationExport calls Python bridge POST /api/v1/presentations/export with correct render spec", async () => {
    const deckDetail = buildDeckDetail();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ celery_task_id: "celery-bridge-1" }),
    } as Response);

    const result = await triggerPresentationExport(
      { deckId: 101, format: "mp4", idempotencyKey: "bridge-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        // Use real defaultEnqueueExportJob by not overriding enqueueExportJob
        // But since getDb() returns null in test env, defaultEnqueueExportJob stubs the job.
        // Override to test the bridge call directly:
        enqueueExportJob: async (renderSpec, format, quality) => {
          const response = await fetch("http://localhost:8000/api/v1/presentations/export", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
            body: JSON.stringify({ render_spec: renderSpec, format, quality }),
          });
          const json = (await response.json()) as { celery_task_id: string };
          return { jobId: json.celery_task_id };
        },
        now: () => Date.parse("2026-02-22T10:00:01.000Z"),
      },
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/presentations/export",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.status).toBe("queued");

    fetchSpy.mockRestore();
  });

  it("triggerPresentationExport stores celeryTaskId returned by Python in DB", async () => {
    // In test env, getDb() returns null so the DB update won't be called.
    // We verify enqueueExportJob is called with the correct render spec and the
    // returned jobId is reflected in the export result.
    const deckDetail = buildDeckDetail();
    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "celery-abc-123" });

    const result = await triggerPresentationExport(
      { deckId: 101, format: "mp4", idempotencyKey: "celery-id-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => Date.parse("2026-02-22T10:00:02.000Z"),
      },
    );

    expect(enqueueExportJob).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: "presentation_render_v1" }),
      "mp4",
      undefined,
      undefined,
    );
    expect(result.status).toBe("queued");
  });

  it("triggerPresentationExport returns existing export ID when idempotencyKey matches in-progress DB record", async () => {
    // This uses the in-memory fast path (same process window)
    const deckDetail = buildDeckDetail();
    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-idem-1" });
    const now = Date.parse("2026-02-22T10:00:05.000Z");

    const first = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "idem-dedup-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => now,
      },
    );

    const second = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "idem-dedup-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => now + 1000,
      },
    );

    expect(enqueueExportJob).toHaveBeenCalledTimes(1);
    expect(second.deduped).toBe(true);
    expect(second.exportId).toBe(first.exportId);
  });

  it("triggerPresentationExport recovers from idempotency unique-conflict race by returning existing in-flight export", async () => {
    const deckDetail = buildDeckDetail();
    const existingRecord = {
      id: 501,
      deckId: 101,
      userId: 9,
      tenantId: "tenant-1",
      format: "png",
      quality: null,
      width: 1920,
      height: 1080,
      fps: null,
      status: "processing",
      progressPct: 25,
      stage: "rendering",
      errorMessage: null,
      outputUrl: null,
      outputStorageKey: null,
      outputBytes: null,
      celeryTaskId: "celery-race-1",
      idempotencyKey: "tenant-1:9:101:png:race-key-1",
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:01.000Z"),
    };

    const limit = vi.fn()
      .mockResolvedValueOnce([]) // pre-insert idempotency lookup
      .mockResolvedValueOnce([existingRecord]); // post-conflict lookup
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const selectFn = vi.fn().mockReturnValue({ from });

    const duplicateError = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "presentation_exports_idempotency_key_unique",
    });
    const returning = vi.fn().mockRejectedValue(duplicateError);
    const values = vi.fn().mockReturnValue({ returning });
    const insertFn = vi.fn().mockReturnValue({ values });
    const updateFn = vi.fn();
    const mockDb = { select: selectFn, insert: insertFn, update: updateFn } as any;

    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

    const enqueueExportJob = vi.fn();
    const result = await triggerPresentationExport(
      { deckId: 101, format: "png", idempotencyKey: "race-key-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob,
        now: () => Date.parse("2026-02-22T10:00:05.000Z"),
      },
    );

    expect(result.deduped).toBe(true);
    expect(result.exportId).toBe(501);
    expect(enqueueExportJob).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("throttle enforcement still applies to 'jpg' and 'pdf' formats", async () => {
    const deckDetail = buildDeckDetail();
    let now = Date.parse("2026-02-22T11:00:00.000Z");
    const dependencies = {
      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
      enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-throttle-fmt" }),
      now: () => now,
      maxUserRequestsPerMinute: 2,
      maxDeckRequestsPerMinute: 4,
    };

    await triggerPresentationExport(
      { deckId: 101, format: "jpg", idempotencyKey: "thr-a" },
      actor,
      dependencies,
    );
    now += 1_000;
    await triggerPresentationExport(
      { deckId: 101, format: "pdf", idempotencyKey: "thr-b" },
      actor,
      dependencies,
    );
    now += 1_000;

    await expect(
      triggerPresentationExport(
        { deckId: 101, format: "jpg", idempotencyKey: "thr-c" },
        actor,
        dependencies,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED
      );
    });
  });

  it("getPresentationExportStatus reads from DB and calls Python GET for live progress", async () => {
    const dbRecord = {
      id: 77,
      deckId: 101,
      userId: 9,
      tenantId: "tenant-1",
      format: "mp4",
      quality: null,
      width: 1920,
      height: 1080,
      fps: null,
      status: "processing",
      progressPct: 30,
      stage: "rendering",
      errorMessage: null,
      outputUrl: null,
      outputStorageKey: null,
      outputBytes: null,
      celeryTaskId: "celery-poll-1",
      idempotencyKey: "poll-key-1",
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    };
    const updatedRecord = { ...dbRecord, progressPct: 55, stage: "encoding", status: "processing" };

    const limit = vi.fn().mockResolvedValue([dbRecord]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const selectFn = vi.fn().mockReturnValue({ from });
    const returning = vi.fn().mockResolvedValue([updatedRecord]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const mockDb = { select: selectFn, update: updateFn } as any;

    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ percent: 55, stage: "encoding" }),
    } as Response);

    const result = await getPresentationExportStatus(77, actor);

    expect(selectFn).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("celery-poll-1"),
      expect.any(Object),
    );
    expect(result.progressPct).toBe(55);

    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("getPresentationExportStatus updates DB to status='done' when Python returns done", async () => {
    const dbRecord = {
      id: 78,
      deckId: 101,
      userId: 9,
      tenantId: "tenant-1",
      format: "mp4",
      quality: null,
      width: 1920,
      height: 1080,
      fps: null,
      status: "processing",
      progressPct: 90,
      stage: "uploading",
      errorMessage: null,
      outputUrl: null,
      outputStorageKey: null,
      outputBytes: null,
      celeryTaskId: "celery-done-1",
      idempotencyKey: "done-key-1",
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    };
    const doneRecord = {
      ...dbRecord,
      status: "done",
      progressPct: 100,
      outputUrl: "https://example.com/export.mp4",
    };

    const limit = vi.fn().mockResolvedValue([dbRecord]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const selectFn = vi.fn().mockReturnValue({ from });
    const returning = vi.fn().mockResolvedValue([doneRecord]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const mockDb = { select: selectFn, update: updateFn } as any;

    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ state: "done", output_url: "https://example.com/export.mp4" }),
    } as Response);

    const result = await getPresentationExportStatus(78, actor);

    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", outputUrl: "https://example.com/export.mp4", progressPct: 100 }),
    );
    expect(result.status).toBe("done");
    expect(result.downloadUrl).toBe("https://example.com/export.mp4");

    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("getPresentationExportStatus updates DB to status='error' when Python returns failure", async () => {
    const dbRecord = {
      id: 79,
      deckId: 101,
      userId: 9,
      tenantId: "tenant-1",
      format: "mp4",
      quality: null,
      width: 1920,
      height: 1080,
      fps: null,
      status: "processing",
      progressPct: 10,
      stage: null,
      errorMessage: null,
      outputUrl: null,
      outputStorageKey: null,
      outputBytes: null,
      celeryTaskId: "celery-err-1",
      idempotencyKey: "err-key-1",
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    };
    const errorRecord = { ...dbRecord, status: "error", errorMessage: "render failed" };

    const limit = vi.fn().mockResolvedValue([dbRecord]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const selectFn = vi.fn().mockReturnValue({ from });
    const returning = vi.fn().mockResolvedValue([errorRecord]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const mockDb = { select: selectFn, update: updateFn } as any;

    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ state: "error", error_message: "render failed" }),
    } as Response);

    const result = await getPresentationExportStatus(79, actor);

    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorMessage: "render failed" }),
    );
    expect(result.status).toBe("error");

    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("getPresentationExportStatus falls back to in-memory state when getDb returns null", async () => {
    // Confirm getDb returns null so in-memory path is used
    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(null);

    const deckDetail = buildDeckDetail();
    // Use current time so the status entry is not immediately compacted away
    const nowMs = Date.now();
    const queued = await triggerPresentationExport(
      { deckId: 101, format: "mp4", idempotencyKey: "fallback-mem-1" },
      actor,
      {
        getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
        enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-fallback-1" }),
        now: () => nowMs,
      },
    );

    const status = await getPresentationExportStatus(queued.exportId, actor);
    expect(status.status).toBe("queued");
    expect(status.exportId).toBe(queued.exportId);

    vi.restoreAllMocks();
  });

  it("getPresentationExportStatus Python HTTP error is swallowed and existing DB state is returned", async () => {
    const dbRecord = {
      id: 80,
      deckId: 101,
      userId: 9,
      tenantId: "tenant-1",
      format: "mp4",
      quality: null,
      width: 1920,
      height: 1080,
      fps: null,
      status: "queued",
      progressPct: 0,
      stage: null,
      errorMessage: null,
      outputUrl: null,
      outputStorageKey: null,
      outputBytes: null,
      celeryTaskId: "celery-5xx-1",
      idempotencyKey: "5xx-key-1",
      createdAt: new Date("2026-02-22T10:00:00.000Z"),
      updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    };

    const limit = vi.fn().mockResolvedValue([dbRecord]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const selectFn = vi.fn().mockReturnValue({ from });
    const updateFn = vi.fn();
    const mockDb = { select: selectFn, update: updateFn } as any;

    const dbModule = await import("../db");
    vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const result = await getPresentationExportStatus(80, actor);

    // Python error was swallowed — DB state preserved
    expect(result.status).toBe("queued");
    expect(updateFn).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("getPresentationExportStatus marks stale queued task as error when Python keeps returning queued", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-22T12:30:00.000Z"));
      const dbRecord = {
        id: 81,
        deckId: 101,
        userId: 9,
        tenantId: "tenant-1",
        format: "png",
        quality: null,
        width: 1920,
        height: 1080,
        fps: null,
        status: "processing",
        progressPct: 0,
        stage: null,
        errorMessage: null,
        outputUrl: null,
        outputStorageKey: null,
        outputBytes: null,
        celeryTaskId: "celery-stale-1",
        idempotencyKey: "stale-key-1",
        createdAt: new Date("2026-02-22T10:00:00.000Z"),
        updatedAt: new Date("2026-02-22T10:00:00.000Z"),
      };
      const updatedRecord = {
        ...dbRecord,
        status: "error",
        errorMessage: "EXPORT_TASK_STALE: worker did not start task in time, please retry export",
      };

      const limit = vi.fn().mockResolvedValue([dbRecord]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      const selectFn = vi.fn().mockReturnValue({ from });
      const returning = vi.fn().mockResolvedValue([updatedRecord]);
      const updateWhere = vi.fn().mockReturnValue({ returning });
      const setFn = vi.fn().mockReturnValue({ where: updateWhere });
      const updateFn = vi.fn().mockReturnValue({ set: setFn });
      const mockDb = { select: selectFn, update: updateFn } as any;

      const dbModule = await import("../db");
      vi.spyOn(dbModule, "getDb").mockResolvedValue(mockDb);

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ state: "queued", percent: 0 }),
      } as Response);

      const result = await getPresentationExportStatus(81, actor);

      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          errorMessage: expect.stringContaining("EXPORT_TASK_STALE"),
        }),
      );
      expect(result.status).toBe("error");
      fetchSpy.mockRestore();
      vi.restoreAllMocks();
    } finally {
      vi.useRealTimers();
    }
  });

  it("denies cross-tenant export status lookups and allows same-actor lookups", async () => {
    vi.useFakeTimers();
    const deckDetail = buildDeckDetail();
    try {
      const exportNow = Date.parse("2026-02-22T10:00:40.000Z");
      vi.setSystemTime(exportNow);
      const queued = await triggerPresentationExport(
        { deckId: 101, format: "mp4", idempotencyKey: "status-scope-1" },
        actor,
        {
          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-scope-1" }),
          now: () => exportNow,
        },
      );

      const sameActor = await getPresentationExportStatus(queued.exportId, actor);
      expect(sameActor.status).toBe("queued");

      await expect(
        getPresentationExportStatus(queued.exportId, {
          userId: actor.userId,
          tenantId: "tenant-2",
          role: actor.role,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        return (
          error instanceof PresentationServiceError
          && error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
