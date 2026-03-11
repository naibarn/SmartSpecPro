import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./libraryService", () => ({
  createLibraryItem: vi.fn(),
  getLibraryItemById: vi.fn(),
  getUserEffectivePermission: vi.fn(),
}));

vi.mock("./presentationService", () => ({
  createPresentationDeckForLibraryItem: vi.fn(),
  listSlidesForDeck: vi.fn(),
  updateSlideInDeck: vi.fn(),
  addSlideToDeck: vi.fn(),
}));

vi.mock("./aiPresentationLayoutEngine", () => ({
  generateSlide: vi.fn(),
}));

import { agencyRunArtifacts } from "../../drizzle/schema";
import type { RunResult } from "./agencyBridge";
import { buildAgencyPreview } from "./agencyPreviewService";
import {
  AgencyPreviewCommitError,
  commitPresentationPreview,
} from "./agencyDeckCommitService";
import {
  createLibraryItem,
  getLibraryItemById,
  getUserEffectivePermission,
} from "./libraryService";
import {
  addSlideToDeck,
  createPresentationDeckForLibraryItem,
  listSlidesForDeck,
  updateSlideInDeck,
} from "./presentationService";
import { generateSlide } from "./aiPresentationLayoutEngine";

const mockCreateLibraryItem = vi.mocked(createLibraryItem);
const mockGetLibraryItemById = vi.mocked(getLibraryItemById);
const mockGetUserEffectivePermission = vi.mocked(getUserEffectivePermission);
const mockCreatePresentationDeckForLibraryItem = vi.mocked(createPresentationDeckForLibraryItem);
const mockListSlidesForDeck = vi.mocked(listSlidesForDeck);
const mockUpdateSlideInDeck = vi.mocked(updateSlideInDeck);
const mockAddSlideToDeck = vi.mocked(addSlideToDeck);
const mockGenerateSlide = vi.mocked(generateSlide);

function makeDeckRunResult(): RunResult {
  return {
    runId: "run-1",
    conversationId: "conv-1",
    status: "completed",
    response: "Deck preview ready.",
    creditsUsed: 0,
    durationMs: 500,
    stepAttemptSnapshots: [],
    structuredResult: {
      version: "1.0",
      intent: "presentation_deck",
      summary: "Deck preview ready.",
      payload: {
        title: "Quarterly strategy deck",
        description: "Board review",
        language: "en",
        style_preset: "editorial-clean",
        slides: [
          {
            templateId: "hero_center",
            title: "Overview",
            body: ["Revenue up", "Margin stable"],
            notes: "Open with the headline numbers.",
            graphicCategory: "Business",
            imagePromptKeywords: "business chart",
          },
          {
            templateId: "feature_boxes_right",
            title: "Next steps",
            body: ["Expand APAC", "Tighten spend"],
            notes: "Close with operating priorities.",
            graphicCategory: "Business",
            imagePromptKeywords: "roadmap arrows",
          },
        ],
      },
      artifacts: [{ artifact_type: "deck", title: "Quarterly strategy deck" }],
      references: [
        {
          document_id: "101",
          chunk_id: "chunk-1",
          title: "Board packet",
          url: null,
        },
      ],
      metrics: {},
    },
    previewArtifacts: [
      {
        id: "artifact-1",
        intent: "presentation_deck",
        artifact_type: "deck",
        state: "preview_generated",
        summary: "Deck preview ready.",
        commit_status: "not_committed",
        commit_token: "commit-token-1",
        payload_json: {
          title: "Quarterly strategy deck",
          description: "Board review",
          language: "en",
          style_preset: "editorial-clean",
          slides: [
            {
              templateId: "hero_center",
              title: "Overview",
              body: ["Revenue up", "Margin stable"],
              notes: "Open with the headline numbers.",
              graphicCategory: "Business",
              imagePromptKeywords: "business chart",
            },
            {
              templateId: "feature_boxes_right",
              title: "Next steps",
              body: ["Expand APAC", "Tighten spend"],
              notes: "Close with operating priorities.",
              graphicCategory: "Business",
              imagePromptKeywords: "roadmap arrows",
            },
          ],
        },
        provenance_json: [
          {
            document_id: "101",
            chunk_id: "chunk-1",
            title: "Board packet",
            url: null,
          },
        ],
        payload_storage_key: null,
        target_type: null,
        target_id: null,
        committed_at: null,
        expired_at: null,
      },
    ],
  };
}

function makeDb() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const tx = {
    update: vi.fn().mockImplementation((table) => {
      if (table === agencyRunArtifacts) {
        return { set: updateSet };
      }
      return { set: vi.fn() };
    }),
  } as any;
  const transaction = vi.fn().mockImplementation(async (callback: (client: any) => unknown) => callback(tx));
  return {
    db: {
      transaction,
      update: tx.update,
    } as any,
    mocks: { updateSet, updateWhere, transaction },
  };
}

describe("agencyDeckCommitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateLibraryItem.mockResolvedValue({
      item: {
        id: 900,
        tenantId: "tenant-1",
        ownerUserId: 7,
        itemType: "presentation",
        source: "agency_generated",
        title: "Quarterly strategy deck",
        metadata: {},
      } as any,
      idempotent: false,
    });
    mockGetLibraryItemById.mockResolvedValue({
      id: 101,
      tenantId: "tenant-1",
      ownerUserId: 7,
      itemType: "document",
      source: "upload",
      title: "Board packet",
      status: "ready",
      visibility: "private",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockGetUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "read",
      sources: [{ type: "owner" }],
    } as any);
    mockCreatePresentationDeckForLibraryItem.mockResolvedValue({
      created: true,
      deck: {
        id: 777,
        version: 1,
      } as any,
    });
    mockListSlidesForDeck.mockResolvedValue([
      {
        id: 3001,
        deckId: 777,
        version: 1,
      } as any,
    ]);
    mockGenerateSlide.mockImplementation(({ slideData, slideIndex }) => ({
      slideContent: {
        elements: [],
        canvas: { preset: "16:9", width: 1280, height: 720 },
        metadata: { title: slideData.title, slideIndex },
      } as any,
      warnings: [],
    }));
    mockUpdateSlideInDeck.mockResolvedValue({ id: 3001 } as any);
    mockAddSlideToDeck.mockResolvedValue({ id: 3002 } as any);
  });

  it("commits a deck preview into a real presentation deck with sequential slide writes", async () => {
    const preview = buildAgencyPreview(makeDeckRunResult());
    const { db } = makeDb();

    const result = await commitPresentationPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "not_committed",
        targetType: null,
        targetId: null,
      },
      commitToken: "commit-token-1",
      dbClient: db,
      preview,
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "presentation",
        source: "agency_generated",
        title: "Quarterly strategy deck",
      }),
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
      expect.anything(),
    );
    expect(mockCreatePresentationDeckForLibraryItem).toHaveBeenCalledWith(
      { libraryItemId: 900, title: "Quarterly strategy deck", description: "Board review" },
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
      expect.anything(),
    );
    expect(mockUpdateSlideInDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 777,
        slideId: 3001,
        expectedVersion: 1,
        title: "Overview",
        notes: "Open with the headline numbers.",
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(mockAddSlideToDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 777,
        expectedVersion: 2,
        title: "Next steps",
        notes: "Close with operating priorities.",
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "committed",
        targetType: "presentation_deck",
        deckId: 777,
        libraryItemId: 900,
      }),
    );
  });

  it("rejects expired deck previews before creating a deck", async () => {
    const preview = buildAgencyPreview(makeDeckRunResult());
    const expiredPreview = preview && {
      ...preview,
      lifecycleState: "expired_preview" as const,
      commit: { ...preview.commit, available: false },
    };

    await expect(
      commitPresentationPreview({
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        artifactRecord: {
          id: "artifact-1",
          runId: "run-1",
          tenantId: "tenant-1",
          commitToken: "commit-token-1",
          commitStatus: "not_committed",
          targetType: null,
          targetId: null,
        },
        commitToken: "commit-token-1",
        dbClient: makeDb().db,
        preview: expiredPreview,
      }),
    ).rejects.toMatchObject<Partial<AgencyPreviewCommitError>>({
      code: "STALE_PREVIEW",
    });
    expect(mockCreatePresentationDeckForLibraryItem).not.toHaveBeenCalled();
  });

  it("treats repeated confirm requests with the same token as idempotent", async () => {
    const preview = buildAgencyPreview(makeDeckRunResult());

    const result = await commitPresentationPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "committed",
        targetType: "presentation_deck",
        targetId: JSON.stringify({ deckId: 777, libraryItemId: 900 }),
      },
      commitToken: "commit-token-1",
      dbClient: makeDb().db,
      preview,
    });

    expect(result).toEqual({
      artifactId: "artifact-1",
      runId: "run-1",
      commitToken: "commit-token-1",
      status: "committed",
      targetType: "presentation_deck",
      targetId: JSON.stringify({ deckId: 777, libraryItemId: 900 }),
      deckId: 777,
      libraryItemId: 900,
    });
    expect(mockCreatePresentationDeckForLibraryItem).not.toHaveBeenCalled();
  });
});
