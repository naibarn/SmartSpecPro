import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import { PresentationServiceError } from "./presentationService";
import {
  buildPresentationRenderSpec,
  buildSlideshowPayload,
  getPresentationExportStatus,
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

      expect(getPresentationExportStatus(queued.exportId, actor).status).toBe("queued");

      vi.setSystemTime(baseMs + 16 * 60_000);

      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrowError(
        PresentationServiceError,
      );
      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrow(
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

      expect(() => getPresentationExportStatus(first.exportId, actor)).toThrow(
        PRESENTATION_ERROR_CODE.NOT_FOUND,
      );
      expect(getPresentationExportStatus(second.exportId, actor).status).toBe("queued");
      expect(getPresentationExportStatus(third.exportId, actor).status).toBe("queued");
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

      const sameActor = getPresentationExportStatus(queued.exportId, actor);
      expect(sameActor.status).toBe("queued");

      try {
        getPresentationExportStatus(queued.exportId, {
          userId: actor.userId,
          tenantId: "tenant-2",
          role: actor.role,
        });
        throw new Error("Expected cross-tenant status lookup to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(PresentationServiceError);
        expect((error as PresentationServiceError).code).toBe(PRESENTATION_ERROR_CODE.PERMISSION_DENIED);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
