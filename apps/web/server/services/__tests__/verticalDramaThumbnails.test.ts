import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ db: mocks.db }));

import { resolveSeriesThumbnailUrls } from "../verticalDramaThumbnails";

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
  it("prefers the owned storage key over a stale persisted provider URL", async () => {
    mocks.db.select
      .mockReturnValueOnce(
        resolvedChain(
          [{ seriesId: 21, episodeNumber: 1, approvedMediaAssetId: "42" }],
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
          [{ seriesId: 21, episodeNumber: 1, approvedMediaAssetId: "42" }],
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
