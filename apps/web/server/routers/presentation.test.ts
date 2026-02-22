import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { TRPCError } from "@trpc/server";

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

const serviceMocks = vi.hoisted(() => ({
  getPresentationDeckDetail: vi.fn(),
  createPresentationDeckForLibraryItem: vi.fn(),
  attachAssetToDeck: vi.fn(),
  updateSlideInDeck: vi.fn(),
}));

const templateServiceMocks = vi.hoisted(() => ({
  applyTemplateAssetToDeck: vi.fn(),
}));

const compatibilityMocks = vi.hoisted(() => ({
  getPresentationCompatibilityOpen: vi.fn(),
  convertOfficeSourceToPresentation: vi.fn(),
}));

const playbackMocks = vi.hoisted(() => ({
  buildSlideshowPayload: vi.fn(),
  triggerPresentationExport: vi.fn(),
  getPresentationExportStatus: vi.fn(),
}));

vi.mock("../services/presentationService", async () => {
  const actual = await vi.importActual<any>("../services/presentationService");
  return {
    ...actual,
    getPresentationDeckDetail: serviceMocks.getPresentationDeckDetail,
    createPresentationDeckForLibraryItem: serviceMocks.createPresentationDeckForLibraryItem,
    attachAssetToDeck: serviceMocks.attachAssetToDeck,
    updateSlideInDeck: serviceMocks.updateSlideInDeck,
  };
});

vi.mock("../services/presentationCompatibilityService", () => ({
  getPresentationCompatibilityOpen: compatibilityMocks.getPresentationCompatibilityOpen,
  convertOfficeSourceToPresentation: compatibilityMocks.convertOfficeSourceToPresentation,
}));

vi.mock("../services/presentationPlaybackExport", () => ({
  buildSlideshowPayload: playbackMocks.buildSlideshowPayload,
  triggerPresentationExport: playbackMocks.triggerPresentationExport,
  getPresentationExportStatus: playbackMocks.getPresentationExportStatus,
}));

vi.mock("../services/presentationTemplateService", () => ({
  applyTemplateAssetToDeck: templateServiceMocks.applyTemplateAssetToDeck,
}));

import { presentationRouter } from "./presentation";
import { PresentationServiceError } from "../services/presentationService";
import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_EDITOR_ROUTE_BASE,
} from "@shared/presentation/constants";

describe("presentationRouter", () => {
  beforeEach(() => {
    delete process.env.PRESENTATION_EDITOR_ENABLED;
    delete process.env.PRESENTATION_EXPORTS_ENABLED;
    vi.clearAllMocks();
    compatibilityMocks.getPresentationCompatibilityOpen.mockResolvedValue({
      schemaVersion: "presentation_compatibility_v1",
      mode: "read_only",
      itemId: 42,
      sourceFormat: "pptx",
      canConvert: true,
      guidance: "Open read-only and convert when ready.",
      partialFidelity: false,
      fidelityWarnings: [],
    });
    compatibilityMocks.convertOfficeSourceToPresentation.mockResolvedValue({
      schemaVersion: "presentation_conversion_v1",
      sourceItemId: 42,
      sourceFormat: "pptx",
      conversionStatus: "created",
      partialFidelity: false,
      fidelityWarnings: [],
      deckLibraryItemId: 77,
      deckId: 88,
    });
    playbackMocks.buildSlideshowPayload.mockReturnValue({
      schemaVersion: "presentation_slideshow_v1",
      deckId: 88,
      generatedAt: new Date(),
      slides: [],
    });
    playbackMocks.triggerPresentationExport.mockResolvedValue({
      schemaVersion: "presentation_export_v1",
      exportId: "exp-1",
      jobId: "job-1",
      deckId: 88,
      format: "mp4",
      deduped: false,
      status: "queued",
      renderSpec: {
        schemaVersion: "presentation_render_v1",
        deckId: 88,
        format: "mp4",
        width: 1920,
        height: 1080,
        fps: 30,
        slides: [],
      },
    });
    playbackMocks.getPresentationExportStatus.mockResolvedValue({
      schemaVersion: "presentation_export_v1",
      exportId: "exp-1",
      jobId: "job-1",
      status: "queued",
      format: "mp4",
      updatedAt: new Date(),
    });
  });

  it("returns disabled availability when feature flag is off", async () => {
    process.env.PRESENTATION_EDITOR_ENABLED = "false";

    const fn = presentationRouter.availability as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
    });

    expect(result.enabled).toBe(false);
    expect(result.errorCode).toBe(PRESENTATION_ERROR_CODE.FEATURE_DISABLED);
  });

  it("toggles editor guard decisions when feature flag is flipped", async () => {
    process.env.PRESENTATION_EDITOR_ENABLED = "false";

    const guardFn = presentationRouter.guardEditorOpen as Function;
    const blocked = await guardFn({
      ctx: { user: { id: 1 } },
      input: { itemId: 42, itemType: "presentation" },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.errorCode).toBe(PRESENTATION_ERROR_CODE.FEATURE_DISABLED);

    process.env.PRESENTATION_EDITOR_ENABLED = "true";
    const allowed = await guardFn({
      ctx: { user: { id: 1 } },
      input: { itemId: 42, itemType: "presentation" },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.editorRoute).toBe("/presentation-editor/42");
  });

  it("allows presentation items and returns deterministic editor route", async () => {
    const fn = presentationRouter.guardEditorOpen as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
      input: { itemId: 42, itemType: "presentation" },
    });

    expect(result).toEqual({
      allowed: true,
      itemId: 42,
      editorRoute: `${PRESENTATION_EDITOR_ROUTE_BASE}/42`,
    });
  });

  it("returns deterministic wrong-item guard with recovery CTA", async () => {
    const fn = presentationRouter.guardEditorOpen as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
      input: { itemId: 7, itemType: "document" },
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe(PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH);
    expect(result.recoveryCta).toEqual({
      label: "Open in Document Management",
      href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=7",
    });
  });

  it("forwards tenant-scoped actor when creating a deck", async () => {
    serviceMocks.createPresentationDeckForLibraryItem.mockResolvedValue({
      created: true,
      deck: { id: 8, libraryItemId: 42 },
    });

    const fn = presentationRouter.createDeck as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 77, role: "user" } },
      input: { libraryItemId: 42, title: "Deck A" },
    });

    expect(serviceMocks.createPresentationDeckForLibraryItem).toHaveBeenCalledWith(
      { libraryItemId: 42, title: "Deck A" },
      { userId: 77, tenantId: "tenant-1", role: "user" },
    );
    expect(result.created).toBe(true);
  });

  it("requires tenant context for deck endpoints", async () => {
    const fn = presentationRouter.getDeck as Function;

    await expect(
      fn({
        ctx: { tenantId: null, user: { id: 1 } },
        input: { deckId: 99 },
      }),
    ).rejects.toMatchObject({
      message: "Tenant context is required for presentation operations",
    });
  });

  it("maps service lifecycle restrictions to forbidden errors", async () => {
    serviceMocks.getPresentationDeckDetail.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED,
        `${PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED}: archived or deleted resources are read-only`,
      ),
    );

    const fn = presentationRouter.getDeck as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 5, role: "user" } },
        input: { deckId: 5 },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "FORBIDDEN" && error.message.includes(PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED);
    });
  });

  it("maps limit violations to deterministic bad-request errors", async () => {
    serviceMocks.attachAssetToDeck.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED,
        `${PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED}: max deck size is 104857600 bytes`,
      ),
    );

    const fn = presentationRouter.attachAsset as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 4, expectedVersion: 1, libraryItemId: 77, byteSize: 1024 },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "BAD_REQUEST" && error.message.includes(PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED);
    });
  });

  it("returns read-only compatibility contract for office sources", async () => {
    const fn = presentationRouter.compatibilityOpen as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { itemId: 42 },
    });

    expect(compatibilityMocks.getPresentationCompatibilityOpen).toHaveBeenCalledWith(
      42,
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.mode).toBe("read_only");
    expect(result.sourceFormat).toBe("pptx");
    expect(result.canConvert).toBe(true);
  });

  it("converts office source with idempotency key through service layer", async () => {
    const fn = presentationRouter.convertSource as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { sourceItemId: 42, idempotencyKey: "request-1" },
    });

    expect(compatibilityMocks.convertOfficeSourceToPresentation).toHaveBeenCalledWith(
      { sourceItemId: 42, idempotencyKey: "request-1" },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.conversionStatus).toBe("created");
    expect(result.deckId).toBe(88);
  });

  it("returns conflict payload with stable schema version for stale expectedVersion", async () => {
    const conflictPayload = {
      conflictSchemaVersion: "presentation_conflict_v1",
      reasonCode: "SLIDE_VERSION_MISMATCH",
      expectedVersion: 2,
      latestDeckVersion: 4,
      latestSlideVersion: 7,
      deckId: 9,
      slideId: 12,
      saveMode: "manual",
      latestDeck: {
        id: 9,
        version: 4,
        slideCount: 3,
        totalAssetBytes: 2048,
        updatedAt: new Date(),
      },
      latestSlide: {
        id: 12,
        deckId: 9,
        orderIndex: 1,
        version: 7,
        title: "Updated",
        slideContent: {},
        notes: null,
        updatedAt: new Date(),
      },
    } as const;

    serviceMocks.updateSlideInDeck.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
        `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: expected slide version 2 but latest is 7`,
        { conflict: conflictPayload },
      ),
    );

    const fn = presentationRouter.updateSlide as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: {
          deckId: 9,
          slideId: 12,
          expectedVersion: 2,
          saveMode: "manual",
          title: "Draft",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "CONFLICT" && (error.cause as any)?.conflictSchemaVersion === "presentation_conflict_v1";
    });

    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: {
          deckId: 9,
          slideId: 12,
          expectedVersion: 2,
          saveMode: "autosave",
          title: "Draft",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "CONFLICT" && (error.cause as any)?.reasonCode === "SLIDE_VERSION_MISMATCH";
    });
  });

  it("blocks export writes when export-write flag is disabled while keeping read routes available", async () => {
    process.env.PRESENTATION_EXPORTS_ENABLED = "false";
    serviceMocks.getPresentationDeckDetail.mockResolvedValue({
      deck: { id: 88, libraryItemId: 42 },
      slides: [],
      assets: [],
    });

    const triggerFn = presentationRouter.triggerExport as Function;
    await expect(
      triggerFn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 88, format: "mp4", idempotencyKey: "req-1" },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "FORBIDDEN" && error.message.includes(PRESENTATION_ERROR_CODE.FEATURE_DISABLED);
    });

    const slideshowFn = presentationRouter.getSlideshow as Function;
    const slideshow = await slideshowFn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88 },
    });

    expect(playbackMocks.triggerPresentationExport).not.toHaveBeenCalled();
    expect(playbackMocks.buildSlideshowPayload).toHaveBeenCalledTimes(1);
    expect(slideshow.schemaVersion).toBe("presentation_slideshow_v1");
  });

  it("maps template apply permission denials to deterministic forbidden errors", async () => {
    templateServiceMocks.applyTemplateAssetToDeck.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
        `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: template attach is tenant scoped`,
      ),
    );

    const fn = presentationRouter.applyTemplate as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 88, expectedVersion: 3, templateAssetLibraryItemId: 9101 },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return (
        error.code === "FORBIDDEN"
        && error.message.includes(PRESENTATION_ERROR_CODE.PERMISSION_DENIED)
      );
    });
  });

  it("forwards tenant-scoped actor to template apply service", async () => {
    templateServiceMocks.applyTemplateAssetToDeck.mockResolvedValue({
      applied: true,
      idempotent: false,
      link: {
        id: 1,
        tenantId: "tenant-1",
        deckId: 88,
        slideId: null,
        libraryItemId: 9101,
        byteSize: 2048,
        createdAt: new Date(),
      },
    });

    const fn = presentationRouter.applyTemplate as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 77, role: "user" } },
      input: { deckId: 88, expectedVersion: 3, templateAssetLibraryItemId: 9101 },
    });

    expect(templateServiceMocks.applyTemplateAssetToDeck).toHaveBeenCalledWith(
      { deckId: 88, expectedVersion: 3, templateAssetLibraryItemId: 9101 },
      { userId: 77, tenantId: "tenant-1", role: "user" },
    );
  });
});

describe("presentation router registration", () => {
  it("registers presentation router without removing existing namespaces", () => {
    const routersFile = path.resolve(import.meta.dirname, "../routers.ts");
    const source = fs.readFileSync(routersFile, "utf-8");

    expect(source).toContain("presentation: presentationRouter");
    expect(source).toContain("library: libraryRouter");
    expect(source).toContain("videoEditorProjects: videoEditorProjectsRouter");
  });
});
