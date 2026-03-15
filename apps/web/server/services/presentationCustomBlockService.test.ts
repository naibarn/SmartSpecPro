import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string) => ({
    key,
    url: `/api/storage/files/${key}`,
  })),
  storageDelete: vi.fn(async () => undefined),
}));

vi.mock("../../drizzle/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../drizzle/schema")>();
  return {
    ...actual,
    contentArtifacts: {
      id: "id",
      userId: "userId",
      tenantId: "tenantId",
      skillSlug: "skillSlug",
      outputFormat: "outputFormat",
      status: "status",
      contentJson: "contentJson",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...parts: unknown[]) => ({ kind: "and", parts }),
    eq: (left: unknown, right: unknown) => ({ kind: "eq", left, right }),
    desc: (value: unknown) => ({ kind: "desc", value }),
    inArray: (left: unknown, right: unknown[]) => ({ kind: "inArray", left, right }),
  };
});

import { getDb } from "../db";
import { storagePut } from "../storage";
import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";
import {
  listPresentationCustomBlockGovernanceAudit,
  listPresentationCustomBlocks,
  resetPresentationPreviewArtifactCacheForTests,
  renderPresentationCustomBlockPreview,
  updatePresentationCustomBlock,
} from "./presentationCustomBlockService";

const mockGetDb = vi.mocked(getDb);
const mockStoragePut = vi.mocked(storagePut);

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    preview: {
      artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
      artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
      previewHash: "hash-1",
      rendererVersion: "server-svg-v1",
      generatedAt: "2026-03-13T00:00:00.000Z",
    },
    governanceEvents: [],
    ...overrides,
  };
}

function createListDb(rows: Array<{ id: number; userId: number; contentJson: unknown; createdAt: Date }>) {
  const orderByResult = {
    limit: vi.fn().mockResolvedValue(rows),
    then: (onFulfilled: (value: typeof rows) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => orderByResult),
        })),
      })),
    })),
  } as any;
}

function createGetAndUpdateDb(row: { id: number; userId: number; contentJson: unknown; createdAt: Date }) {
  const whereForUpdate = vi.fn().mockResolvedValue([]);
  const setForUpdate = vi.fn().mockReturnValue({ where: whereForUpdate });
  const update = vi.fn().mockReturnValue({ set: setForUpdate });
  const insertValues = vi.fn().mockResolvedValue([]);
  const insert = vi.fn().mockReturnValue({ values: insertValues });
  const limit = vi.fn().mockResolvedValue([row]);
  const whereForSelect = vi.fn().mockReturnValue({ limit });
  const fromForSelect = vi.fn().mockReturnValue({ where: whereForSelect });
  const select = vi.fn().mockReturnValue({ from: fromForSelect });
  return {
    db: {
      select,
      update,
      insert,
    } as any,
    mocks: {
      update,
      setForUpdate,
      whereForUpdate,
      insert,
      insertValues,
      limit,
    },
  };
}

describe("presentationCustomBlockService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPresentationPreviewArtifactCacheForTests();
  });

  it("renders a deterministic preview payload for preview sources", async () => {
    const preview = await renderPresentationCustomBlockPreview({
      previewSource: {
        canvas: { width: 1280, height: 720 },
        background: { type: "color", value: "#f0f9ff" },
        fallbackElements: [
          { id: "t-1", type: "text", x: 120, y: 120, width: 400, height: 80, text: "Preview Title", color: "#111827" },
        ],
      },
    });

    expect(preview.rendererVersion).toBe("server-svg-v1");
    expect(preview.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.svg).toContain("Preview Title");
    expect(preview.svg).toContain("#f0f9ff");
  });

  it("caches canonical preview artifacts per tenant and rewrites remote backgrounds through the image proxy", async () => {
    const previewSource = {
      canvas: { width: 1280, height: 720 },
      background: { type: "image", url: "https://cdn.example.com/bg.png" } as const,
      fallbackElements: [
        { id: "t-1", type: "text", x: 120, y: 120, width: 300, height: 80, text: "Preview Title", color: "#111827" as const },
      ],
    };

    const actor = { userId: 7, tenantId: "tenant-1", role: "admin" } as const;
    const firstPreview = await renderPresentationCustomBlockPreview({ previewSource }, actor as any);
    const secondPreview = await renderPresentationCustomBlockPreview({ previewSource }, actor as any);

    expect(firstPreview.artifactKey).toBe(`presentation/preview-cache/tenant-1/${firstPreview.previewHash}.svg`);
    expect(firstPreview.artifactUrl).toBe(`/api/storage/files/presentation/preview-cache/tenant-1/${firstPreview.previewHash}.svg`);
    expect(firstPreview.svg).toContain("/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fbg.png");
    expect(secondPreview.artifactKey).toBe(firstPreview.artifactKey);
    expect(mockStoragePut).toHaveBeenCalledTimes(1);
  });

  it("reuses persisted preview cache metadata when the process cache is cold", async () => {
    const previewSource = {
      canvas: { width: 1280, height: 720 },
      fallbackElements: [
        { id: "t-1", type: "text", x: 120, y: 120, width: 300, height: 80, text: "Persisted Preview", color: "#111827" },
      ],
    };
    const anonymousPreview = await renderPresentationCustomBlockPreview({ previewSource });
    resetPresentationPreviewArtifactCacheForTests();
    mockGetDb.mockResolvedValue(createListDb([
      {
        id: 99,
        userId: 7,
        contentJson: {
          previewHash: anonymousPreview.previewHash,
          rendererVersion: anonymousPreview.rendererVersion,
          artifactKey: `presentation/preview-cache/tenant-1/${anonymousPreview.previewHash}.svg`,
          artifactUrl: `/api/storage/files/presentation/preview-cache/tenant-1/${anonymousPreview.previewHash}.svg`,
          generatedAt: "2026-03-13T00:00:00.000Z",
        },
        createdAt: new Date("2026-03-13T00:00:00.000Z"),
      },
    ]));

    const preview = await renderPresentationCustomBlockPreview(
      { previewSource },
      { userId: 7, tenantId: "tenant-1", role: "admin" } as any,
    );

    expect(preview.artifactKey).toBe(`presentation/preview-cache/tenant-1/${anonymousPreview.previewHash}.svg`);
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("archives old preview cache metadata rows when retention cleanup runs", async () => {
    const previewSource = {
      canvas: { width: 1280, height: 720 },
      fallbackElements: [
        { id: "t-1", type: "text", x: 120, y: 120, width: 300, height: 80, text: "Cleanup Preview", color: "#111827" },
      ],
    };
    const cleanupRows = Array.from({ length: 513 }, (_, index) => ({
      id: index + 1,
      createdAt: new Date(`2026-03-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`),
    }));

    const cleanupWhere = vi.fn().mockResolvedValue([]);
    const cleanupSet = vi.fn().mockReturnValue({ where: cleanupWhere });
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(cleanupRows),
              })),
            })),
          })),
        }),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue([]),
      })),
      update: vi.fn().mockReturnValue({
        set: cleanupSet,
      }),
    } as any;
    mockGetDb.mockResolvedValue(db);

    await renderPresentationCustomBlockPreview(
      { previewSource },
      { userId: 7, tenantId: "tenant-1", role: "admin" } as any,
    );

    expect(cleanupSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "archived",
    }));
    expect(cleanupWhere).toHaveBeenCalled();
  });

  it("treats mine scope as owned blocks only and team scope as all team-visible blocks", async () => {
    mockGetDb.mockResolvedValue(createListDb([
      { id: 1, userId: 7, contentJson: makeRecord({ visibility: "team" }), createdAt: new Date("2026-03-13T00:00:00.000Z") },
      { id: 2, userId: 9, contentJson: makeRecord({ label: "Shared Block", visibility: "team" }), createdAt: new Date("2026-03-12T00:00:00.000Z") },
      { id: 3, userId: 9, contentJson: makeRecord({ label: "Private Block", visibility: "private" }), createdAt: new Date("2026-03-11T00:00:00.000Z") },
    ]));

    const actor = { userId: 7, tenantId: "tenant-1", role: "user" } as const;
    const mineBlocks = await listPresentationCustomBlocks({ scope: "mine", sort: "featured" }, actor as any);
    const teamBlocks = await listPresentationCustomBlocks({ scope: "team", sort: "featured" }, actor as any);

    expect(mineBlocks.map((block) => block.id)).toEqual(["1"]);
    expect(teamBlocks.map((block) => block.id)).toEqual(["1", "2"]);
  });

  it("sorts recent activity by the latest governance timestamp before savedAt", async () => {
    mockGetDb.mockResolvedValue(createListDb([
      {
        id: 1,
        userId: 7,
        contentJson: makeRecord({
          label: "Featured Story",
          governanceEvents: [{
            eventType: "featured_changed",
            actorUserId: 1,
            actorRole: "admin",
            recordedAt: "2026-03-13T08:00:00.000Z",
            detail: "Block featured for team",
          }],
        }),
        createdAt: new Date("2026-03-13T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: 7,
        contentJson: makeRecord({
          label: "Transferred Story",
          governanceEvents: [{
            eventType: "ownership_transferred",
            actorUserId: 1,
            actorRole: "admin",
            recordedAt: "2026-03-13T12:00:00.000Z",
            detail: "Ownership transferred to user 22",
          }],
        }),
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
      },
    ]));

    const actor = { userId: 7, tenantId: "tenant-1", role: "admin" } as const;
    const blocks = await listPresentationCustomBlocks({ scope: "team", sort: "recent_activity" }, actor as any);

    expect(blocks.map((block) => block.label)).toEqual(["Transferred Story", "Featured Story"]);
  });

  it("lists governance audit entries across custom blocks for admin views", async () => {
    mockGetDb.mockResolvedValue(createListDb([
      {
        id: 1,
        userId: 7,
        contentJson: makeRecord({
          label: "Transferred Story",
          governanceEvents: [{
            eventType: "ownership_transferred",
            actorUserId: 1,
            actorRole: "admin",
            recordedAt: "2026-03-13T12:00:00.000Z",
            detail: "Ownership transferred to user 22",
          }],
        }),
        createdAt: new Date("2026-03-13T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: 7,
        contentJson: makeRecord({
          label: "Featured Story",
          governanceEvents: [{
            eventType: "featured_changed",
            actorUserId: 2,
            actorRole: "domain_admin",
            recordedAt: "2026-03-13T08:00:00.000Z",
            detail: "Block featured for team",
          }],
        }),
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
      },
    ]));

    const entries = await listPresentationCustomBlockGovernanceAudit(
      { eventType: "ownership_transferred", limit: 20 },
      { userId: 7, tenantId: "tenant-1", role: "admin" } as any,
    );

    expect(entries).toEqual([
      expect.objectContaining({
        blockId: "1",
        blockLabel: "Transferred Story",
        actorRole: "admin",
        eventType: "ownership_transferred",
      }),
    ]);
  });

  it("prefers indexed governance audit artifacts when present", async () => {
    mockGetDb.mockResolvedValue(createListDb([
      {
        id: 99,
        userId: 22,
        contentJson: {
          blockId: "77",
          blockLabel: "Featured Story",
          ownerUserId: 22,
          visibility: "team",
          eventType: "featured_changed",
          actorUserId: 3,
          actorRole: "admin",
          recordedAt: "2026-03-13T10:30:00.000Z",
          detail: "Block featured for team",
          indexedAt: "2026-03-13T10:30:01.000Z",
        },
        createdAt: new Date("2026-03-13T10:30:01.000Z"),
      },
    ]));

    const entries = await listPresentationCustomBlockGovernanceAudit(
      { eventType: "featured_changed", limit: 20 },
      { userId: 7, tenantId: "tenant-1", role: "admin" } as any,
    );

    expect(entries).toEqual([
      expect.objectContaining({
        blockId: "77",
        blockLabel: "Featured Story",
        eventType: "featured_changed",
        actorUserId: 3,
      }),
    ]);
  });

  it("rejects team feature governance updates from non-admin actors", async () => {
    const { db } = createGetAndUpdateDb({
      id: 1,
      userId: 7,
      contentJson: makeRecord({ visibility: "team" }),
      createdAt: new Date("2026-03-13T00:00:00.000Z"),
    });
    mockGetDb.mockResolvedValue(db);

    await expect(updatePresentationCustomBlock(
      { blockId: "1", isTeamFeatured: true },
      { userId: 7, tenantId: "tenant-1", role: "user" } as any,
    )).rejects.toMatchObject({
      code: PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
    });
  });

  it("allows tenant admins to transfer ownership and records governance events", async () => {
    const { db, mocks } = createGetAndUpdateDb({
      id: 1,
      userId: 7,
      contentJson: makeRecord({ visibility: "team" }),
      createdAt: new Date("2026-03-13T00:00:00.000Z"),
    });
    mockGetDb.mockResolvedValue(db);

    const block = await updatePresentationCustomBlock(
      { blockId: "1", isTeamFeatured: true, transferToUserId: 22 },
      { userId: 3, tenantId: "tenant-1", role: "admin" } as any,
    );

    expect(mocks.setForUpdate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 22,
      contentJson: expect.objectContaining({
        visibility: "team",
        isTeamFeatured: false,
        governanceEvents: expect.arrayContaining([
          expect.objectContaining({ eventType: "featured_changed", actorUserId: 3 }),
          expect.objectContaining({ eventType: "ownership_transferred", actorUserId: 3 }),
        ]),
      }),
    }));
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 7,
        skillSlug: "presentation-custom-block-governance",
        outputFormat: "presentation_custom_block_governance_v1",
        contentJson: expect.objectContaining({
          blockId: "1",
          eventType: "featured_changed",
        }),
      }),
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 22,
        skillSlug: "presentation-custom-block-governance",
        outputFormat: "presentation_custom_block_governance_v1",
        contentJson: expect.objectContaining({
          blockId: "1",
          eventType: "ownership_transferred",
        }),
      }),
    ]));
    expect(block.ownerUserId).toBe(22);
    expect(block.canFeature).toBe(true);
    expect(block.canTransferOwnership).toBe(true);
  });
});
