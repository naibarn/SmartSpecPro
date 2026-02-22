import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import { PresentationServiceError, type PresentationActor } from "./presentationService";
import { applyTemplateAssetToDeck } from "./presentationTemplateService";

const actor: PresentationActor = {
  userId: 21,
  tenantId: "tenant-1",
  role: "user",
};

function buildTemplateItem(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 9101,
    tenantId: actor.tenantId,
    ownerUserId: actor.userId,
    itemType: "image",
    source: "internal_template_catalog",
    title: "Hero template image.png",
    description: "Template image",
    status: "ready",
    visibility: "private",
    metadata: {
      extension: "png",
      mimeType: "image/png",
      byteSize: 2048,
    },
    sourceUrl: "https://cdn.example.com/template.png",
    thumbnailUrl: null,
    deletedAt: null,
    createdAt: new Date("2026-02-22T00:00:00.000Z"),
    updatedAt: new Date("2026-02-22T00:00:00.000Z"),
    ...overrides,
  };
}

describe("presentationTemplateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects template apply when upload-equivalent policy fails", async () => {
    await expect(
      applyTemplateAssetToDeck(
        {
          deckId: 55,
          expectedVersion: 3,
          templateAssetLibraryItemId: 9101,
        },
        actor,
        {
          getLibraryItemById: vi.fn().mockResolvedValue(
            buildTemplateItem({
              metadata: {
                extension: "exe",
                mimeType: "application/octet-stream",
                byteSize: 2048,
              },
            }),
          ),
          listAssetsForDeck: vi.fn().mockResolvedValue([]),
          attachAssetToDeck: vi.fn(),
          recordLog: vi.fn(),
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
      );
    });
  });

  it("rejects cross-tenant template attach attempts with deterministic permission error", async () => {
    await expect(
      applyTemplateAssetToDeck(
        {
          deckId: 55,
          expectedVersion: 3,
          templateAssetLibraryItemId: 9102,
        },
        actor,
        {
          getLibraryItemById: vi.fn().mockResolvedValue(buildTemplateItem({ tenantId: "tenant-2" })),
          listAssetsForDeck: vi.fn().mockResolvedValue([]),
          attachAssetToDeck: vi.fn(),
          recordLog: vi.fn(),
        },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof PresentationServiceError
        && error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED
      );
    });
  });

  it("records actor attribution metadata and avoids duplicate links on repeated template apply", async () => {
    const recordLog = vi.fn();
    const getLibraryItemById = vi.fn().mockResolvedValue(buildTemplateItem());
    const attachAssetToDeck = vi.fn().mockResolvedValue({
      link: {
        id: 3001,
        tenantId: actor.tenantId,
        deckId: 55,
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
          id: 3001,
          tenantId: actor.tenantId,
          deckId: 55,
          slideId: null,
          libraryItemId: 9101,
          byteSize: 2048,
          createdAt: new Date(),
        },
      ]);

    const first = await applyTemplateAssetToDeck(
      {
        deckId: 55,
        expectedVersion: 3,
        templateAssetLibraryItemId: 9101,
      },
      actor,
      {
        getLibraryItemById,
        listAssetsForDeck,
        attachAssetToDeck,
        recordLog,
      },
    );

    const second = await applyTemplateAssetToDeck(
      {
        deckId: 55,
        expectedVersion: 4,
        templateAssetLibraryItemId: 9101,
      },
      actor,
      {
        getLibraryItemById,
        listAssetsForDeck,
        attachAssetToDeck,
        recordLog,
      },
    );

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(attachAssetToDeck).toHaveBeenCalledTimes(1);
    expect(recordLog).toHaveBeenCalledWith(
      "presentation_template_apply",
      expect.objectContaining({
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: 55,
        templateAssetLibraryItemId: 9101,
      }),
    );
  });
});
