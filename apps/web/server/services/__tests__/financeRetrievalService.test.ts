import { beforeEach, describe, expect, it, vi } from "vitest";

const financeRetrievalHarness = vi.hoisted(() => ({
  mockGetConversationById: vi.fn(),
  mockSearchLibraryItems: vi.fn(),
  mockListLinkedDocuments: vi.fn(),
}));

vi.mock("../chatService", () => ({
  getConversationById: financeRetrievalHarness.mockGetConversationById,
  isPersonalProjectId: (projectId: string | null | undefined) => projectId === "personal",
  PERSONAL_PROJECT_ID: "personal",
}));

vi.mock("../libraryService", () => ({
  searchLibraryItems: financeRetrievalHarness.mockSearchLibraryItems,
}));

vi.mock("../financeService", () => ({
  listLinkedDocuments: financeRetrievalHarness.mockListLinkedDocuments,
}));

import { searchFinanceEvidence } from "../financeRetrievalService";

beforeEach(() => {
  vi.clearAllMocks();
  financeRetrievalHarness.mockGetConversationById.mockResolvedValue({
    id: 91,
    userId: 7,
    tenantId: "tenant-1",
    projectId: "personal",
  });
  financeRetrievalHarness.mockSearchLibraryItems.mockResolvedValue({
    version: "library_search_v1",
    query: "receipt",
    total: 1,
    limit: 10,
    offset: 0,
    has_more: false,
    results: [
      {
        item_id: 22,
        item_type: "pdf",
        title: "Receipt scan",
        description: "Lunch receipt",
        source_url: null,
        thumbnail_url: null,
        status: "ready",
        source: "document_upload",
        provider_name: null,
        model_name: null,
        owner_user_id: 7,
        parent_id: null,
        metadata: {
          projectId: "personal",
        },
        access_source: "owner",
        created_at: "2026-04-09T00:00:00.000Z",
        updated_at: "2026-04-09T00:00:00.000Z",
        combined_score: 1,
        keyword_score: 1,
        vector_score: 0,
        attach_payload: {
          item_id: 22,
          item_type: "pdf",
          title: "Receipt scan",
          source: "document_upload",
        },
      },
    ],
  } as any);
  financeRetrievalHarness.mockListLinkedDocuments.mockResolvedValue([
    {
      id: 900,
      transactionId: 301,
      libraryItemId: 22,
      role: "receipt",
      note: "Team dinner",
      sourceExtractionId: 31,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      libraryItem: {
        id: 22,
        title: "Receipt scan",
        source: "document_upload",
        metadata: { projectId: "personal" },
        projectId: "personal",
      },
      extraction: null,
    },
  ]);
});

describe("financeRetrievalService", () => {
  it("filters evidence search by project scope", async () => {
    const result = await searchFinanceEvidence({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      query: "receipt",
      limit: 10,
    });

    expect(financeRetrievalHarness.mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "receipt",
        limit: 10,
        scope: "my_library",
        filters: expect.objectContaining({
          projectId: "personal",
          ownerUserId: 7,
        }),
      }),
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
      }),
    );
    expect(result.projectId).toBe("personal");
    expect(result.personal).toBe(true);
    expect(result.searchResults?.results).toHaveLength(1);
  });

  it("can return linked transaction evidence without searching", async () => {
    const result = await searchFinanceEvidence({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      transactionId: 301,
    });

    expect(financeRetrievalHarness.mockSearchLibraryItems).not.toHaveBeenCalled();
    expect(financeRetrievalHarness.mockListLinkedDocuments).toHaveBeenCalledWith({
      conversationId: 91,
      transactionId: 301,
      userId: 7,
      tenantId: "tenant-1",
    });
    expect(result.linkedDocuments).toHaveLength(1);
    expect(result.searchResults).toBeNull();
  });

  it("keeps work-chat evidence scoped to the active work project", async () => {
    financeRetrievalHarness.mockGetConversationById.mockResolvedValueOnce({
      id: 92,
      userId: 7,
      tenantId: "tenant-1",
      projectId: "work-1",
    });

    const result = await searchFinanceEvidence({
      conversationId: 92,
      userId: 7,
      tenantId: "tenant-1",
      query: "receipt",
      limit: 5,
    });

    expect(financeRetrievalHarness.mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          projectId: "work-1",
        }),
      }),
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
      }),
    );
    expect(result.projectId).toBe("work-1");
    expect(result.personal).toBe(false);
  });
});
