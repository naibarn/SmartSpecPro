import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ db: mocks.db }));

import {
  resolveEpisodeThumbnailUrls,
  resolveSeriesThumbnailUrls,
} from "../verticalDramaThumbnails";

function resolvedChain<T>(rows: T[], terminal: "where" | "orderBy") {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  if (terminal === "where") {
    chain.where.mockResolvedValue(rows);
  }
  return chain;
}

describe("Vertical Drama derived thumbnails", () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
  });

  it("prefers episode 1's ready cover over its start frame", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              seriesId: 21,
              episodeNumber: 1,
              approvedMediaAssetId: "42",
              coverImage: {
                version: 2,
                activeSlotId: 1,
                variants: [
                  {
                    slotId: 1,
                    state: { status: "ready", mediaAssetId: "99" },
                  },
                ],
              },
            },
          ],
          "orderBy"
        )
      )
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 42,
              storageKey: "vertical-drama/21/image/start-frame/shot-1.png",
              thumbnailUrl: null,
              originalUrl: "https://provider.example/start-frame.png",
            },
            {
              id: 99,
              storageKey: "vertical-drama/21/image/cover/slot-1.png",
              thumbnailUrl: null,
              originalUrl: "https://provider.example/cover.png",
            },
          ],
          "where"
        )
      );

    await expect(
      resolveSeriesThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        seriesIds: [21],
      })
    ).resolves.toEqual(
      new Map([
        [21, "/api/storage/files/vertical-drama/21/image/cover/slot-1.png"],
      ])
    );
  });

  it("falls back to episode 1's start frame when its cover asset is unavailable", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              seriesId: 21,
              episodeNumber: 1,
              approvedMediaAssetId: "42",
              coverImage: {
                version: 2,
                activeSlotId: 1,
                variants: [
                  {
                    slotId: 1,
                    state: { status: "ready", mediaAssetId: "99" },
                  },
                ],
              },
            },
          ],
          "orderBy"
        )
      )
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 42,
              storageKey: "vertical-drama/21/image/start-frame/shot-1.png",
              thumbnailUrl: null,
              originalUrl: "https://provider.example/start-frame.png",
            },
          ],
          "where"
        )
      );

    await expect(
      resolveSeriesThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        seriesIds: [21],
      })
    ).resolves.toEqual(
      new Map([
        [
          21,
          "/api/storage/files/vertical-drama/21/image/start-frame/shot-1.png",
        ],
      ])
    );
  });

  it("does not use a later episode when episode 1 has no thumbnail", async () => {
    mocks.db.select.mockReturnValueOnce(
      resolvedChain(
        [
          {
            seriesId: 21,
            episodeNumber: 1,
            approvedMediaAssetId: null,
            coverImage: null,
          },
          {
            seriesId: 21,
            episodeNumber: 2,
            approvedMediaAssetId: "42",
            coverImage: null,
          },
        ],
        "orderBy"
      )
    );

    await expect(
      resolveSeriesThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        seriesIds: [21],
      })
    ).resolves.toEqual(new Map());
  });

  it("uses an episode cover before its start frame in the detail fallback", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 141,
              approvedMediaAssetId: "42",
              coverImage: {
                version: 2,
                activeSlotId: 1,
                variants: [
                  {
                    slotId: 1,
                    state: { status: "ready", mediaAssetId: "99" },
                  },
                ],
              },
            },
          ],
          "where"
        )
      )
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 42,
              storageKey: null,
              thumbnailUrl: "https://cdn.example.com/start-frame.png",
              originalUrl: null,
            },
            {
              id: 99,
              storageKey: null,
              thumbnailUrl: "https://cdn.example.com/cover.png",
              originalUrl: null,
            },
          ],
          "where"
        )
      );

    await expect(
      resolveEpisodeThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        episodeIds: [141],
      })
    ).resolves.toEqual(new Map([[141, "https://cdn.example.com/cover.png"]]));
  });

  it("prefers the owned storage key over a stale persisted provider URL", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              seriesId: 21,
              episodeNumber: 1,
              approvedMediaAssetId: "42",
              coverImage: null,
            },
          ],
          "orderBy"
        )
      )
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 42,
              storageKey: "vertical-drama/21/image/start-frame/shot-1.png",
              thumbnailUrl: "https://provider.example/expired.png",
              originalUrl: "https://provider.example/expired.png",
            },
          ],
          "where"
        )
      );

    await expect(
      resolveSeriesThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        seriesIds: [21],
      })
    ).resolves.toEqual(
      new Map([
        [
          21,
          "/api/storage/files/vertical-drama/21/image/start-frame/shot-1.png",
        ],
      ])
    );
  });

  it("keeps a legacy external URL when no managed storage key exists", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              seriesId: 21,
              episodeNumber: 1,
              approvedMediaAssetId: "42",
              coverImage: null,
            },
          ],
          "orderBy"
        )
      )
      .mockReturnValueOnce(
        resolvedChain(
          [
            {
              id: 42,
              storageKey: null,
              thumbnailUrl: null,
              originalUrl: "https://cdn.example.com/legacy.png",
            },
          ],
          "where"
        )
      );

    await expect(
      resolveSeriesThumbnailUrls(mocks.db as never, {
        tenantId: "tenant-1",
        userId: 7,
        seriesIds: [21],
      })
    ).resolves.toEqual(new Map([[21, "https://cdn.example.com/legacy.png"]]));
  });
});
