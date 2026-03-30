import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockCreatePublishingDraft: vi.fn(),
  mockPublishPublishingPostNow: vi.fn(),
  mockPublishUploadPostNow: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mocks.mockGetDb,
}));

vi.mock("../socialPublishingService", () => ({
  createPublishingDraft: mocks.mockCreatePublishingDraft,
  publishPublishingPostNow: mocks.mockPublishPublishingPostNow,
}));

vi.mock("../uploadPostService", () => ({
  publishUploadPostNow: mocks.mockPublishUploadPostNow,
}));

import { buildComposerStreamPayload, publishContentComposerDraft } from "../contentComposerPublishService";

function createChain(rows: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async (count?: number) => (typeof count === "number" ? rows.slice(0, count) : rows)),
    orderBy: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    returning: vi.fn(async () => rows),
    then: vi.fn((resolve: (value: any[]) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
  return chain;
}

describe("contentComposerPublishService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetDb.mockReset();
    mocks.mockCreatePublishingDraft.mockReset();
    mocks.mockPublishPublishingPostNow.mockReset();
    mocks.mockPublishUploadPostNow.mockReset();
  });

  it("builds a stream payload with an article shell and platform caption", () => {
    const payload = buildComposerStreamPayload({
      topic: "Launch plan",
      executionSource: "agency",
      skillId: null,
      agencyName: "Launch Agency",
      requiresWebSearch: true,
      requiresThinking: false,
      articleBody: "<p>Hello <strong>world</strong></p>",
      socialPlatform: "youtube",
      attachmentCount: 2,
    });

    expect(payload.articleHtml).toContain("<h1>Launch plan</h1>");
    expect(payload.articleHtml).toContain("Launch Agency");
    expect(payload.caption).toContain("#YouTube");
    expect(payload.caption).toContain("2 media assets");
  });

  it("publishes a blog draft and persists stable media references", async () => {
    const draft = {
      id: "draft-1",
      tenantId: "tenant-1",
      userId: 42,
      topic: "Roadmap",
      executionSource: "skill",
      skillId: "skill-1",
      agencyId: null,
      articleBody: "<p>Alpha <strong>beta</strong></p>",
      requiresWebSearch: true,
      requiresThinking: false,
      attachmentIds: [11, 12],
      destinationKind: "blog",
      docsSubKind: null,
      docsTargetId: null,
      blogTargetId: null,
      socialPlatform: null,
      socialTargetId: null,
      socialCaption: null,
      status: "draft",
      errorMessage: null,
      publishedAt: null,
      createdAt: new Date("2026-03-24T12:00:00.000Z"),
      updatedAt: new Date("2026-03-24T12:00:00.000Z"),
    };

    const db = {
      select: vi.fn()
        .mockImplementationOnce(() => createChain([draft]))
        .mockImplementationOnce(() => createChain([
          {
            id: 11,
            itemType: "image",
            title: "Hero",
            sourceUrl: "https://cdn.example.com/hero.png",
            thumbnailUrl: null,
          },
          {
            id: 12,
            itemType: "video",
            title: "Teaser",
            sourceUrl: "https://cdn.example.com/teaser.mp4",
            thumbnailUrl: null,
          },
        ]))
        .mockImplementationOnce(() => createChain([])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{
            id: 99,
            tenantId: "tenant-1",
            slug: "roadmap",
            title: "Roadmap",
            excerpt: "Alpha beta",
            content: "<article>...</article>",
            coverImage: "https://cdn.example.com/hero.png",
            mediaAttachments: [11, 12],
            author: "Composer",
            isPublished: true,
            publishedAt: new Date("2026-03-24T12:01:00.000Z"),
            updatedAt: new Date("2026-03-24T12:01:00.000Z"),
          }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    };
    mocks.mockGetDb.mockResolvedValue(db as any);

    const result = await publishContentComposerDraft({
      draftId: "draft-1",
      tenantId: "tenant-1",
      userId: 42,
      userRole: "admin",
      userName: "Composer",
    });

    expect(result.destinationKind).toBe("blog");
    expect(result.targetPath).toBe("/blog/roadmap");
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("publishes upload-post content via the upload-post gateway", async () => {
    const draft = {
      id: "draft-2",
      tenantId: "tenant-1",
      userId: 42,
      topic: "Short update",
      executionSource: "skill",
      skillId: "skill-1",
      agencyId: null,
      articleBody: "<p>Alpha</p>",
      requiresWebSearch: false,
      requiresThinking: false,
      attachmentIds: [21],
      destinationKind: "social",
      docsSubKind: null,
      docsTargetId: null,
      blogTargetId: null,
      socialPlatform: "upload_post",
      socialTargetId: 77,
      socialCaption: "Caption",
      status: "draft",
      errorMessage: null,
      publishedAt: null,
      createdAt: new Date("2026-03-24T12:00:00.000Z"),
      updatedAt: new Date("2026-03-24T12:00:00.000Z"),
    };

    const db = {
      select: vi.fn()
        .mockImplementationOnce(() => createChain([draft]))
        .mockImplementationOnce(() => createChain([
          {
            id: 21,
            itemType: "image",
            title: "Promo",
            sourceUrl: "https://cdn.example.com/promo.png",
            thumbnailUrl: null,
          },
        ])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockResolvedValue(db as any);
    mocks.mockPublishUploadPostNow.mockResolvedValue({ id: 123, status: "queued" });

    const result = await publishContentComposerDraft({
      draftId: "draft-2",
      tenantId: "tenant-1",
      userId: 42,
      userRole: "user",
    });

    expect(result.destinationKind).toBe("social");
    expect(mocks.mockPublishUploadPostNow).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: 42,
      profileId: 77,
      contentText: expect.any(String),
      mediaRefs: ["https://cdn.example.com/promo.png"],
    }));
    expect(db.update).toHaveBeenCalled();
  });

  it("rejects publishing when no attachments are selected", async () => {
    const draft = {
      id: "draft-3",
      tenantId: "tenant-1",
      userId: 42,
      topic: "Roadmap",
      executionSource: "skill",
      skillId: "skill-1",
      agencyId: null,
      articleBody: "<p>Alpha</p>",
      requiresWebSearch: false,
      requiresThinking: false,
      attachmentIds: [],
      destinationKind: "blog",
      docsSubKind: null,
      docsTargetId: null,
      blogTargetId: null,
      socialPlatform: null,
      socialTargetId: null,
      socialCaption: null,
      status: "draft",
      errorMessage: null,
      publishedAt: null,
      createdAt: new Date("2026-03-24T12:00:00.000Z"),
      updatedAt: new Date("2026-03-24T12:00:00.000Z"),
    };

    const db = {
      select: vi.fn(() => createChain([draft])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockResolvedValue(db as any);

    await expect(publishContentComposerDraft({
      draftId: "draft-3",
      tenantId: "tenant-1",
      userId: 42,
      userRole: "admin",
    })).rejects.toThrow("Select at least one library attachment before publishing");
  });
});
