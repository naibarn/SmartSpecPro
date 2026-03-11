import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE, PRESENTATION_LIMITS } from "@shared/presentation/constants";

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

const libraryServiceMocks = vi.hoisted(() => ({
  createLibraryItem: vi.fn(),
  ensureOwnedLibraryFolder: vi.fn(),
  getLibraryItemById: vi.fn(),
  permanentDeleteLibraryItem: vi.fn(),
  softDeleteLibraryItem: vi.fn(),
  getUserEffectivePermission: vi.fn(),
  uploadLibraryFile: vi.fn(),
}));

const persistenceMocks = vi.hoisted(() => ({
  getPresentationDeckById: vi.fn(),
  createPresentationDeck: vi.fn(),
  createPresentationSlide: vi.fn(),
  reorderPresentationSlides: vi.fn(),
  attachPresentationAsset: vi.fn(),
  detachPresentationAsset: vi.fn(),
  listPresentationSlides: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: dbMocks.getDb,
}));

vi.mock("./libraryService", () => ({
  createLibraryItem: libraryServiceMocks.createLibraryItem,
  ensureOwnedLibraryFolder: libraryServiceMocks.ensureOwnedLibraryFolder,
  getLibraryItemById: libraryServiceMocks.getLibraryItemById,
  permanentDeleteLibraryItem: libraryServiceMocks.permanentDeleteLibraryItem,
  softDeleteLibraryItem: libraryServiceMocks.softDeleteLibraryItem,
  getUserEffectivePermission: libraryServiceMocks.getUserEffectivePermission,
  uploadLibraryFile: libraryServiceMocks.uploadLibraryFile,
}));

vi.mock("./presentationPersistence", () => ({
  getPresentationDeckById: persistenceMocks.getPresentationDeckById,
  createPresentationDeck: persistenceMocks.createPresentationDeck,
  createPresentationSlide: persistenceMocks.createPresentationSlide,
  reorderPresentationSlides: persistenceMocks.reorderPresentationSlides,
  attachPresentationAsset: persistenceMocks.attachPresentationAsset,
  detachPresentationAsset: persistenceMocks.detachPresentationAsset,
  listPresentationSlides: persistenceMocks.listPresentationSlides,
}));

import {
  PresentationServiceError,
  addSlideToDeck,
  attachAssetToDeck,
  createPresentationDeckForLibraryItem,
  deletePresentationDeck,
  updateSlideInDeck,
} from "./presentationService";

const actor = {
  userId: 7,
  tenantId: "tenant-1",
  role: "user",
} as const;

function buildPresentationLibraryItem(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 44,
    tenantId: "tenant-1",
    ownerUserId: 7,
    itemType: "presentation",
    source: "document_management",
    title: "Deck",
    description: null,
    status: "ready",
    visibility: "private",
    metadata: {},
    sourceUrl: null,
    thumbnailUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("presentationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getDb.mockResolvedValue({} as any);
    libraryServiceMocks.createLibraryItem.mockResolvedValue({
      item: buildPresentationLibraryItem(),
      idempotent: false,
    });
    libraryServiceMocks.ensureOwnedLibraryFolder.mockResolvedValue({
      item: buildPresentationLibraryItem({ id: 901, itemType: "folder", title: "temp" }),
      idempotent: true,
    });
    libraryServiceMocks.uploadLibraryFile.mockResolvedValue({
      item: buildPresentationLibraryItem({ id: 990, itemType: "image", sourceUrl: "https://cdn.example.com/upload.png", thumbnailUrl: "https://cdn.example.com/upload.png", metadata: { file_size_bytes: 1024 } }),
      storageKey: "library/uploads/tenant-1/7/upload.png",
      indexJob: { jobId: 1, status: "pending", created: true, payloadVersion: "v2", dedupeKey: "x" },
      billing: { creditsCharged: 4, category: "image", fileSizeBytes: 1024, baseCredits: 4, stepCredits: 0, extraSteps: 0, sizeStepMb: 10 },
    });
    libraryServiceMocks.softDeleteLibraryItem.mockResolvedValue(true);
    libraryServiceMocks.permanentDeleteLibraryItem.mockResolvedValue({ daysInTrash: 0 });
    libraryServiceMocks.getUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "owner",
      sources: [{ type: "owner" }],
    });
  });

  it("denies lifecycle-restricted resources", async () => {
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(
      buildPresentationLibraryItem({ status: "archived" }),
    );

    await expect(
      createPresentationDeckForLibraryItem(
        { libraryItemId: 44 },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED;
    });
  });

  it("enforces write permission for create deck", async () => {
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
    libraryServiceMocks.getUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "read",
      sources: [{ type: "direct", permissionLevel: "read" }],
    });

    await expect(
      createPresentationDeckForLibraryItem(
        { libraryItemId: 44 },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED;
    });
  });

  it("creates the initial slide with 9:16 canvas defaults", async () => {
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
    dbMocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    } as any);
    persistenceMocks.getPresentationDeckById.mockResolvedValue(null);
    persistenceMocks.createPresentationDeck.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 0,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    persistenceMocks.createPresentationSlide.mockResolvedValue({
      id: 201,
      deckId: 101,
      orderIndex: 0,
      version: 1,
      title: "Slide 1",
      slideContent: {
        elements: [],
        canvas: { preset: "9:16", width: 720, height: 1280 },
      },
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createPresentationDeckForLibraryItem({ libraryItemId: 44 }, actor);

    expect(persistenceMocks.createPresentationSlide).toHaveBeenCalledWith(
      {
        deckId: 101,
        title: "Slide 1",
        slideContent: {
          elements: [],
          canvas: { preset: "9:16", width: 720, height: 1280 },
        },
      },
      expect.anything(),
    );
  });

  it("uses the caller transaction when resolving the library item for deck creation", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    } as any;
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
    persistenceMocks.getPresentationDeckById.mockResolvedValue(null);
    persistenceMocks.createPresentationDeck.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 0,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    persistenceMocks.createPresentationSlide.mockResolvedValue({
      id: 201,
      deckId: 101,
      orderIndex: 0,
      version: 1,
      title: "Slide 1",
      slideContent: {
        elements: [],
        canvas: { preset: "9:16", width: 720, height: 1280 },
      },
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createPresentationDeckForLibraryItem({ libraryItemId: 44 }, actor, tx);

    expect(libraryServiceMocks.getLibraryItemById).toHaveBeenCalledWith(44, actor, tx);
  });

  it("blocks slide updates when effective permission is read-only", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 2,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
    libraryServiceMocks.getUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "read",
      sources: [{ type: "direct", permissionLevel: "read" }],
    });

    await expect(
      updateSlideInDeck(
        {
          deckId: 101,
          slideId: 301,
          expectedVersion: 1,
          saveMode: "manual",
          title: "Blocked update",
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED;
    });
  });

  it("rejects add-slide when deck limit is reached", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: PRESENTATION_LIMITS.maxSlidesPerDeck,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 1,
          title: "Slide 1",
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.SLIDE_LIMIT_EXCEEDED;
    });
  });

  it("rejects add-slide when slideContent contains unsupported element schema", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 1,
          title: "Bad slide",
          slideContent: {
            elements: [
              {
                id: "el-1",
                type: "video",
                x: 10,
                y: 10,
                width: 100,
                height: 100,
              },
            ],
          },
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED;
    });
  });

  it("returns deterministic legacy-payload guidance for unsupported editable payload types", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 1,
          title: "Legacy shape payload",
          slideContent: {
            elements: [
              {
                id: "legacy-1",
                type: "shape",
                x: 10,
                y: 10,
                width: 120,
                height: 80,
              },
            ],
          },
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return (
        error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
        && (error.details as any)?.guidanceCode === "PRESENTATION_LEGACY_PAYLOAD_BLOCKED"
      );
    });
  });

  it("rejects add-slide when slideContent payload is oversized", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    const largeValidElements = Array.from({ length: 40 }).map((_, index) => ({
      id: `txt-${index}`,
      type: "text" as const,
      x: index,
      y: index,
      width: 300,
      height: 80,
      text: "x".repeat(9_000),
      color: "#111827",
    }));

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 1,
          title: "Huge slide",
          slideContent: {
            elements: largeValidElements,
          },
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return (
        error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
        && error.message.includes("exceeds max bytes")
      );
    });
  });

  it("rejects attach asset when referenced item is not readable in tenant scope", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 1,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce(buildPresentationLibraryItem())
      .mockResolvedValueOnce(null);

    await expect(
      attachAssetToDeck(
        {
          deckId: 101,
          expectedVersion: 1,
          libraryItemId: 9999,
          byteSize: 1024,
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.NOT_FOUND;
    });
  });

  it("returns deterministic version conflict payload for stale expected deck version", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 5,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 4,
          title: "New slide",
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return (
        error.code === PRESENTATION_ERROR_CODE.VERSION_CONFLICT
        && (error.details as any)?.conflict?.conflictSchemaVersion === "presentation_conflict_v1"
        && (error.details as any)?.conflict?.reasonCode === "DECK_VERSION_MISMATCH"
      );
    });
  });

  it("returns autosave conflict payload when slide expectedVersion is stale", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 4,
      slideCount: 2,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    const currentSlide = {
      id: 301,
      deckId: 101,
      orderIndex: 0,
      version: 7,
      title: "Current",
      slideContent: { elements: [] },
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dbClient = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([currentSlide]),
          })),
        })),
      })),
    } as any;

    await expect(
      updateSlideInDeck(
        {
          deckId: 101,
          slideId: 301,
          expectedVersion: 5,
          saveMode: "autosave",
          title: "Draft",
        },
        actor,
        dbClient,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return (
        error.code === PRESENTATION_ERROR_CODE.VERSION_CONFLICT
        && (error.details as any)?.conflict?.saveMode === "autosave"
        && (error.details as any)?.conflict?.latestSlideVersion === 7
      );
    });
  });

  it("enforces lifecycle deny on soft-deleted items and allows after restore", async () => {
    persistenceMocks.getPresentationDeckById.mockResolvedValue({
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 4,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    persistenceMocks.createPresentationSlide.mockResolvedValue({
      id: 201,
      deckId: 101,
      orderIndex: 1,
      version: 1,
      title: "Restored slide",
      slideContent: {},
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce(buildPresentationLibraryItem({ deletedAt: new Date("2026-02-22T00:00:00.000Z") }))
      .mockResolvedValueOnce(buildPresentationLibraryItem({ deletedAt: null }));

    await expect(
      addSlideToDeck(
        {
          deckId: 101,
          expectedVersion: 4,
          title: "Blocked while deleted",
        },
        actor,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PresentationServiceError)) return false;
      return error.code === PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED;
    });

    const restored = await addSlideToDeck(
      {
        deckId: 101,
        expectedVersion: 4,
        title: "Allowed after restore",
      },
      actor,
    );

    expect(restored.title).toBe("Restored slide");
  });

  it("cleans up presentation-uploaded assets when deleting deck", async () => {
    const deckRow = {
      id: 101,
      tenantId: actor.tenantId,
      libraryItemId: 44,
      title: "Deck",
      description: null,
      version: 4,
      slideCount: 1,
      totalAssetBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    persistenceMocks.getPresentationDeckById.mockResolvedValue(deckRow);
    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());

    const dbClient = {
      select: vi
        .fn()
        // linked uploads
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{
                id: 901,
                metadata: { presentation_upload: true, presentation_deck_id: 101 },
                ownerUserId: 777,
              }]),
            }),
          }),
        })
        // reusable assets in other decks
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 101 }]),
        }),
      }),
    } as any;

    const result = await deletePresentationDeck(
      { deckId: 101, expectedVersion: 4 },
      actor,
      dbClient,
    );

    expect(result.success).toBe(true);
    expect(libraryServiceMocks.softDeleteLibraryItem).toHaveBeenCalledWith(
      901,
      { ...actor, userId: 777 },
      dbClient,
    );
    expect(libraryServiceMocks.permanentDeleteLibraryItem).toHaveBeenCalledWith(
      901,
      { ...actor, userId: 777 },
      dbClient,
    );
  });
});
