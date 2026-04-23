import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./groupsService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./groupsService")>();
  return {
    ...orig,
    getUserGroups: vi.fn().mockResolvedValue([]),
  };
});

const knowledgeBackfillMocks = vi.hoisted(() => ({
  buildLibraryKnowledgeRefreshMetadata: vi.fn().mockReturnValue({
    knowledgeRefresh: {
      reason: "markdown_save",
      actorUserId: 5,
      fieldKeys: ["content"],
    },
  }),
}));

const knowledgeRefreshWorkerMocks = vi.hoisted(() => ({
  dispatchLibraryKnowledgeRefreshWorker: vi.fn().mockResolvedValue({
    mode: "inline",
    result: {
      processed: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      jobIds: [],
    },
  }),
}));

vi.mock("./libraryKnowledgeBackfillService", () => ({
  buildLibraryKnowledgeRefreshMetadata:
    knowledgeBackfillMocks.buildLibraryKnowledgeRefreshMetadata,
}));

vi.mock("./libraryKnowledgeRefreshWorker", () => ({
  dispatchLibraryKnowledgeRefreshWorker:
    knowledgeRefreshWorkerMocks.dispatchLibraryKnowledgeRefreshWorker,
}));

import {
  enqueueLibraryIndexJob,
  LibraryMarkdownVersionConflictError,
  listLibraryDocuments,
  saveLibraryMarkdown,
} from "./libraryService";

function makeSelectWithOrder(rows: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithWhere(rows: any[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithLimit(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

const baseDate = new Date("2026-02-11T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
  knowledgeBackfillMocks.buildLibraryKnowledgeRefreshMetadata.mockReturnValue({
    knowledgeRefresh: {
      reason: "markdown_save",
      actorUserId: 5,
      fieldKeys: ["content"],
    },
  });
  knowledgeRefreshWorkerMocks.dispatchLibraryKnowledgeRefreshWorker.mockResolvedValue({
    mode: "inline",
    result: {
      processed: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      jobIds: [],
    },
  });
});

describe("listLibraryDocuments", () => {
  it("separates owner/direct/group items and keeps newest updated first", async () => {
    const items = [
      {
        id: 1,
        tenantId: "50",
        ownerUserId: 5,
        itemType: "md",
        source: "upload",
        title: "My Notes",
        description: "owner file",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() - 5_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        id: 2,
        tenantId: "50",
        ownerUserId: 9,
        itemType: "pdf",
        source: "upload",
        title: "Direct Share",
        description: "directly shared",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://example.com/file.pdf",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() - 4_000),
        updatedAt: new Date(baseDate.getTime() + 2_000),
      },
      {
        id: 3,
        tenantId: "50",
        ownerUserId: 11,
        itemType: "image",
        source: "media_task",
        title: "Group Share",
        description: "shared via role",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://example.com/img.png",
        thumbnailUrl: "https://example.com/thumb.png",
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() - 3_000),
        updatedAt: new Date(baseDate.getTime() + 3_000),
      },
      {
        id: 4,
        tenantId: "50",
        ownerUserId: 12,
        itemType: "md",
        source: "upload",
        title: "Private Hidden",
        description: "not shared",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() - 2_000),
        updatedAt: new Date(baseDate.getTime() + 4_000),
      },
    ];

    const permissions = [
      {
        libraryItemId: 2,
        subjectType: "user",
        subjectId: "5",
        permissionLevel: "read",
        expiresAt: null,
      },
      {
        libraryItemId: 3,
        subjectType: "tenant_role",
        subjectId: "user",
        permissionLevel: "write",
        expiresAt: null,
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelectWithWhere(permissions))
      .mockReturnValueOnce(
        makeSelectWithWhere([
          { libraryItemId: 2 },
          { libraryItemId: 3 },
        ]),
      );

    const result = await listLibraryDocuments(
      { scope: "all", sort: "updated_desc", limit: 10, offset: 0 },
      { userId: 5, tenantId: 50, role: "user" },
    );

    expect(result.results.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(result.results.map((item) => item.access_source)).toEqual([
      "shared_group",
      "shared_direct",
      "owner",
    ]);
  });
});

describe("saveLibraryMarkdown", () => {
  it("throws version conflict when expectedUpdatedAt mismatches current row", async () => {
    const existingItem = {
      id: 44,
      tenantId: "50",
      ownerUserId: 5,
      itemType: "md",
      source: "upload",
      title: "Doc",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-02-11T00:00:00.000Z"),
      updatedAt: new Date("2026-02-11T00:05:00.000Z"),
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existingItem]))
      .mockReturnValueOnce(
        makeSelectWithLimit([
          {
            subjectType: "user",
            subjectId: "5",
            permissionLevel: "write",
            expiresAt: null,
          },
        ]),
      );

    await expect(
      saveLibraryMarkdown(
        {
          itemId: 44,
          content: "# Updated",
          expectedUpdatedAt: new Date("2026-02-11T00:00:00.000Z"),
        },
        { userId: 5, tenantId: 50, role: "user" },
      ),
    ).rejects.toBeInstanceOf(LibraryMarkdownVersionConflictError);
  });

  it("saves markdown content and enqueues markdown_update index job", async () => {
    const existingItem = {
      id: 45,
      tenantId: "50",
      ownerUserId: 5,
      itemType: "md",
      source: "upload",
      title: "Doc",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-02-11T00:00:00.000Z"),
      updatedAt: new Date("2026-02-11T00:05:00.000Z"),
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existingItem]))
      .mockReturnValueOnce(
        makeSelectWithLimit([
          {
            subjectType: "user",
            subjectId: "5",
            permissionLevel: "write",
            expiresAt: null,
          },
        ]),
      )
      .mockReturnValueOnce(makeSelectWithLimit([]))
      .mockReturnValueOnce(makeSelectWithLimit([{ projectId: null }]))
      .mockReturnValueOnce(makeSelectWithLimit([]));

    const chunkConflict = vi.fn().mockResolvedValue(undefined);
    const chunkValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: chunkConflict,
    });

    const jobReturning = vi.fn().mockResolvedValue([
      {
        id: 999,
        status: "pending",
      },
    ]);
    const jobValues = vi.fn().mockReturnValue({
      returning: jobReturning,
    });

    mockDb.insert
      .mockReturnValueOnce({ values: chunkValues })
      .mockReturnValueOnce({ values: jobValues });

    const updateReturning = vi.fn().mockResolvedValue([
      {
        ...existingItem,
        status: "indexing",
        updatedAt: new Date("2026-02-11T00:10:00.000Z"),
      },
    ]);
    const updateWhere = vi.fn().mockResolvedValue([]);

    mockDb.update
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: updateReturning,
          }),
        }),
      })
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: updateWhere,
        }),
      });

    const result = await saveLibraryMarkdown(
      {
        itemId: 45,
        content: "line1\r\nline2",
        expectedUpdatedAt: new Date("2026-02-11T00:05:00.000Z"),
      },
      { userId: 5, tenantId: 50, role: "user" },
    );

    expect(result?.indexJob).toMatchObject({
      jobId: 999,
      status: "pending",
      created: true,
    });
    expect(chunkValues).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryItemId: 45,
        content: "line1\nline2",
        contentType: "markdown_source",
      }),
    );
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("builds knowledge refresh metadata when markdown content is saved", async () => {
    const existingItem = {
      id: 46,
      tenantId: "50",
      ownerUserId: 5,
      itemType: "md",
      source: "upload",
      title: "Doc",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-02-11T00:00:00.000Z"),
      updatedAt: new Date("2026-02-11T00:05:00.000Z"),
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existingItem]))
      .mockReturnValueOnce(
        makeSelectWithLimit([
          {
            subjectType: "user",
            subjectId: "5",
            permissionLevel: "write",
            expiresAt: null,
          },
        ]),
      )
      .mockReturnValueOnce(makeSelectWithLimit([]))
      .mockReturnValueOnce(makeSelectWithLimit([{ projectId: null }]))
      .mockReturnValueOnce(makeSelectWithLimit([]));

    mockDb.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1000,
              status: "pending",
            },
          ]),
        }),
      });

    mockDb.update
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...existingItem,
                status: "indexing",
                updatedAt: new Date("2026-02-11T00:10:00.000Z"),
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

    await saveLibraryMarkdown(
      {
        itemId: 46,
        content: "# Updated",
        expectedUpdatedAt: new Date("2026-02-11T00:05:00.000Z"),
      },
      { userId: 5, tenantId: 50, role: "user" },
    );

    expect(
      knowledgeBackfillMocks.buildLibraryKnowledgeRefreshMetadata,
    ).toHaveBeenCalledWith({
      reason: "markdown_save",
      actorUserId: 5,
      fieldKeys: ["content"],
    });
  });
});

describe("enqueueLibraryIndexJob", () => {
  it("persists payload/source metadata and knowledge-refresh state for new jobs", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([{ projectId: "project-1" }]))
      .mockReturnValueOnce(makeSelectWithLimit([]));

    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 1200,
          status: "pending",
        },
      ]),
    });

    mockDb.insert.mockReturnValueOnce({
      values: insertValues,
    });

    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await enqueueLibraryIndexJob(
      {
        libraryItemId: 77,
        tenantId: "tenant-1",
        jobType: "markdown_update",
        source: "library.markdown_update",
        sourceMetadata: {
          ingestion: "document_management_editor",
          knowledgeRefresh: {
            reason: "markdown_save",
            actorUserId: 5,
            fieldKeys: ["content"],
          },
        },
      },
      mockDb as any,
    );

    expect(result).toMatchObject({
      jobId: 1200,
      status: "pending",
      created: true,
      payloadVersion: "v2",
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        libraryItemId: 77,
        payloadVersion: "v2",
        payloadJson: expect.objectContaining({
          version: "v2",
          source: "library.markdown_update",
          sourceMetadata: expect.objectContaining({
            ingestion: "document_management_editor",
            knowledgeRefresh: expect.objectContaining({
              reason: "markdown_save",
            }),
          }),
        }),
        source: "library.markdown_update",
        sourceMetadataJson: expect.objectContaining({
          ingestion: "document_management_editor",
        }),
        dedupeKey: expect.stringContaining("libidx:v2:library:index:tenant-1:library:77"),
        knowledgeRefreshReason: "markdown_save",
        knowledgeRefreshStatus: "pending",
        knowledgeRefreshAttemptCount: 0,
        knowledgeRefreshRequestedAt: expect.any(Date),
      }),
    );
    expect(
      knowledgeRefreshWorkerMocks.dispatchLibraryKnowledgeRefreshWorker,
    ).toHaveBeenCalledWith({
      jobIds: [1200],
      libraryItemId: 77,
      tenantId: "tenant-1",
    });
  });

  it("preserves knowledge-refresh metadata when duplicate pending jobs already exist", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([{ projectId: null }]))
      .mockReturnValueOnce(makeSelectWithLimit([
        {
          id: 2200,
          status: "pending",
        },
      ]));

    const duplicateUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const duplicateUpdateSet = vi.fn().mockReturnValue({
      where: duplicateUpdateWhere,
    });

    mockDb.update.mockReturnValueOnce({
      set: duplicateUpdateSet,
    });

    const result = await enqueueLibraryIndexJob(
      {
        libraryItemId: 88,
        tenantId: "tenant-2",
        source: "library.share",
        sourceMetadata: {
          knowledgeRefresh: {
            reason: "permission_change",
            actorUserId: 7,
            fieldKeys: ["shares"],
          },
        },
      },
      mockDb as any,
    );

    expect(result).toMatchObject({
      jobId: 2200,
      status: "pending",
      created: false,
    });
    expect(duplicateUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadVersion: "v2",
        payloadJson: expect.objectContaining({
          source: "library.share",
        }),
        knowledgeRefreshReason: "permission_change",
        knowledgeRefreshStatus: "pending",
        knowledgeRefreshRequestedAt: expect.any(Date),
      }),
    );
    expect(
      knowledgeRefreshWorkerMocks.dispatchLibraryKnowledgeRefreshWorker,
    ).toHaveBeenCalledWith({
      jobIds: [2200],
      libraryItemId: 88,
      tenantId: "tenant-2",
    });
  });

  it("does not dispatch the knowledge refresh worker for legacy callers without refresh metadata", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([{ projectId: null }]))
      .mockReturnValueOnce(makeSelectWithLimit([]));

    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 3200,
          status: "pending",
        },
      ]),
    });

    mockDb.insert.mockReturnValueOnce({
      values: insertValues,
    });

    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await enqueueLibraryIndexJob(
      {
        libraryItemId: 91,
        tenantId: "tenant-3",
        source: "library.upload",
        sourceMetadata: {
          ingestion: "document_upload",
        },
      },
      mockDb as any,
    );

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeRefreshReason: null,
        knowledgeRefreshStatus: null,
        knowledgeRefreshRequestedAt: null,
      }),
    );
    expect(
      knowledgeRefreshWorkerMocks.dispatchLibraryKnowledgeRefreshWorker,
    ).not.toHaveBeenCalled();
  });
});
