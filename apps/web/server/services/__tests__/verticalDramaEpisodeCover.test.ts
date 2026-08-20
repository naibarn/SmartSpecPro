import { describe, expect, it } from "vitest";
import {
  buildEpisodeCoverGenerationSnapshot,
  projectEpisodeCover,
  resolveEpisodeCoverAssetUrls,
  resolveEpisodeCoverLogoReferences,
} from "../verticalDramaEpisodeCover";

describe("vertical drama episode cover service helpers", () => {
  it("builds current prompt context and uses only approved resolvable frames", () => {
    const snapshot = buildEpisodeCoverGenerationSnapshot({
      narrative: {
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 14,
        episodeTitle: "ความจริง",
        synopsis: "ทำแผลและค้นพบความจริง",
        plotBeats: ["พี่ชายปกป้องน้องสาว"],
      },
      startFramePlan: {
        frames: [
          {
            shotNumber: 1,
            approvedMediaAssetId: "11",
            canonicalShotSummary: "ห้องทำแผล",
          },
          {
            shotNumber: 2,
            approvedMediaAssetId: "12",
            canonicalShotSummary: "ทางเดิน",
          },
          { shotNumber: 3, imagePrompt: "unapproved frame" },
        ],
      },
      referenceUrls: new Map([["11", "https://cdn/11.jpg"]]),
    });

    expect(snapshot.prompt).toContain("**ตอนย่อยที่ 14  · ความจริง**");
    expect(snapshot.references).toEqual([
      { shotNumber: 1, mediaAssetId: "11", url: "https://cdn/11.jpg" },
    ]);
  });

  it("carries the selected cover slot into the generic composition direction", () => {
    const snapshot = buildEpisodeCoverGenerationSnapshot({
      narrative: {
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 2,
        episodeTitle: "เหตุการณ์สำคัญ",
        synopsis: "ตัวละครพบเหตุการณ์สำคัญ",
        plotBeats: [],
      },
      startFramePlan: {
        frames: [{ shotNumber: 1, approvedMediaAssetId: "11" }],
      },
      referenceUrls: new Map([["11", "https://cdn/11.jpg"]]),
      coverSlotId: 3,
    });

    expect(snapshot.prompt).toContain("แนวทางองค์ประกอบหน้าปกแบบที่ 3");
    expect(snapshot.prompt).toContain("สร้างภาพ action framing ระยะกลาง");
    expect(snapshot.prompt).not.toContain("คาเฟ่");
  });

  it("rotates scene references when building different cover slots", () => {
    const startFramePlan = {
      frames: Array.from({ length: 5 }, (_, index) => ({
        shotNumber: index + 1,
        approvedMediaAssetId: String(index + 11),
      })),
    };
    const referenceUrls = new Map<string, string>(
      Array.from(
        { length: 5 }, (_, index) => [
          String(index + 11),
          `https://cdn/${index + 11}.jpg`,
        ],
      ),
    );
    const baseInput = {
      narrative: {
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 2,
        episodeTitle: "เหตุการณ์สำคัญ",
        synopsis: "",
        plotBeats: [],
      },
      startFramePlan,
      referenceUrls,
    };
    const slotTwo = buildEpisodeCoverGenerationSnapshot({
      ...baseInput,
      coverSlotId: 2,
      referenceImageCount: 2,
    });
    const slotThree = buildEpisodeCoverGenerationSnapshot({
      ...baseInput,
      coverSlotId: 3,
      referenceImageCount: 3,
    });

    expect(slotTwo.references.map(reference => reference.shotNumber)).not.toEqual(
      slotThree.references.map(reference => reference.shotNumber),
    );
  });

  it("assigns disjoint scene-reference bands across four cover slots", () => {
    const startFramePlan = {
      frames: Array.from({ length: 9 }, (_, index) => ({
        shotNumber: index + 1,
        approvedMediaAssetId: String(index + 11),
      })),
    };
    const referenceUrls = new Map<string, string>(
      Array.from(
        { length: 9 },
        (_, index) => [String(index + 11), `https://cdn/${index + 11}.jpg`],
      ),
    );

    const snapshots = ([1, 2, 3, 4] as const).map((coverSlotId, index) =>
      buildEpisodeCoverGenerationSnapshot({
        narrative: {
          seriesTitle: "เรื่องหลัก",
          episodeNumber: 2,
          episodeTitle: "เหตุการณ์สำคัญ",
          synopsis: "",
          plotBeats: [],
        },
        startFramePlan,
        referenceUrls,
        coverSlotId,
        referenceImageCount: [1, 2, 3, 3][index],
      }),
    );

    expect(
      snapshots.map(snapshot =>
        snapshot.references.map(reference => reference.shotNumber),
      ),
    ).toEqual([[1], [2, 3], [4, 5, 6], [7, 8, 9]]);
  });

  it("projects only safe fields for the episode list", () => {
    expect(
      projectEpisodeCover(
        {
          status: "ready",
          mediaAssetId: "15",
          prompt: "secret prompt",
          idempotencyKey: "secret",
          modelId: "image-model",
          sourceShotNumbers: [1, 4],
        },
        "https://cdn/cover.jpg"
      )
    ).toEqual({
      status: "ready",
      url: "https://cdn/cover.jpg",
      modelId: "image-model",
      sourceShotNumbers: [1, 4],
      error: null,
      pendingTaskId: null,
    });
  });

  it("resolves the persisted cover asset used by the episode detail panel", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 15,
              mimeType: "image/png",
              thumbnailUrl: "/api/storage/files/cover-thumb.png",
              originalUrl: "/api/storage/files/cover.png",
            },
          ],
        }),
      }),
    } as any;

    await expect(
      resolveEpisodeCoverAssetUrls(
        fakeDb,
        { tenantId: "tenant-1", userId: 7 },
        [{ status: "ready", mediaAssetId: "15" }]
      )
    ).resolves.toEqual(new Map([["15", "/api/storage/files/cover-thumb.png"]]));
  });

  it("resolves only the requested configured image logos", () => {
    const watermark = {
      enabled: true,
      type: "image",
      imageUrl: "/api/storage/title.png",
      position: "top_right",
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
      secondary: {
        enabled: true,
        type: "image",
        imageUrl: "/api/storage/channel.png",
        position: "bottom_right",
        opacity: 0.45,
        scalePct: 10,
        marginPx: 32,
      },
    };

    expect(
      resolveEpisodeCoverLogoReferences(watermark, {
        includeTitleLogo: true,
        includeChannelLogo: false,
      })
    ).toEqual([{ kind: "title_logo", url: "/api/storage/title.png" }]);
  });

  it("reserves reference capacity for selected logos", () => {
    const snapshot = buildEpisodeCoverGenerationSnapshot({
      narrative: {
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 1,
        episodeTitle: "ตอนแรก",
        synopsis: null,
        plotBeats: [],
      },
      startFramePlan: {
        frames: [
          { shotNumber: 1, approvedMediaAssetId: "11" },
          { shotNumber: 2, approvedMediaAssetId: "12" },
          { shotNumber: 3, approvedMediaAssetId: "13" },
        ],
      },
      referenceUrls: new Map([
        ["11", "https://cdn/11.jpg"],
        ["12", "https://cdn/12.jpg"],
        ["13", "https://cdn/13.jpg"],
      ]),
      logoReferences: [
        { kind: "title_logo", url: "https://cdn/title.png" },
        { kind: "channel_logo", url: "https://cdn/channel.png" },
      ],
      maxReferenceImages: 4,
    });

    expect(snapshot.references).toHaveLength(2);
    expect(snapshot.logoReferences).toHaveLength(2);
  });

  it("adds explicit directions for using every attached logo reference", () => {
    const snapshot = buildEpisodeCoverGenerationSnapshot({
      narrative: {
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 1,
        episodeTitle: "ตอนแรก",
        synopsis: null,
        plotBeats: [],
      },
      startFramePlan: {
        frames: [{ shotNumber: 1, approvedMediaAssetId: "11" }],
      },
      referenceUrls: new Map([["11", "https://cdn/11.jpg"]]),
      logoReferences: [
        { kind: "title_logo", url: "https://cdn/title.png" },
        { kind: "channel_logo", url: "https://cdn/channel.png" },
      ],
      maxReferenceImages: 4,
    });

    expect(snapshot.prompt).toContain("ภาพอ้างอิงที่ 2 คือโลโก้ชื่อเรื่อง");
    expect(snapshot.prompt).toContain("ภาพอ้างอิงที่ 3 คือโลโก้ช่อง");
    expect(snapshot.prompt).toContain("ห้ามละเลยโลโก้ใดโลโก้หนึ่ง");
  });
});
