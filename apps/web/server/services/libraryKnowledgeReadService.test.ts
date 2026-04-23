import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

const libraryServiceMocks = vi.hoisted(() => ({
  getLibraryItemById: vi.fn(),
  getLibraryMarkdownContent: vi.fn(),
  searchLibraryItems: vi.fn(),
}));

vi.mock("./libraryService", () => ({
  getLibraryItemById: libraryServiceMocks.getLibraryItemById,
  getLibraryMarkdownContent: libraryServiceMocks.getLibraryMarkdownContent,
  searchLibraryItems: libraryServiceMocks.searchLibraryItems,
}));

import {
  getLibraryKnowledgeInspector,
  listLibraryPropertyCatalog,
  listLibraryTagCatalog,
  quickSwitchLibraryNotes,
} from "./libraryKnowledgeReadService";

function makeSelectWithLimit(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithWhere(rows: any[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithOrder(rows: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithLimitRejecting(error: Error) {
  const limitMock = vi.fn().mockRejectedValue(error);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectRejecting(error: Error) {
  const whereMock = vi.fn().mockRejectedValue(error);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
  libraryServiceMocks.searchLibraryItems.mockResolvedValue({
    version: "library_search_v1",
    query: "",
    total: 0,
    limit: 10,
    offset: 0,
    has_more: false,
    results: [],
  });
});

describe("libraryKnowledgeReadService", () => {
  it("keeps unreadable backlink notes out of the inspector", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([
        {
          libraryItemId: 1,
          logicalPath: "ops/runbook",
          aliases: ["Runbook"],
          tags: ["ops"],
          properties: { owner: "ops" },
        },
      ]))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(makeSelectWithWhere([
        {
          sourceLibraryItemId: 2,
          targetLibraryItemId: 1,
          relationKind: "wikilink",
          resolutionStatus: "resolved",
          matchedBy: "title",
          matchedValue: "Runbook",
          rawReference: "Runbook",
          displayText: null,
        },
      ]))
      .mockReturnValueOnce(makeSelectWithWhere([]));

    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 1,
        title: "Runbook",
        metadata: { logical_path: "ops/runbook" },
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 1,
      content: "# Runbook",
      updated_at: new Date().toISOString(),
    });

    const result = await getLibraryKnowledgeInspector(
      { itemId: 1 },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result?.backlinks).toEqual([]);
  });

  it("ranks exact aliases ahead of fuzzy matches in quick switch", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithWhere([
        {
          libraryItemId: 10,
          logicalPath: "ops/runbook",
          aliases: ["Operations Playbook"],
        },
        {
          libraryItemId: 11,
          logicalPath: "ops/checklist",
          aliases: [],
        },
      ]))
      .mockReturnValueOnce(makeSelectWithOrder([
        {
          id: 10,
          tenantId: "tenant-1",
          title: "Runbook",
          metadata: { logical_path: "ops/runbook" },
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        },
        {
          id: 11,
          tenantId: "tenant-1",
          title: "Operations Checklist",
          metadata: { logical_path: "ops/checklist" },
          updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ]));

    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 10,
        title: "Runbook",
        metadata: { logical_path: "ops/runbook" },
        sourceUrl: "https://example.com/runbook.md",
        itemType: "document",
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: 11,
        title: "Operations Checklist",
        metadata: { logical_path: "ops/checklist" },
        sourceUrl: "https://example.com/checklist.md",
        itemType: "document",
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      });

    const result = await quickSwitchLibraryNotes(
      { query: "Operations Playbook" },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.results[0]).toMatchObject({
      libraryItemId: 10,
      matchType: "exact_alias",
      aliases: ["Operations Playbook"],
    });
  });

  it("matches logical paths in quick switch before weaker text matches", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithWhere([
        {
          libraryItemId: 10,
          logicalPath: "ops/runbook",
          aliases: [],
        },
        {
          libraryItemId: 11,
          logicalPath: "ops/runbook-checklist",
          aliases: [],
        },
      ]))
      .mockReturnValueOnce(makeSelectWithOrder([
        {
          id: 10,
          tenantId: "tenant-1",
          title: "Runbook Overview",
          metadata: { logical_path: "ops/runbook" },
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        },
        {
          id: 11,
          tenantId: "tenant-1",
          title: "Checklist",
          metadata: { logical_path: "ops/runbook-checklist" },
          updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ]));

    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 10,
        title: "Runbook Overview",
        metadata: { logical_path: "ops/runbook" },
        sourceUrl: "https://example.com/runbook.md",
        itemType: "document",
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: 11,
        title: "Checklist",
        metadata: { logical_path: "ops/runbook-checklist" },
        sourceUrl: "https://example.com/checklist.md",
        itemType: "document",
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      });

    const result = await quickSwitchLibraryNotes(
      { query: "ops/runbook" },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.results[0]).toMatchObject({
      libraryItemId: 10,
      logicalPath: "ops/runbook",
      matchType: "exact_path",
    });
    expect(result.results[1]).toMatchObject({
      libraryItemId: 11,
      matchType: "path_prefix",
    });
  });

  it("aggregates tenant-scoped property usage counts", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectWithWhere([
      {
        libraryItemId: 20,
        tenantId: "tenant-1",
        properties: {
          owner: "ops",
          priority: "high",
        },
      },
      {
        libraryItemId: 21,
        tenantId: "tenant-1",
        properties: {
          owner: "finance",
          hiddenCodename: "do-not-leak",
        },
      },
      {
        libraryItemId: 22,
        tenantId: "tenant-1",
        properties: {
          retries: 3,
        },
      },
    ]));
    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 20,
        title: "Readable ops note",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 22,
        title: "Readable retry note",
      });

    const result = await listLibraryPropertyCatalog(
      undefined,
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.properties).toEqual([
      expect.objectContaining({
        key: "owner",
        usageCount: 1,
        inferredType: "string",
      }),
      expect.objectContaining({
        key: "priority",
        usageCount: 1,
      }),
      expect.objectContaining({
        key: "retries",
        usageCount: 1,
        inferredType: "number",
      }),
    ]);
    expect(result.properties.map((entry) => entry.key)).not.toContain(
      "hiddenCodename",
    );
  });

  it("aggregates normalized tag usage counts", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectWithWhere([
      {
        libraryItemId: 31,
        tags: ["ops", "runbook", "ops"],
      },
      {
        libraryItemId: 32,
        tags: ["ops", "critical"],
      },
    ]));
    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 31,
        title: "Readable ops note",
      })
      .mockResolvedValueOnce({
        id: 32,
        title: "Readable critical note",
      });

    const result = await listLibraryTagCatalog(
      { query: "op" },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.tags).toEqual([
      {
        tag: "ops",
        usageCount: 2,
      },
    ]);
  });

  it("falls back to a note-only summary when knowledge schema is unavailable", async () => {
    const missingSchemaError = new Error(
      'column "headings" of relation "library_knowledge_notes" does not exist',
    );

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimitRejecting(missingSchemaError))
      .mockReturnValueOnce(makeSelectRejecting(missingSchemaError))
      .mockReturnValueOnce(makeSelectRejecting(missingSchemaError));

    libraryServiceMocks.getLibraryItemById.mockResolvedValueOnce({
      id: 202,
      title: "Fallback Note",
      metadata: { logical_path: "ops/fallback" },
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 202,
      content: "# Fallback Note",
      updated_at: new Date().toISOString(),
    });

    const result = await getLibraryKnowledgeInspector(
      { itemId: 202 },
      { userId: 7, tenantId: "tenant-fallback", role: "user" },
    );

    expect(result).toEqual({
      note: {
        libraryItemId: 202,
        title: "Fallback Note",
        logicalPath: "ops/fallback",
        aliases: [],
        tags: [],
        properties: {},
      },
      outgoing: [],
      backlinks: [],
      unlinkedMentions: [],
      sharedTags: [],
      semanticRelated: [],
      localGraph: {
        nodes: [
          {
            libraryItemId: 202,
            title: "Fallback Note",
            logicalPath: "ops/fallback",
            role: "active",
          },
        ],
        edges: [],
      },
    });
  });

  it("treats wrapped failed-query errors as knowledge-schema fallbacks", async () => {
    const wrappedDriverError = new Error(
      'Failed query: select "library_item_id", "created_at" from "library_knowledge_notes"',
    );
    (
      wrappedDriverError as Error & {
        cause?: Error;
      }
    ).cause = new Error(
      'column "created_at" of relation "library_knowledge_notes" does not exist',
    );

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimitRejecting(wrappedDriverError))
      .mockReturnValueOnce(makeSelectRejecting(wrappedDriverError))
      .mockReturnValueOnce(makeSelectRejecting(wrappedDriverError));

    libraryServiceMocks.getLibraryItemById.mockResolvedValueOnce({
      id: 303,
      title: "Wrapped Fallback Note",
      metadata: { logical_path: "ops/wrapped-fallback" },
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 303,
      content: "# Wrapped Fallback Note",
      updated_at: new Date().toISOString(),
    });

    const result = await getLibraryKnowledgeInspector(
      { itemId: 303 },
      { userId: 7, tenantId: "tenant-fallback", role: "user" },
    );

    expect(result).toEqual({
      note: {
        libraryItemId: 303,
        title: "Wrapped Fallback Note",
        logicalPath: "ops/wrapped-fallback",
        aliases: [],
        tags: [],
        properties: {},
      },
      outgoing: [],
      backlinks: [],
      unlinkedMentions: [],
      sharedTags: [],
      semanticRelated: [],
      localGraph: {
        nodes: [
          {
            libraryItemId: 303,
            title: "Wrapped Fallback Note",
            logicalPath: "ops/wrapped-fallback",
            role: "active",
          },
        ],
        edges: [],
      },
    });
  });

  it("adds shared-tag neighbors and semantic-related notes to the inspector", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([
        {
          libraryItemId: 10,
          logicalPath: "ops/runbook",
          aliases: ["Ops Playbook"],
          tags: ["ops", "runbook"],
          headings: [{ text: "Overview" }],
          properties: {},
        },
      ]))
      .mockReturnValueOnce(makeSelectWithWhere([
        {
          sourceLibraryItemId: 10,
          targetLibraryItemId: 11,
          relationKind: "wikilink",
          resolutionStatus: "resolved",
          matchedBy: "title",
          matchedValue: "Checklist",
          rawReference: "Checklist",
          displayText: null,
        },
      ]))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(makeSelectWithWhere([
        {
          libraryItemId: 10,
          aliases: ["Ops Playbook"],
          tags: ["ops", "runbook"],
        },
        {
          libraryItemId: 12,
          aliases: [],
          tags: ["ops", "incident"],
        },
      ]));

    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 10,
        title: "Runbook",
        metadata: { logical_path: "ops/runbook" },
      })
      .mockResolvedValueOnce({
        id: 11,
        title: "Checklist",
        metadata: { logical_path: "ops/checklist" },
      })
      .mockResolvedValueOnce({
        id: 12,
        title: "Incident Guide",
        metadata: { logical_path: "ops/incident-guide" },
      })
      .mockResolvedValueOnce({
        id: 12,
        title: "Incident Guide",
        metadata: { logical_path: "ops/incident-guide" },
      })
      .mockResolvedValueOnce({
        id: 10,
        title: "Runbook",
        metadata: { logical_path: "ops/runbook" },
      })
      .mockResolvedValueOnce({
        id: 11,
        title: "Checklist",
        metadata: { logical_path: "ops/checklist" },
      });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 10,
      content: "# Runbook\n\n#ops",
      updated_at: new Date().toISOString(),
    });
    libraryServiceMocks.searchLibraryItems.mockResolvedValue({
      version: "library_search_v1",
      query: "Runbook ops",
      total: 2,
      limit: 10,
      offset: 0,
      has_more: false,
      results: [
        {
          item_id: 10,
          item_type: "md",
          title: "Runbook",
          description: null,
          source_url: null,
          thumbnail_url: null,
          status: "ready",
          source: "document_upload",
          provider_name: null,
          model_name: null,
          owner_user_id: 5,
          parent_id: null,
          metadata: { logical_path: "ops/runbook" },
          access_source: "owner",
          created_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
          updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
          combined_score: 0.99,
          keyword_score: 0.8,
          vector_score: 0.9,
          attach_payload: {
            item_id: 10,
            item_type: "md",
            title: "Runbook",
            source: "document_upload",
          },
        },
        {
          item_id: 13,
          item_type: "md",
          title: "Production Checklist",
          description: null,
          source_url: null,
          thumbnail_url: null,
          status: "ready",
          source: "document_upload",
          provider_name: null,
          model_name: null,
          owner_user_id: 5,
          parent_id: null,
          metadata: { logical_path: "ops/production-checklist" },
          access_source: "owner",
          created_at: new Date("2026-04-20T00:00:00.000Z").toISOString(),
          updated_at: new Date("2026-04-20T00:00:00.000Z").toISOString(),
          combined_score: 0.71,
          keyword_score: 0.55,
          vector_score: 0.83,
          attach_payload: {
            item_id: 13,
            item_type: "md",
            title: "Production Checklist",
            source: "document_upload",
          },
        },
      ],
    });

    const result = await getLibraryKnowledgeInspector(
      { itemId: 10 },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result?.sharedTags).toEqual([
      {
        libraryItemId: 12,
        title: "Incident Guide",
        logicalPath: "ops/incident-guide",
        sharedTags: ["ops"],
      },
    ]);
    expect(result?.semanticRelated).toEqual([
      expect.objectContaining({
        libraryItemId: 13,
        title: "Production Checklist",
        logicalPath: "ops/production-checklist",
      }),
    ]);
  });

  it("falls back to markdown title search when knowledge note rows are unavailable", async () => {
    const missingSchemaError = new Error(
      'relation "library_knowledge_notes" does not exist',
    );

    mockDb.select
      .mockReturnValueOnce(makeSelectRejecting(missingSchemaError))
      .mockReturnValueOnce(makeSelectWithOrder([
        {
          id: 301,
          tenantId: "tenant-1",
          title: "Runbook",
          metadata: { logical_path: "ops/runbook", extension: "md" },
          sourceUrl: "https://example.com/runbook.md",
          itemType: "document",
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        },
        {
          id: 302,
          tenantId: "tenant-1",
          title: "Quarterly Report",
          metadata: { extension: "pdf" },
          sourceUrl: "https://example.com/report.pdf",
          itemType: "document",
          updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ]));

    libraryServiceMocks.getLibraryItemById
      .mockResolvedValueOnce({
        id: 301,
        title: "Runbook",
        metadata: { logical_path: "ops/runbook", extension: "md" },
        sourceUrl: "https://example.com/runbook.md",
        itemType: "document",
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: 302,
        title: "Quarterly Report",
        metadata: { extension: "pdf" },
        sourceUrl: "https://example.com/report.pdf",
        itemType: "document",
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      });

    const result = await quickSwitchLibraryNotes(
      { query: "Runbook" },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        libraryItemId: 301,
        title: "Runbook",
        matchType: "exact_title",
      }),
    ]);
  });

  it("returns an empty property catalog when knowledge schema is unavailable", async () => {
    mockDb.select.mockReturnValueOnce(
      makeSelectRejecting(
        new Error('relation "library_knowledge_notes" does not exist'),
      ),
    );

    const result = await listLibraryPropertyCatalog(
      undefined,
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result).toEqual({ properties: [] });
  });
});
