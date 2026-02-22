import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE, PRESENTATION_LIMITS } from "@shared/presentation/constants";

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

const libraryServiceMocks = vi.hoisted(() => ({
  getLibraryItemById: vi.fn(),
  getUserEffectivePermission: vi.fn(),
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
  getLibraryItemById: libraryServiceMocks.getLibraryItemById,
  getUserEffectivePermission: libraryServiceMocks.getUserEffectivePermission,
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
});
