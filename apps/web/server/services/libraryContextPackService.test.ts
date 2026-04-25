import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
}));

vi.mock("./libraryService", () => ({
  getLibraryItemById: libraryServiceMocks.getLibraryItemById,
  getLibraryMarkdownContent: libraryServiceMocks.getLibraryMarkdownContent,
}));

vi.mock("./librarySavedViewService", () => ({
  executeLibrarySavedView: vi.fn(),
  getLibrarySavedView: vi.fn(),
}));

import {
  executeLibrarySavedView,
  getLibrarySavedView,
} from "./librarySavedViewService";
import {
  approveLibraryContextPack,
  approveLibraryContextPackForAgents,
  convertLibraryContextPackToSnapshot,
  duplicateLibraryContextPackAsSnapshot,
  publishSavedViewAsLibraryContextPack,
  resolveLibraryContextPack,
  submitLibraryContextPackForReview,
  updateLibraryContextPack,
} from "./libraryContextPackService";

const mockExecuteLibrarySavedView = vi.mocked(executeLibrarySavedView);
const mockGetLibrarySavedView = vi.mocked(getLibrarySavedView);

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

function makeSelectWithWhereOrderLimit(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makePackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    tenantId: "tenant-1",
    ownerUserId: 5,
    managingGroupId: null,
    slug: "ops-pack",
    title: "Ops Pack",
    description: null,
    status: "active",
    sourceMode: "manual",
    savedViewId: null,
    relationExpansionPolicy: "none",
    defaultRuntimeTier: "retrieved_evidence",
    budgetProfile: "retrieval",
    maxNoteCount: null,
    maxTokenHint: 10_000,
    freshnessExpectation: null,
    readinessStatus: "draft",
    approvedForAgents: false,
    submittedForReviewAt: null,
    reviewedAt: null,
    approvedAt: null,
    reviewerUserId: null,
    lastSourceMutationAt: null,
    freshUntil: null,
    metadata: {},
    archivedAt: null,
    createdAt: new Date("2026-04-21T00:00:00.000Z"),
    updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
  mockGetLibrarySavedView.mockResolvedValue(null);
  mockExecuteLibrarySavedView.mockResolvedValue({
    items: [],
    total: 0,
    diagnostics: [],
  } as any);
});

describe("libraryContextPackService", () => {
  it("resolves manual context packs into note context items", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeSelectWithLimit([
          {
            id: 44,
            tenantId: "tenant-1",
            ownerUserId: 5,
            slug: "ops-pack",
            title: "Ops Pack",
            description: null,
            status: "active",
            sourceMode: "manual",
            savedViewId: null,
            relationExpansionPolicy: "none",
            defaultRuntimeTier: "retrieved_evidence",
            budgetProfile: "retrieval",
            maxNoteCount: null,
            maxTokenHint: 10_000,
            freshnessExpectation: null,
            readinessStatus: "trusted",
            approvedForAgents: true,
            metadata: {},
            archivedAt: null,
            createdAt: new Date("2026-04-21T00:00:00.000Z"),
            updatedAt: new Date("2026-04-21T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectWithWhere([
          {
            id: 1,
            tenantId: "tenant-1",
            contextPackId: 44,
            libraryItemId: 101,
            memberMode: "include",
            orderIndex: 0,
          },
        ]),
      );

    libraryServiceMocks.getLibraryItemById.mockResolvedValue({
      id: 101,
      title: "Runbook",
      itemType: "md",
      description: null,
      metadata: { logical_path: "ops/runbook" },
      updatedAt: new Date(),
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 101,
      content: "# Runbook\n\nProcess",
      updated_at: new Date().toISOString(),
    });

    const result = await resolveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeCitations: true,
        failIfPartial: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.status).toBe("complete");
    expect(result.items).toEqual([
      expect.objectContaining({
        libraryItemId: 101,
        title: "Runbook",
        logicalPath: "ops/runbook",
      }),
    ]);
    expect(result.totals.resolvedCount).toBe(1);
  });

  it("expands trusted context packs with one-hop graph relations", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeSelectWithLimit([
          makePackRow({
            relationExpansionPolicy: "one_hop_gated",
            readinessStatus: "trusted",
            approvedForAgents: true,
          }),
        ]),
      )
      .mockReturnValueOnce(
        makeSelectWithWhere([
          {
            id: 1,
            tenantId: "tenant-1",
            contextPackId: 44,
            libraryItemId: 101,
            memberMode: "include",
            orderIndex: 0,
          },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectWithWhere([
          {
            id: 77,
            tenantId: "tenant-1",
            sourceLibraryItemId: 101,
            targetLibraryItemId: 202,
            relationKind: "wikilink",
            rawReference: "Architecture",
            displayText: null,
            targetPath: "ops/architecture",
            targetHeading: null,
            resolutionStatus: "resolved",
            matchedBy: "logical_path",
            matchedValue: "ops/architecture",
            candidateLibraryItemIds: [],
            diagnostics: {},
            extractedAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      );

    libraryServiceMocks.getLibraryItemById.mockImplementation(async (itemId: number) => {
      if (itemId === 101) {
        return {
          id: 101,
          title: "Runbook",
          itemType: "md",
          description: null,
          metadata: { logical_path: "ops/runbook" },
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        };
      }
      if (itemId === 202) {
        return {
          id: 202,
          title: "Architecture",
          itemType: "md",
          description: null,
          metadata: { logical_path: "ops/architecture" },
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        };
      }
      return null;
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockImplementation(async (itemId: number) => ({
      item_id: itemId,
      content: itemId === 101
        ? "# Runbook\n\nProcess"
        : "# Architecture\n\nSystem map",
      updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
    }));

    const result = await resolveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeCitations: true,
        failIfPartial: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.relationExpansionApplied).toBe(true);
    expect(result.totals.candidateCount).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        libraryItemId: 101,
        includedReason: "Explicitly included in context pack",
      }),
      expect.objectContaining({
        libraryItemId: 202,
        includedReason: expect.stringContaining("One-hop graph expansion"),
        citations: expect.arrayContaining([
          expect.objectContaining({ sourceRef: "library_relation:77" }),
          expect.objectContaining({ sourceRef: "library_item:101" }),
          expect.objectContaining({ sourceRef: "library_item:202" }),
        ]),
      }),
    ]);
  });

  it("reports snapshot drift while resolving readable current content", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeSelectWithLimit([
          makePackRow({
            sourceMode: "snapshot",
            readinessStatus: "trusted",
            approvedForAgents: true,
            metadata: {
              snapshotDriftPolicy: "diagnose_only",
            },
          }),
        ]),
      )
      .mockReturnValueOnce(
        makeSelectWithWhere([
          {
            id: 1,
            tenantId: "tenant-1",
            contextPackId: 44,
            libraryItemId: 101,
            memberMode: "include",
            orderIndex: 0,
            snapshotMetadata: {
              title: "Old Runbook",
              logicalPath: "ops/old-runbook",
              contentFingerprint: "sha256:old-fingerprint",
              capturedAt: "2026-04-20T00:00:00.000Z",
              capturedByUserId: 5,
              savedViewId: null,
            },
          },
        ]),
      );

    libraryServiceMocks.getLibraryItemById.mockResolvedValue({
      id: 101,
      title: "Current Runbook",
      itemType: "md",
      description: null,
      metadata: { logical_path: "ops/current-runbook" },
      updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 101,
      content: "# Current Runbook\n\nUpdated process",
      updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
    });

    const result = await resolveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeCitations: true,
        failIfPartial: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.status).toBe("partial");
    expect(result.items[0]).toMatchObject({
      libraryItemId: 101,
      title: "Current Runbook",
      logicalPath: "ops/current-runbook",
      includedReason: "Frozen snapshot context-pack note",
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SNAPSHOT_CONTENT_DRIFT" }),
        expect.objectContaining({ code: "SNAPSHOT_METADATA_DRIFT" }),
      ]),
    );
  });

  it("does not resolve content from archived context packs", async () => {
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([
        makePackRow({
          status: "archived",
          archivedAt: new Date("2026-04-22T00:00:00.000Z"),
          readinessStatus: "trusted",
          approvedForAgents: false,
        }),
      ]),
    );

    const result = await resolveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeCitations: true,
        failIfPartial: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.status).toBe("empty");
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PACK_ARCHIVED",
          severity: "error",
        }),
      ]),
    );
    expect(libraryServiceMocks.getLibraryItemById).not.toHaveBeenCalled();
  });

  it("auto-demotes trusted snapshots when drift policy requires it", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeSelectWithLimit([
          makePackRow({
            sourceMode: "snapshot",
            readinessStatus: "trusted",
            approvedForAgents: true,
            metadata: {
              snapshotDriftPolicy: "demote_trusted",
            },
          }),
        ]),
      )
      .mockReturnValueOnce(
        makeSelectWithWhere([
          {
            id: 1,
            tenantId: "tenant-1",
            contextPackId: 44,
            libraryItemId: 101,
            memberMode: "include",
            orderIndex: 0,
            snapshotMetadata: {
              title: "Old Runbook",
              logicalPath: "ops/old-runbook",
              contentFingerprint: "sha256:old-fingerprint",
              capturedAt: "2026-04-20T00:00:00.000Z",
              capturedByUserId: 5,
              savedViewId: null,
            },
          },
        ]),
      );
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            makePackRow({
              sourceMode: "snapshot",
              readinessStatus: "stale",
              approvedForAgents: false,
              metadata: {
                snapshotDriftPolicy: "demote_trusted",
              },
            }),
          ]),
        }),
      }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    libraryServiceMocks.getLibraryItemById.mockResolvedValue({
      id: 101,
      title: "Current Runbook",
      itemType: "md",
      description: null,
      metadata: { logical_path: "ops/current-runbook" },
      updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    });
    libraryServiceMocks.getLibraryMarkdownContent.mockResolvedValue({
      item_id: 101,
      content: "# Current Runbook\n\nUpdated process",
      updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
    });

    const result = await resolveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeCitations: true,
        failIfPartial: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.pack.readinessStatus).toBe("stale");
    expect(result.pack.approvedForAgents).toBe(false);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("publishes a saved view as a snapshot with frozen member metadata", async () => {
    const created = makePackRow({
      sourceMode: "snapshot",
      savedViewId: 77,
      metadata: {
        publishedFromSavedViewId: 77,
        snapshotCapturedFromSavedView: true,
        snapshotCandidateCount: 2,
      },
    });
    const memberRows = [
      {
        id: 1,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 101,
        memberMode: "include",
        orderIndex: 0,
        snapshotMetadata: {
          title: "Runbook A",
          logicalPath: "ops/a",
          contentFingerprint: "sha256:a",
        },
      },
      {
        id: 2,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 102,
        memberMode: "include",
        orderIndex: 1,
        snapshotMetadata: {
          title: "Runbook B",
          logicalPath: "ops/b",
          contentFingerprint: "sha256:b",
        },
      },
    ];

    mockGetLibrarySavedView.mockResolvedValue({
      id: 77,
      title: "Ops View",
      queryDefinition: {
        query: "runbook",
        scope: "my_library",
        sort: "updated_desc",
      },
    } as any);
    mockExecuteLibrarySavedView.mockResolvedValue({
      items: [{ id: 101 }, { id: 102 }],
      total: 2,
      diagnostics: [],
    } as any);
    mockDb.select
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(makeSelectWithWhere(memberRows))
      .mockReturnValueOnce(makeSelectWithWhereOrderLimit([]));

    const contextPackInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([created]),
    });
    const memberInsertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert
      .mockReturnValueOnce({ values: contextPackInsertValues })
      .mockReturnValueOnce({ values: memberInsertValues });
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    libraryServiceMocks.getLibraryItemById.mockImplementation((itemId: number) =>
      Promise.resolve({
        id: itemId,
        title: itemId === 101 ? "Runbook A" : "Runbook B",
        itemType: "md",
        description: null,
        metadata: { logical_path: itemId === 101 ? "ops/a" : "ops/b" },
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      }),
    );
    libraryServiceMocks.getLibraryMarkdownContent.mockImplementation((itemId: number) =>
      Promise.resolve({
        item_id: itemId,
        content: itemId === 101 ? "# A" : "# B",
        updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
      }),
    );

    const result = await publishSavedViewAsLibraryContextPack(
      {
        savedViewId: 77,
        title: "Ops Snapshot",
        snapshot: true,
        pinnedItemIds: [],
        excludedItemIds: [],
        defaultRuntimeTier: "retrieved_evidence",
        approvedForAgents: false,
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.sourceMode).toBe("snapshot");
    expect(contextPackInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMode: "snapshot",
        savedViewId: 77,
        metadata: expect.objectContaining({
          snapshotCapturedFromSavedView: true,
          snapshotCandidateCount: 2,
          snapshotSavedViewQueryHash: expect.stringMatching(/^sha256:/),
        }),
      }),
    );
    expect(memberInsertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          libraryItemId: 101,
          snapshotMetadata: expect.objectContaining({
            title: "Runbook A",
            logicalPath: "ops/a",
            contentFingerprint: expect.stringMatching(/^sha256:/),
            capturedByUserId: 5,
            savedViewId: 77,
            savedViewQueryHash: expect.stringMatching(/^sha256:/),
          }),
        }),
        expect.objectContaining({
          libraryItemId: 102,
          snapshotMetadata: expect.objectContaining({
            title: "Runbook B",
            logicalPath: "ops/b",
            contentFingerprint: expect.stringMatching(/^sha256:/),
            capturedByUserId: 5,
            savedViewId: 77,
            savedViewQueryHash: expect.stringMatching(/^sha256:/),
          }),
        }),
      ]),
    );
  });

  it("converts a manual pack into a draft snapshot with frozen membership metadata", async () => {
    const existing = makePackRow({
      sourceMode: "manual",
      readinessStatus: "trusted",
      approvedForAgents: true,
    });
    const updated = makePackRow({
      sourceMode: "snapshot",
      readinessStatus: "draft",
      approvedForAgents: false,
      metadata: {
        snapshotConvertedFromSourceMode: "manual",
        snapshotDriftPolicy: "demote_trusted",
      },
    });
    const members = [
      {
        id: 1,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 101,
        memberMode: "include",
        orderIndex: 0,
      },
      {
        id: 2,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 102,
        memberMode: "pin",
        orderIndex: 0,
      },
      {
        id: 3,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 103,
        memberMode: "exclude",
        orderIndex: 0,
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existing]))
      .mockReturnValueOnce(makeSelectWithWhere(members))
      .mockReturnValueOnce(makeSelectWithWhere(members))
      .mockReturnValueOnce(makeSelectWithWhereOrderLimit([]));

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: insertValues,
    });
    libraryServiceMocks.getLibraryItemById.mockImplementation((itemId: number) =>
      Promise.resolve({
        id: itemId,
        title: `Note ${itemId}`,
        itemType: "md",
        description: null,
        metadata: { logical_path: `ops/${itemId}` },
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      }),
    );
    libraryServiceMocks.getLibraryMarkdownContent.mockImplementation((itemId: number) =>
      Promise.resolve({
        item_id: itemId,
        content: `# Note ${itemId}`,
        updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
      }),
    );

    const result = await convertLibraryContextPackToSnapshot(
      {
        ref: { slug: "ops-pack" },
        reason: "freeze current membership",
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.sourceMode).toBe("snapshot");
    expect(result.readinessStatus).toBe("draft");
    expect(result.approvedForAgents).toBe(false);
    expect(insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          libraryItemId: 101,
          snapshotMetadata: expect.objectContaining({
            title: "Note 101",
            logicalPath: "ops/101",
            contentFingerprint: expect.stringMatching(/^sha256:/),
          }),
        }),
      ]),
    );
  });

  it("duplicates a view-backed pack into a new snapshot pack", async () => {
    const existing = makePackRow({
      sourceMode: "view_backed",
      savedViewId: 77,
      title: "Ops Dynamic Pack",
    });
    const created = makePackRow({
      sourceMode: "snapshot",
      savedViewId: 77,
      title: "Ops Dynamic Pack Snapshot",
      metadata: {
        snapshotDuplicatedFromContextPackId: 44,
        snapshotDuplicatedFromSourceMode: "view_backed",
      },
    });
    const memberRows = [
      {
        id: 1,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 101,
        memberMode: "pin",
        orderIndex: 0,
      },
      {
        id: 2,
        tenantId: "tenant-1",
        contextPackId: 44,
        libraryItemId: 103,
        memberMode: "exclude",
        orderIndex: 0,
      },
    ];

    mockGetLibrarySavedView.mockResolvedValue({
      id: 77,
      title: "Ops View",
      queryDefinition: {
        query: "runbook",
        scope: "my_library",
        sort: "updated_desc",
      },
    } as any);
    mockExecuteLibrarySavedView.mockResolvedValue({
      items: [{ id: 101 }, { id: 102 }, { id: 103 }],
      total: 3,
      diagnostics: [],
    } as any);
    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existing]))
      .mockReturnValueOnce(makeSelectWithWhere(memberRows))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(makeSelectWithWhere(memberRows))
      .mockReturnValueOnce(makeSelectWithWhereOrderLimit([]));

    const contextPackInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([created]),
    });
    const memberInsertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert
      .mockReturnValueOnce({ values: contextPackInsertValues })
      .mockReturnValueOnce({ values: memberInsertValues });
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    libraryServiceMocks.getLibraryItemById.mockImplementation((itemId: number) =>
      Promise.resolve({
        id: itemId,
        title: `Note ${itemId}`,
        itemType: "md",
        description: null,
        metadata: { logical_path: `ops/${itemId}` },
        updatedAt: new Date("2026-04-21T00:00:00.000Z"),
      }),
    );
    libraryServiceMocks.getLibraryMarkdownContent.mockImplementation((itemId: number) =>
      Promise.resolve({
        item_id: itemId,
        content: `# Note ${itemId}`,
        updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
      }),
    );

    const result = await duplicateLibraryContextPackAsSnapshot(
      {
        ref: { slug: "ops-pack" },
        title: "Ops Dynamic Pack Snapshot",
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.sourceMode).toBe("snapshot");
    expect(contextPackInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMode: "snapshot",
        savedViewId: 77,
        metadata: expect.objectContaining({
          snapshotDuplicatedFromContextPackId: 44,
          snapshotDuplicatedFromSourceMode: "view_backed",
          snapshotSavedViewQueryHash: expect.stringMatching(/^sha256:/),
        }),
      }),
    );
    expect(memberInsertValues).toHaveBeenCalled();
  });

  it("rejects direct review-state mutations through the generic update API", async () => {
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([makePackRow()]),
    );

    await expect(
      updateLibraryContextPack(
        {
          ref: { slug: "ops-pack" },
          readinessStatus: "trusted",
        } as any,
        { userId: 5, tenantId: "tenant-1", role: "user" },
      ),
    ).rejects.toThrow(/explicit workflow actions/i);
  });

  it("submits a draft pack for review and appends an audit event", async () => {
    const existing = makePackRow();
    const updated = makePackRow({
      readinessStatus: "review_pending",
      submittedForReviewAt: new Date("2026-04-22T00:00:00.000Z"),
      updatedAt: new Date("2026-04-22T00:00:00.000Z"),
    });

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existing]))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(
        makeSelectWithWhereOrderLimit([
          {
            id: 1001,
            contextPackId: 44,
            actorUserId: 5,
            action: "submit_for_review",
            previousReadinessStatus: "draft",
            nextReadinessStatus: "review_pending",
            previousApprovedForAgents: false,
            nextApprovedForAgents: false,
            reason: "ready",
            metadata: {},
            createdAt: new Date("2026-04-22T00:00:00.000Z"),
          },
        ]),
      );

    const reviewEventInsertValues = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updated]),
      }),
    });

    mockDb.update.mockReturnValue({
      set: updateSet,
    });
    mockDb.insert.mockReturnValue({
      values: reviewEventInsertValues,
    });

    const result = await submitLibraryContextPackForReview(
      {
        ref: { slug: "ops-pack" },
        reason: "ready",
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.readinessStatus).toBe("review_pending");
    expect(result.reviewHistory[0]).toMatchObject({
      action: "submit_for_review",
      previousReadinessStatus: "draft",
      nextReadinessStatus: "review_pending",
    });
    expect(reviewEventInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contextPackId: 44,
        action: "submit_for_review",
        previousReadinessStatus: "draft",
        nextReadinessStatus: "review_pending",
      }),
    );
  });

  it("approves a review-pending pack as trusted and records reviewer audit state", async () => {
    const existing = makePackRow({
      readinessStatus: "review_pending",
      submittedForReviewAt: new Date("2026-04-22T00:00:00.000Z"),
    });
    const updated = makePackRow({
      readinessStatus: "trusted",
      reviewedAt: new Date("2026-04-23T00:00:00.000Z"),
      reviewerUserId: 9,
      updatedAt: new Date("2026-04-23T00:00:00.000Z"),
    });

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existing]))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(
        makeSelectWithWhereOrderLimit([
          {
            id: 1002,
            contextPackId: 44,
            actorUserId: 9,
            action: "approve_trusted",
            previousReadinessStatus: "review_pending",
            nextReadinessStatus: "trusted",
            previousApprovedForAgents: false,
            nextApprovedForAgents: false,
            reason: "approved",
            metadata: {},
            createdAt: new Date("2026-04-23T00:00:00.000Z"),
          },
        ]),
      );

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });
    const reviewEventInsertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: reviewEventInsertValues,
    });

    const result = await approveLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        reason: "approved",
      },
      { userId: 9, tenantId: "tenant-1", role: "admin" },
    );

    expect(result.readinessStatus).toBe("trusted");
    expect(result.reviewerUserId).toBe(9);
    expect(reviewEventInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approve_trusted",
        previousReadinessStatus: "review_pending",
        nextReadinessStatus: "trusted",
      }),
    );
  });

  it("blocks agent approval unless the pack is already trusted", async () => {
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([
        makePackRow({
          readinessStatus: "review_pending",
        }),
      ]),
    );

    await expect(
      approveLibraryContextPackForAgents(
        {
          ref: { slug: "ops-pack" },
          reason: "ship it",
        },
        { userId: 9, tenantId: "tenant-1", role: "admin" },
      ),
    ).rejects.toThrow(/only trusted context packs/i);
  });

  it("auto-demotes trusted packs to stale when structural membership changes occur", async () => {
    const existing = makePackRow({
      readinessStatus: "trusted",
      approvedForAgents: true,
      reviewedAt: new Date("2026-04-23T00:00:00.000Z"),
      reviewerUserId: 9,
    });
    const updated = makePackRow({
      readinessStatus: "stale",
      approvedForAgents: false,
      lastSourceMutationAt: new Date("2026-04-24T00:00:00.000Z"),
      updatedAt: new Date("2026-04-24T00:00:00.000Z"),
    });

    mockDb.select
      .mockReturnValueOnce(makeSelectWithLimit([existing]))
      .mockReturnValueOnce(makeSelectWithWhere([]))
      .mockReturnValueOnce(makeSelectWithWhereOrderLimit([]));

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDb.insert
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      });

    const result = await updateLibraryContextPack(
      {
        ref: { slug: "ops-pack" },
        includeItemIds: [101, 102],
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.readinessStatus).toBe("stale");
    expect(result.approvedForAgents).toBe(false);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    expect(mockDb.insert.mock.calls[1]?.[0]).toBeDefined();
  });
});
