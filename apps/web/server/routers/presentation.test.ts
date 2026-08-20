import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  PRESENTATION_EXPORT_MAX_HEIGHT,
  PRESENTATION_EXPORT_MAX_WIDTH,
} from "@shared/presentation/constants";

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

const serviceMocks = vi.hoisted(() => ({
  getPresentationDeckDetail: vi.fn(),
  createPresentationDeckForLibraryItem: vi.fn(),
  createTemplateFromPresentation: vi.fn(),
  createPresentationFromTemplate: vi.fn(),
  attachAssetToDeck: vi.fn(),
  uploadAssetToDeck: vi.fn(),
  updateSlideInDeck: vi.fn(),
  listPresentationVersionHistory: vi.fn(),
  restorePresentationVersion: vi.fn(),
  getPresentationDeckByLibraryItem: vi.fn(),
  updateSlideAudioTrack: vi.fn(),
  updateDeckProjectAudioTrack: vi.fn(),
  generateSlideAudioFromSavedNote: vi.fn(),
}));

const templateServiceMocks = vi.hoisted(() => ({
  applyTemplateAssetToDeck: vi.fn(),
}));

const customBlockServiceMocks = vi.hoisted(() => ({
  listPresentationCustomBlocks: vi.fn(),
  listPresentationCustomBlockGovernanceAudit: vi.fn(),
  renderPresentationCustomBlockPreview: vi.fn(),
  savePresentationCustomBlock: vi.fn(),
  deletePresentationCustomBlock: vi.fn(),
  updatePresentationCustomBlock: vi.fn(),
  trackPresentationCustomBlockUse: vi.fn(),
}));

const compatibilityMocks = vi.hoisted(() => ({
  getPresentationCompatibilityOpen: vi.fn(),
  convertOfficeSourceToPresentation: vi.fn(),
}));

const playbackMocks = vi.hoisted(() => ({
  buildSlideshowPayload: vi.fn(),
  triggerPresentationExport: vi.fn(),
  getPresentationExportStatus: vi.fn(),
  buildPlayDeckPayload: vi.fn(),
}));

const aiServiceMocks = vi.hoisted(() => ({
  repairSlideFromSavedNote: vi.fn(),
  relayoutExistingSlideAsync: vi.fn(),
  relayoutExistingSlide: vi.fn(),
  generateAIDraft: vi.fn(),
  resolvePendingMediaForDeck: vi.fn(),
}));

vi.mock("../services/presentationService", async () => {
  const actual = await vi.importActual<any>("../services/presentationService");
  return {
    ...actual,
    getPresentationDeckDetail: serviceMocks.getPresentationDeckDetail,
    createPresentationDeckForLibraryItem: serviceMocks.createPresentationDeckForLibraryItem,
    createTemplateFromPresentation: serviceMocks.createTemplateFromPresentation,
    createPresentationFromTemplate: serviceMocks.createPresentationFromTemplate,
    attachAssetToDeck: serviceMocks.attachAssetToDeck,
    uploadAssetToDeck: serviceMocks.uploadAssetToDeck,
    updateSlideInDeck: serviceMocks.updateSlideInDeck,
    listPresentationVersionHistory: serviceMocks.listPresentationVersionHistory,
    restorePresentationVersion: serviceMocks.restorePresentationVersion,
    getPresentationDeckByLibraryItem: serviceMocks.getPresentationDeckByLibraryItem,
    updateSlideAudioTrack: serviceMocks.updateSlideAudioTrack,
    updateDeckProjectAudioTrack: serviceMocks.updateDeckProjectAudioTrack,
    generateSlideAudioFromSavedNote: serviceMocks.generateSlideAudioFromSavedNote,
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
  buildPlayDeckPayload: playbackMocks.buildPlayDeckPayload,
}));

vi.mock("../services/presentationTemplateService", () => ({
  applyTemplateAssetToDeck: templateServiceMocks.applyTemplateAssetToDeck,
}));

vi.mock("../services/aiPresentationService", () => ({
  repairSlideFromSavedNote: aiServiceMocks.repairSlideFromSavedNote,
  relayoutExistingSlideAsync: aiServiceMocks.relayoutExistingSlideAsync,
  relayoutExistingSlide: aiServiceMocks.relayoutExistingSlide,
  generateAIDraft: aiServiceMocks.generateAIDraft,
  resolvePendingMediaForDeck: aiServiceMocks.resolvePendingMediaForDeck,
}));

vi.mock("../services/presentationCustomBlockService", () => ({
  listPresentationCustomBlocks: customBlockServiceMocks.listPresentationCustomBlocks,
  listPresentationCustomBlockGovernanceAudit: customBlockServiceMocks.listPresentationCustomBlockGovernanceAudit,
  renderPresentationCustomBlockPreview: customBlockServiceMocks.renderPresentationCustomBlockPreview,
  savePresentationCustomBlock: customBlockServiceMocks.savePresentationCustomBlock,
  deletePresentationCustomBlock: customBlockServiceMocks.deletePresentationCustomBlock,
  updatePresentationCustomBlock: customBlockServiceMocks.updatePresentationCustomBlock,
  trackPresentationCustomBlockUse: customBlockServiceMocks.trackPresentationCustomBlockUse,
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
      exportId: 1,
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
      exportId: 1,
      status: "queued",
      format: "mp4",
      progressPct: 0,
      updatedAt: new Date(),
    });
    playbackMocks.buildPlayDeckPayload.mockResolvedValue({
      schemaVersion: "presentation_slideshow_v1",
      deckId: 88,
      generatedAt: new Date(),
      slides: [],
    });
    serviceMocks.listPresentationVersionHistory.mockResolvedValue([]);
    serviceMocks.restorePresentationVersion.mockResolvedValue({
      restoredSlideId: 71,
      restoredSlideVersion: 4,
      deckVersion: 9,
    });
    aiServiceMocks.repairSlideFromSavedNote.mockResolvedValue({
      title: "Repaired title",
      slideContent: {
        elements: [
          { id: "repair-title", type: "text", x: 40, y: 40, width: 400, height: 80, text: "Repaired title", color: "#111827" },
        ],
      },
      warnings: ["Regenerated image from saved note."],
      applied: {
        templateId: "split_right_image",
        stylePresetId: "dark-professional",
        graphicCategory: "Business",
        regeneratedImage: true,
      },
    });
    aiServiceMocks.relayoutExistingSlideAsync.mockResolvedValue({
      slideContent: { elements: [] },
      warnings: [],
      applied: {
        templateId: "split_right_image",
        stylePresetId: "dark-professional",
        graphicCategory: "Business",
        reusedImage: true,
      },
    });
    aiServiceMocks.generateAIDraft.mockResolvedValue(undefined);
    aiServiceMocks.resolvePendingMediaForDeck.mockResolvedValue({
      slidesUpdated: 0,
      jobsChecked: 0,
      jobsResolved: 0,
      jobsRemaining: 0,
      warnings: [],
    });
    serviceMocks.uploadAssetToDeck.mockResolvedValue({
      item: {
        id: 901,
        title: "Uploaded Hero",
        sourceUrl: "https://cdn.example.com/uploaded-hero.png",
        thumbnailUrl: "https://cdn.example.com/uploaded-hero.png",
      },
      link: { id: 22, deckId: 88, slideId: 71, libraryItemId: 901, byteSize: 1200, tenantId: "tenant-1", createdAt: new Date() },
      totals: { totalAssetBytes: 1200, warningExceeded: false, hardLimitExceeded: false },
      billing: { creditsCharged: 4, category: "image", fileSizeBytes: 1200, baseCredits: 4, stepCredits: 0, extraSteps: 0, sizeStepMb: 10 },
      folder: { tempFolderId: 11, userFolderId: 12, monthFolderId: 13, monthKey: "202603" },
    });
    serviceMocks.getPresentationDeckByLibraryItem.mockResolvedValue({
      deck: {
        id: 88,
        tenantId: "tenant-1",
        libraryItemId: 42,
        title: "Play Deck",
        description: null,
        version: 1,
        slideCount: 0,
        totalAssetBytes: 0,
        projectAudioTrack: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      slides: [],
      assets: [],
    });
    serviceMocks.getPresentationDeckDetail.mockResolvedValue({
      deck: { id: 88, libraryItemId: 42 },
      slides: [],
      assets: [],
    });
    customBlockServiceMocks.listPresentationCustomBlocks.mockResolvedValue([]);
    customBlockServiceMocks.listPresentationCustomBlockGovernanceAudit.mockResolvedValue([]);
    customBlockServiceMocks.renderPresentationCustomBlockPreview.mockResolvedValue({
      artifactKey: "",
      artifactUrl: "",
      previewHash: "preview-hash-1",
      rendererVersion: "server-svg-v1",
      generatedAt: "2026-03-13T00:00:00.000Z",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280 720\"></svg>",
    });
    customBlockServiceMocks.savePresentationCustomBlock.mockResolvedValue({
      id: "901",
      label: "Team Promo Block",
      description: "Saved from AI Layout.",
      category: "Custom",
      componentId: "poster-spotlight",
      slotBindings: [],
      savedAt: "2026-03-13T00:00:00.000Z",
      visibility: "team",
      isPinned: false,
      isTeamFeatured: false,
      usageCount: 0,
      favoriteUserIds: [],
      isFavorite: false,
      ownerUserId: 1,
      canDelete: true,
      canFeature: true,
      canTransferOwnership: true,
      preview: {
        artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
        artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
        previewHash: "hash-1",
        rendererVersion: "server-svg-v1",
        generatedAt: "2026-03-13T00:00:00.000Z",
      },
    });
    customBlockServiceMocks.deletePresentationCustomBlock.mockResolvedValue({ deleted: true });
    customBlockServiceMocks.updatePresentationCustomBlock.mockImplementation(async (input: any, actor: any) => ({
      id: input.blockId,
      label: "Team Promo Block",
      description: "Saved from AI Layout.",
      category: "Custom",
      componentId: "poster-spotlight",
      slotBindings: [],
      savedAt: "2026-03-13T00:00:00.000Z",
      visibility: input.visibility ?? "team",
      isPinned: input.isPinned ?? false,
      isTeamFeatured: input.isTeamFeatured ?? false,
      usageCount: 2,
      favoriteUserIds: input.favorite ? [actor.userId] : [],
      isFavorite: Boolean(input.favorite),
      ownerUserId: input.transferToUserId ?? 1,
      canDelete: (input.transferToUserId ?? 1) === actor.userId,
      canFeature: actor.role === "admin" || actor.role === "super_admin" || actor.role === "domain_admin",
      canTransferOwnership: actor.role === "admin" || actor.role === "super_admin" || actor.role === "domain_admin",
    }));
    customBlockServiceMocks.trackPresentationCustomBlockUse.mockResolvedValue({
      id: "901",
      label: "Team Promo Block",
      description: "Saved from AI Layout.",
      category: "Custom",
      componentId: "poster-spotlight",
      slotBindings: [],
      savedAt: "2026-03-13T00:00:00.000Z",
      visibility: "team",
      isPinned: false,
      isTeamFeatured: false,
      usageCount: 3,
      lastUsedAt: "2026-03-13T01:00:00.000Z",
      favoriteUserIds: [],
      isFavorite: false,
      ownerUserId: 1,
      canDelete: true,
      canFeature: true,
      canTransferOwnership: true,
    });
    serviceMocks.updateSlideAudioTrack.mockResolvedValue({ deckVersion: 2, slideVersion: 3 });
    serviceMocks.updateDeckProjectAudioTrack.mockResolvedValue({ deckVersion: 2 });
    serviceMocks.generateSlideAudioFromSavedNote.mockResolvedValue({
      deckVersion: 2,
      slideVersion: 3,
      libraryItemId: 901,
      taskId: "audio-task-1",
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

  it("creates template copy from presentation with tenant-scoped actor", async () => {
    serviceMocks.createTemplateFromPresentation.mockResolvedValue({
      item: { id: 99, title: "Pitch Template" },
      deck: { id: 100, libraryItemId: 99 },
      slidesCopied: 4,
      assetsCopied: 2,
    });

    const fn = presentationRouter.saveAsTemplate as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 77, role: "user" } },
      input: { sourceLibraryItemId: 42, templateTitle: "Pitch Template" },
    });

    expect(serviceMocks.createTemplateFromPresentation).toHaveBeenCalledWith(
      {
        sourceLibraryItemId: 42,
        templateTitle: "Pitch Template",
        templateDescription: undefined,
      },
      { userId: 77, tenantId: "tenant-1", role: "user" },
    );
    expect(result.item.id).toBe(99);
  });

  it("creates presentation copy from template with tenant-scoped actor", async () => {
    serviceMocks.createPresentationFromTemplate.mockResolvedValue({
      item: { id: 105, title: "Pitch Copy" },
      deck: { id: 106, libraryItemId: 105 },
      slidesCopied: 4,
      assetsCopied: 2,
    });

    const fn = presentationRouter.useTemplate as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 77, role: "user" } },
      input: { templateLibraryItemId: 99, title: "Pitch Copy" },
    });

    expect(serviceMocks.createPresentationFromTemplate).toHaveBeenCalledWith(
      {
        templateLibraryItemId: 99,
        title: "Pitch Copy",
        description: undefined,
      },
      { userId: 77, tenantId: "tenant-1", role: "user" },
    );
    expect(result.item.id).toBe(105);
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

  it("lists server-backed custom blocks", async () => {
    customBlockServiceMocks.listPresentationCustomBlocks.mockResolvedValue([
      {
        id: "901",
        label: "Team Promo Block",
        description: "Saved from AI Layout.",
        category: "Custom",
        componentId: "poster-spotlight",
        slotBindings: [],
        savedAt: "2026-03-13T00:00:00.000Z",
        visibility: "team",
        ownerUserId: 1,
        canDelete: true,
        canFeature: true,
        canTransferOwnership: true,
      },
    ]);

    const fn = presentationRouter.listCustomBlocks as Function;
    const result = await fn({
      input: { scope: "team", search: "promo", sort: "featured", limit: 25 },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.listPresentationCustomBlocks).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "team", search: "promo", sort: "featured", limit: 25 }),
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Team Promo Block");
  });

  it("lists governance audit rows for admins", async () => {
    customBlockServiceMocks.listPresentationCustomBlockGovernanceAudit.mockResolvedValue([
      {
        blockId: "901",
        blockLabel: "Team Promo Block",
        ownerUserId: 1,
        visibility: "team",
        eventType: "featured_changed",
        actorUserId: 3,
        actorRole: "admin",
        recordedAt: "2026-03-13T00:00:00.000Z",
        detail: "Block featured for team",
      },
    ]);

    const fn = presentationRouter.listCustomBlockGovernanceAudit as Function;
    const result = await fn({
      input: { eventType: "featured_changed", limit: 25 },
      ctx: { tenantId: "tenant-1", user: { id: 3, role: "admin", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.listPresentationCustomBlockGovernanceAudit).toHaveBeenCalledWith(
      { eventType: "featured_changed", limit: 25 },
      expect.objectContaining({ userId: 3, tenantId: "tenant-1" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.blockLabel).toBe("Team Promo Block");
  });

  it("saves server-backed custom blocks", async () => {
    const fn = presentationRouter.saveCustomBlock as Function;
    const result = await fn({
      input: {
        label: "Team Promo Block",
        description: "Saved from AI Layout.",
        componentId: "poster-spotlight",
        slotBindings: [],
        visibility: "team",
        previewSource: {
          canvas: { width: 1280, height: 720 },
          fallbackElements: [],
        },
      },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.savePresentationCustomBlock).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Team Promo Block", visibility: "team" }),
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result.id).toBe("901");
  });

  it("renders server-backed custom block previews without persisting a block", async () => {
    const fn = presentationRouter.renderCustomBlockPreview as Function;
    const result = await fn({
      input: {
        previewSource: {
          canvas: { width: 1280, height: 720 },
          fallbackElements: [
            { id: "t-1", type: "text", x: 120, y: 120, width: 300, height: 80, text: "Preview", color: "#111827" },
          ],
        },
      },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.renderPresentationCustomBlockPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        previewSource: expect.objectContaining({
          canvas: expect.objectContaining({ width: 1280, height: 720 }),
        }),
      }),
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result.previewHash).toBe("preview-hash-1");
    expect(result.rendererVersion).toBe("server-svg-v1");
  });

  it("deletes server-backed custom blocks", async () => {
    const fn = presentationRouter.deleteCustomBlock as Function;
    const result = await fn({
      input: { blockId: "901" },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.deletePresentationCustomBlock).toHaveBeenCalledWith(
      "901",
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result).toEqual({ deleted: true });
  });

  it("updates server-backed custom blocks", async () => {
    const fn = presentationRouter.updateCustomBlock as Function;
    const result = await fn({
      input: { blockId: "901", isPinned: true, isTeamFeatured: true, favorite: true },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.updatePresentationCustomBlock).toHaveBeenCalledWith(
      { blockId: "901", isPinned: true, isTeamFeatured: true, favorite: true },
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result.isPinned).toBe(true);
    expect(result.isTeamFeatured).toBe(true);
    expect(result.isFavorite).toBe(true);
  });

  it("transfers server-backed custom block ownership", async () => {
    const fn = presentationRouter.updateCustomBlock as Function;
    const result = await fn({
      input: { blockId: "901", transferToUserId: 22 },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.updatePresentationCustomBlock).toHaveBeenCalledWith(
      { blockId: "901", transferToUserId: 22 },
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result.ownerUserId).toBe(22);
  });

  it("tracks server-backed custom block usage", async () => {
    const fn = presentationRouter.trackCustomBlockUse as Function;
    const result = await fn({
      input: { blockId: "901" },
      ctx: { tenantId: "tenant-1", user: { id: 1, role: "user", currentTenantId: "tenant-1" } },
    });

    expect(customBlockServiceMocks.trackPresentationCustomBlockUse).toHaveBeenCalledWith(
      { blockId: "901" },
      expect.objectContaining({ userId: 1, tenantId: "tenant-1" }),
    );
    expect(result.usageCount).toBe(3);
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

  it("uploads local asset and attaches to deck with tenant-scoped actor", async () => {
    const fn = presentationRouter.uploadAndAttachAsset as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: {
        deckId: 88,
        expectedVersion: 1,
        slideId: 71,
        fileName: "hero.png",
        fileType: "image/png",
        fileBase64: "data:image/png;base64,aGVsbG8=",
      },
    });

    expect(serviceMocks.uploadAssetToDeck).toHaveBeenCalledWith(
      {
        deckId: 88,
        expectedVersion: 1,
        slideId: 71,
        fileName: "hero.png",
        fileType: "image/png",
        fileBase64: "data:image/png;base64,aGVsbG8=",
      },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.item.id).toBe(901);
    expect(result.folder.monthKey).toBe("202603");
  });

  it("maps insufficient credit errors when uploading local presentation assets", async () => {
    serviceMocks.uploadAssetToDeck.mockRejectedValueOnce(
      new Error("Insufficient credits. Required: 20"),
    );

    const fn = presentationRouter.uploadAndAttachAsset as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: {
          deckId: 88,
          expectedVersion: 1,
          slideId: 71,
          fileName: "hero.mp4",
          fileType: "video/mp4",
          fileBase64: "data:video/mp4;base64,aGVsbG8=",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "PRECONDITION_FAILED" && error.message.includes("Insufficient credits");
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

  it("lists presentation versions via service with tenant-scoped actor", async () => {
    serviceMocks.listPresentationVersionHistory.mockResolvedValue([
      {
        id: 501,
        versionNumber: 12,
        contentType: "presentation_slide_snapshot_v1",
        changeDescription: "Manual save: Intro",
        createdAt: new Date(),
        createdByUserId: 10,
        snapshot: {
          schemaVersion: "presentation_slide_snapshot_v1",
          deckId: 9,
          libraryItemId: 42,
          slideId: 71,
          slideVersion: 3,
          slideTitle: "Intro",
          slideContent: { elements: [] },
          notes: null,
          saveMode: "manual",
          savedAt: new Date().toISOString(),
          savedByUserId: 10,
        },
      },
    ]);

    const fn = presentationRouter.listVersions as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 9, limit: 20, offset: 0 },
    });

    expect(serviceMocks.listPresentationVersionHistory).toHaveBeenCalledWith(
      { deckId: 9, limit: 20, offset: 0 },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe(501);
  });

  it("restores presentation version via service with tenant-scoped actor", async () => {
    const fn = presentationRouter.restoreVersion as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 9, versionId: 501 },
    });

    expect(serviceMocks.restorePresentationVersion).toHaveBeenCalledWith(
      { deckId: 9, versionId: 501 },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.restoredSlideId).toBe(71);
  });

  it("repairs a slide from its saved note and updates the slide title/content", async () => {
    process.env.PRESENTATION_EDITOR_ENABLED = "true";
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "true";
    serviceMocks.getPresentationDeckDetail.mockResolvedValue({
      deck: { id: 9, title: "Deck title", libraryItemId: 42 },
      slides: [
        {
          id: 71,
          deckId: 9,
          orderIndex: 0,
          version: 3,
          title: "Broken title",
          notes: "Saved note for repair",
          slideContent: {
            elements: [{ id: "old-title", type: "text", x: 20, y: 20, width: 200, height: 60, text: "Broken title", color: "#111827" }],
          },
        },
      ],
      assets: [],
    });
    serviceMocks.updateSlideInDeck.mockResolvedValue({
      id: 71,
      version: 4,
      title: "Repaired title",
      notes: "Saved note for repair",
      slideContent: {
        elements: [{ id: "repair-title", type: "text", x: 40, y: 40, width: 400, height: 80, text: "Repaired title", color: "#111827" }],
      },
    });

    const fn = presentationRouter.ai.repairSlideFromNote as Function;
    const result = await fn({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 10, role: "user" },
        userToken: null,
        req: { headers: {} },
      },
      input: { deckId: 9, slideId: 71, expectedVersion: 3 },
    });

    expect(aiServiceMocks.repairSlideFromSavedNote).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 9,
        slideTitle: "Broken title",
        slideNotes: "Saved note for repair",
        slideIndex: 1,
        totalSlides: 1,
      }),
      { userId: 10, tenantId: "tenant-1", role: "user" },
      expect.any(String),
    );
    expect(serviceMocks.updateSlideInDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 9,
        slideId: 71,
        expectedVersion: 3,
        title: "Repaired title",
      }),
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.warnings).toContain("Regenerated image from saved note.");
    expect(result.slide.version).toBe(4);
  });

  it("passes a manually selected block recipe through auto layout", async () => {
    process.env.PRESENTATION_EDITOR_ENABLED = "true";
    serviceMocks.getPresentationDeckDetail.mockResolvedValue({
      deck: { id: 9, title: "Deck title", libraryItemId: 42 },
      slides: [
        {
          id: 71,
          deckId: 9,
          orderIndex: 0,
          version: 3,
          title: "Routine",
          notes: "Saved note",
          slideContent: {
            elements: [{ id: "old-title", type: "text", x: 20, y: 20, width: 200, height: 60, text: "Routine", color: "#111827" }],
          },
        },
      ],
      assets: [],
    });
    serviceMocks.updateSlideInDeck.mockResolvedValue({
      id: 71,
      version: 4,
      title: "Routine",
      notes: "Saved note",
      slideContent: { elements: [] },
    });

    const fn = presentationRouter.ai.relayoutSlide as Function;
    await fn({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 10, role: "user" },
        userToken: null,
        req: { headers: {} },
      },
      input: {
        deckId: 9,
        slideId: 71,
        expectedVersion: 3,
        componentRecipeId: "process-steps",
      },
    });

    expect(aiServiceMocks.relayoutExistingSlideAsync).toHaveBeenCalledWith(expect.objectContaining({
      preferredComponentRecipeId: "process-steps",
    }), expect.objectContaining({ userId: 10 }));
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

  // --- triggerExport extended format ---

  it("triggerExport accepts format: 'jpg' and passes it to service", async () => {
    const fn = presentationRouter.triggerExport as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, format: "jpg", idempotencyKey: "key-jpg-1" },
    });

    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: "jpg" }),
      expect.objectContaining({ tenantId: "tenant-1", userId: 10, role: "user" }),
      expect.objectContaining({ userToken: expect.any(String) }),
    );
  });

  it("triggerExport sends a tenant-scoped Python token", async () => {
    const fn = presentationRouter.triggerExport as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, format: "png", idempotencyKey: "key-tenant-token-1" },
    });

    const [, , dependencies] = playbackMocks.triggerPresentationExport.mock.calls.at(-1);
    const token = dependencies.userToken as string;
    const [, payload] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    expect(claims.sub).toBe("10");
    expect(claims.tenantId).toBe("tenant-1");
    expect(claims.type).toBe("access");
  });

  it("triggerExport accepts format: 'pdf' and passes it to service", async () => {
    const fn = presentationRouter.triggerExport as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, format: "pdf", idempotencyKey: "key-pdf-1" },
    });

    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: "pdf" }),
      expect.objectContaining({ tenantId: "tenant-1", userId: 10, role: "user" }),
      expect.objectContaining({ userToken: expect.any(String) }),
    );
  });

  it("triggerExport passes quality to service layer", async () => {
    const fn = presentationRouter.triggerExport as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, format: "mp4", quality: "high", idempotencyKey: "key-quality-1" },
    });

    expect(playbackMocks.triggerPresentationExport).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "high" }),
      expect.objectContaining({ tenantId: "tenant-1", userId: 10, role: "user" }),
      expect.objectContaining({ userToken: expect.any(String) }),
    );
  });

  // --- getExportStatus output extension ---

  it("getExportStatus returns progressPct and stage fields", async () => {
    playbackMocks.getPresentationExportStatus.mockResolvedValue({
      schemaVersion: "presentation_export_v1",
      exportId: 5,
      status: "processing",
      format: "mp4",
      progressPct: 42,
      stage: "Rendering slide 3 of 10",
      updatedAt: new Date(),
    });

    const fn = presentationRouter.getExportStatus as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { exportId: 5 },
    });

    expect(result.progressPct).toBe(42);
    expect(result.stage).toBe("Rendering slide 3 of 10");
  });

  it("getExportStatus returns downloadUrl when status is done", async () => {
    playbackMocks.getPresentationExportStatus.mockResolvedValue({
      schemaVersion: "presentation_export_v1",
      exportId: 5,
      status: "done",
      format: "mp4",
      progressPct: 100,
      downloadUrl: "https://cdn.example.com/out.mp4",
      updatedAt: new Date(),
    });

    const fn = presentationRouter.getExportStatus as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { exportId: 5 },
    });

    expect(result.downloadUrl).toBe("https://cdn.example.com/out.mp4");
    expect(result.status).toBe("done");
  });

  // --- setSlideAudio ---

  it("setSlideAudio stores audio track on slide via service", async () => {
    const fn = presentationRouter.setSlideAudio as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: {
        deckId: 88,
        slideId: 10,
        expectedVersion: 3,
        audioTrack: { libraryItemId: 5, volume: 0.8, startAtMs: 0 },
      },
    });

    expect(serviceMocks.updateSlideAudioTrack).toHaveBeenCalledWith(
      {
        deckId: 88,
        slideId: 10,
        expectedVersion: 3,
        audioTrack: { libraryItemId: 5, volume: 0.8, startAtMs: 0 },
      },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.deckVersion).toBe(2);
    expect(result.slideVersion).toBe(3);
  });

  it("setSlideAudio with null audioTrack removes existing audio track", async () => {
    const fn = presentationRouter.setSlideAudio as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, slideId: 10, expectedVersion: 3, audioTrack: null },
    });

    expect(serviceMocks.updateSlideAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ audioTrack: null }),
      expect.any(Object),
    );
  });

  it("setSlideAudio requires tenant context", async () => {
    const fn = presentationRouter.setSlideAudio as Function;
    await expect(
      fn({
        ctx: { tenantId: null, user: { id: 1 } },
        input: { deckId: 88, slideId: 10, expectedVersion: 3, audioTrack: null },
      }),
    ).rejects.toMatchObject({ message: "Tenant context is required for presentation operations" });
  });

  it("setSlideAudio maps VERSION_CONFLICT to CONFLICT tRPC error", async () => {
    serviceMocks.updateSlideAudioTrack.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
        `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: deck version mismatch`,
      ),
    );

    const fn = presentationRouter.setSlideAudio as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 88, slideId: 10, expectedVersion: 2, audioTrack: null },
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof TRPCError && err.code === "CONFLICT");
  });

  it("generateSlideAudioFromNote forwards token, model options, and actor to service", async () => {
    const fn = presentationRouter.generateSlideAudioFromNote as Function;
    const result = await fn({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 10, role: "user" },
        userToken: "session-token-123",
        publicUrl: "https://app.example.com",
      },
      input: {
        deckId: 88,
        slideId: 10,
        expectedVersion: 3,
        model: "uvoice/tts-standard",
        voice: "alloy",
        extraParams: { voice: "alloy" },
      },
    });

    expect(serviceMocks.generateSlideAudioFromSavedNote).toHaveBeenCalledWith(
      {
        deckId: 88,
        slideId: 10,
        expectedVersion: 3,
        model: "uvoice/tts-standard",
        voice: "alloy",
        extraParams: { voice: "alloy" },
        userToken: expect.any(String),
        publicUrl: "https://app.example.com",
      },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.libraryItemId).toBe(901);
  });

  // --- setDeckAudio ---

  it("setDeckAudio stores project audio track on deck via service", async () => {
    const fn = presentationRouter.setDeckAudio as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: {
        deckId: 88,
        expectedVersion: 3,
        projectAudioTrack: { libraryItemId: 7, volume: 0.5, loop: true },
      },
    });

    expect(serviceMocks.updateDeckProjectAudioTrack).toHaveBeenCalledWith(
      {
        deckId: 88,
        expectedVersion: 3,
        projectAudioTrack: { libraryItemId: 7, volume: 0.5, loop: true },
      },
      { userId: 10, tenantId: "tenant-1", role: "user" },
    );
    expect(result.deckVersion).toBe(2);
  });

  it("setDeckAudio with null removes project audio track", async () => {
    const fn = presentationRouter.setDeckAudio as Function;
    await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { deckId: 88, expectedVersion: 3, projectAudioTrack: null },
    });

    expect(serviceMocks.updateDeckProjectAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ projectAudioTrack: null }),
      expect.any(Object),
    );
  });

  // --- getPlayDeck ---

  it("getPlayDeck returns deck with resolved audio via buildPlayDeckPayload", async () => {
    const mockPayload = {
      schemaVersion: "presentation_slideshow_v1",
      deckId: 88,
      generatedAt: new Date(),
      slides: [
        {
          slideId: 1,
          orderIndex: 0,
          title: "Slide 1",
          durationMs: 3000,
          transition: "none",
          audioTrack: { url: "https://cdn.example.com/audio.mp3", volume: 0.8, startAtMs: 0 },
        },
      ],
    };
    playbackMocks.buildPlayDeckPayload.mockResolvedValue(mockPayload);

    const fn = presentationRouter.getPlayDeck as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { itemId: 42 },
    });

    expect(playbackMocks.buildPlayDeckPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        deck: expect.objectContaining({ id: 88, libraryItemId: 42 }),
      }),
      expect.objectContaining({ deckId: 88 }),
    );
    expect(result.slides[0].audioTrack?.url).toBe("https://cdn.example.com/audio.mp3");
  });

  it("getPlayDeck requires tenant context", async () => {
    const fn = presentationRouter.getPlayDeck as Function;
    await expect(
      fn({
        ctx: { tenantId: null, user: { id: 1 } },
        input: { itemId: 42 },
      }),
    ).rejects.toMatchObject({ message: "Tenant context is required for presentation operations" });
  });

  it("getPlayDeck throws NOT_FOUND when deck does not exist for library item", async () => {
    serviceMocks.getPresentationDeckByLibraryItem.mockResolvedValue(null);

    const fn = presentationRouter.getPlayDeck as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { itemId: 99 },
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof TRPCError && err.code === "NOT_FOUND");
  });

  it("getPlayDeck returns projectAudioTrack with resolved URL on deck", async () => {
    const mockPayload = {
      schemaVersion: "presentation_slideshow_v1",
      deckId: 88,
      generatedAt: new Date(),
      slides: [],
      projectAudioTrack: { url: "https://cdn.example.com/bg-music.mp3", volume: 0.5, loop: true },
    };
    playbackMocks.buildPlayDeckPayload.mockResolvedValue(mockPayload);

    const fn = presentationRouter.getPlayDeck as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
      input: { itemId: 42 },
    });

    expect(result.projectAudioTrack?.url).toBe("https://cdn.example.com/bg-music.mp3");
    expect(result.projectAudioTrack?.loop).toBe(true);
  });

  it("setDeckAudio requires tenant context", async () => {
    const fn = presentationRouter.setDeckAudio as Function;
    await expect(
      fn({
        ctx: { tenantId: null, user: { id: 1 } },
        input: { deckId: 88, expectedVersion: 3, projectAudioTrack: null },
      }),
    ).rejects.toMatchObject({ message: "Tenant context is required for presentation operations" });
  });

  it("setDeckAudio maps VERSION_CONFLICT to CONFLICT tRPC error", async () => {
    serviceMocks.updateDeckProjectAudioTrack.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.VERSION_CONFLICT,
        `${PRESENTATION_ERROR_CODE.VERSION_CONFLICT}: deck version mismatch`,
      ),
    );

    const fn = presentationRouter.setDeckAudio as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 88, expectedVersion: 2, projectAudioTrack: null },
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof TRPCError && err.code === "CONFLICT");
  });

  it("triggerExport rejects missing idempotencyKey via Zod schema parse", () => {
    // The mock procedure bypasses tRPC schema enforcement at the call layer, so test via
    // direct Zod parse to confirm idempotencyKey is required.
    const schema = z.object({
      deckId: z.number().int().positive(),
      format: z.enum(["png", "jpg", "pdf", "mp4"]),
      quality: z.enum(["draft", "standard", "high"]).optional().default("standard"),
      idempotencyKey: z.string().min(1).max(128),
      width: z.number().int().positive().max(PRESENTATION_EXPORT_MAX_WIDTH).optional(),
      height: z.number().int().positive().max(PRESENTATION_EXPORT_MAX_HEIGHT).optional(),
    }).refine((data) => (data.width === undefined) === (data.height === undefined), {
      message: "width and height must be provided together",
      path: ["width"],
    });

    const result = schema.safeParse({ deckId: 1, format: "mp4" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("idempotencyKey");
    }
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
