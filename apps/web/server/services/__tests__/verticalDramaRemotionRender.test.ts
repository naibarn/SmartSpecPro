import { describe, expect, it, vi } from "vitest";

// `submitVdRemotionAssembly` no longer dispatches Lane A in-process
// (`planning/worker-app-remotion-render-video/plan.md` §P3 — Lane A must
// never render inside `smartspec-web`'s cgroup), so this module has no
// `videoIntelligenceJobs`/`@remotion/bundler` dependency chain to mock
// around anymore.

// Minimal chainable `db` mock supporting the exact two shapes
// `persistCompiledVideoState`/`reconcileVdRemotionAssembly` use:
//   db.select({...}).from(table).where(...).limit(1)      -> Promise<rows>
//   db.update(table).set({...}).where(...)                -> Promise<void>
import {
  workerArtifacts,
  workerJobs,
  verticalDramaEpisodes,
} from "../../../drizzle/schema";

let episodeRow: { assemblyManifest: Record<string, unknown> | null } = {
  assemblyManifest: {},
};
let workerJobRow: Record<string, unknown> | undefined;
/** `worker_artifacts` rows the mp4 last-resort lookup reads. */
let workerArtifactRows: Array<{ storageRef: string }> = [];

function tableOfFrom(
  fromArg: unknown
): "episode" | "workerJob" | "workerArtifact" | "unknown" {
  if (fromArg === verticalDramaEpisodes) return "episode";
  if (fromArg === workerJobs) return "workerJob";
  if (fromArg === workerArtifacts) return "workerArtifact";
  return "unknown";
}

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: (fromArg: unknown) => ({
        where: () => ({
          limit: async () => {
            const table = tableOfFrom(fromArg);
            if (table === "workerJob")
              return workerJobRow ? [workerJobRow] : [];
            if (table === "workerArtifact") return workerArtifactRows;
            return [episodeRow];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if (tableOfFrom(table) === "episode" && "assemblyManifest" in patch) {
            episodeRow = {
              assemblyManifest: patch.assemblyManifest as Record<
                string,
                unknown
              >,
            };
          }
        },
      }),
    }),
  },
}));

// A storage KEY (not an http URL) is resolved through `storageGet` before it
// is persisted as the player's `videoUrl` — Lane B always reports a key.
vi.mock("../../storage", () => ({
  storageGet: async () => ({ url: "https://cdn.example.com/resolved.mp4" }),
}));

import { createHash } from "crypto";

import {
  buildVdCaptionLines,
  buildVdRemotionTemplate,
  mapVdSubtitlePresetToRemotion,
  reconcileVdRemotionAssembly,
  submitVdEpisodePreview,
  submitVdProductionEpisodeAssembly,
  resolveVdTextOverlayWindow,
  retimeSubtitleLinesToProbedClips,
  submitVdRemotionAssembly,
  VdRemotionRenderError,
  VD_REMOTION_QUEUED_TTL_MS,
} from "../verticalDramaRemotionRender";
import type {
  RunAssemblyJobSubtitlesInput,
  RunAssemblyJobTextOverlayEventInput,
} from "../verticalDramaEpisodeVideoAssembly";

const owner = { tenantId: "tenant-1", userId: 1, seriesId: 10, episodeId: 20 };

/* -------------------------------------------------------------------------- */
/* buildVdCaptionLines / mapVdSubtitlePresetToRemotion                        */
/* -------------------------------------------------------------------------- */

describe("buildVdCaptionLines", () => {
  it("converts absolute-timeline subtitle lines verbatim, without any speaker-name prefix", () => {
    const subtitles: RunAssemblyJobSubtitlesInput = {
      preset: "classic_box",
      lines: [
        { startSec: 0, endSec: 2, speakerName: "Mai", text: "สวัสดีค่ะ" },
        { startSec: 2, endSec: 4, text: "narration line" },
      ],
    };
    const lines = buildVdCaptionLines(subtitles);
    expect(lines).toEqual([
      { startSec: 0, endSec: 2, text: "สวัสดีค่ะ" },
      { startSec: 2, endSec: 4, text: "narration line" },
    ]);
  });

  it("renders ONLY the spoken text when a line has a speakerName — no 'Name: ' prefix (regression: speaker name was previously burned into the caption)", () => {
    const subtitles: RunAssemblyJobSubtitlesInput = {
      preset: "classic_box",
      lines: [
        { startSec: 0, endSec: 2, speakerName: "ภูมิ", text: "อย่าแตะของเธอ" },
      ],
    };
    const lines = buildVdCaptionLines(subtitles);
    expect(lines).toEqual([{ startSec: 0, endSec: 2, text: "อย่าแตะของเธอ" }]);
    expect(lines[0].text).not.toContain("ภูมิ");
    expect(lines[0].text).not.toContain(":");
  });

  it("returns an empty array when subtitles are absent or have no lines", () => {
    expect(buildVdCaptionLines(undefined)).toEqual([]);
    expect(
      buildVdCaptionLines({ preset: "no_subtitle_style", lines: [] })
    ).toEqual([]);
  });
});

describe("mapVdSubtitlePresetToRemotion", () => {
  it("is an identity map for every real preset id", () => {
    expect(mapVdSubtitlePresetToRemotion("classic_box")).toBe("classic_box");
    expect(mapVdSubtitlePresetToRemotion("karaoke_word")).toBe("karaoke_word");
  });

  it("maps the two 'no captions' sentinels to undefined", () => {
    expect(mapVdSubtitlePresetToRemotion("none")).toBeUndefined();
    expect(mapVdSubtitlePresetToRemotion("no_subtitle_style")).toBeUndefined();
    expect(mapVdSubtitlePresetToRemotion(undefined)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* resolveVdTextOverlayWindow                                                 */
/* -------------------------------------------------------------------------- */

describe("resolveVdTextOverlayWindow", () => {
  const base: RunAssemblyJobTextOverlayEventInput = {
    kind: "episode_indicator",
    text: "EP 3",
    startSec: 0,
    endSec: 0,
  };

  it("resolves entireClip to [0, videoDurationSeconds]", () => {
    expect(
      resolveVdTextOverlayWindow({ ...base, entireClip: true }, 60)
    ).toEqual({
      startSec: 0,
      endSec: 60,
    });
  });

  it("resolves endAnchored to a fixed-length window ending at videoDurationSeconds", () => {
    expect(
      resolveVdTextOverlayWindow(
        {
          ...base,
          kind: "end_card",
          endAnchored: true,
          durationSecForEndAnchor: 4,
        },
        60
      )
    ).toEqual({ startSec: 56, endSec: 60 });
  });

  it("passes through an already-concrete window unchanged", () => {
    expect(
      resolveVdTextOverlayWindow({ ...base, startSec: 10, endSec: 13 }, 60)
    ).toEqual({
      startSec: 10,
      endSec: 13,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* buildVdRemotionTemplate                                                    */
/* -------------------------------------------------------------------------- */

describe("buildVdRemotionTemplate", () => {
  it("computes cumulative startFrame/durationInFrames from real clip durations", () => {
    const { template, durationInFrames } = buildVdRemotionTemplate({
      clips: [
        { clipNumber: 1, url: "https://cdn.example.com/1.mp4", durationSec: 8 },
        { clipNumber: 2, url: "https://cdn.example.com/2.mp4", durationSec: 4 },
      ],
      videoDurationSeconds: 12,
    });
    const videoLayers = template.layers.filter(l => l.type === "video");
    expect(videoLayers).toHaveLength(2);
    expect(videoLayers[0].startFrame).toBe(0);
    expect(videoLayers[0].durationFrames).toBe(240);
    expect(videoLayers[1].startFrame).toBe(240);
    expect(durationInFrames).toBe(360);
  });

  it("adds the Production Episode identity overlay and Settings text watermark", () => {
    const { template } = buildVdRemotionTemplate({
      clips: [
        { clipNumber: 1, url: "https://cdn.example.com/1.mp4", durationSec: 8 },
      ],
      videoDurationSeconds: 8,
      productionOverlay: { episodeLabel: "EP.01", seriesTitle: "เรื่องทดสอบ" },
      watermarkTexts: [
        {
          slotId: "primary",
          text: "@channel",
          position: "bottom_right",
          opacity: 0.8,
          scalePct: 12,
          marginPx: 24,
        },
      ],
    });
    expect(
      template.layers.find(layer => layer.id === "production-episode-label")
    ).toMatchObject({
      type: "text",
      content: "EP.01 · เรื่องทดสอบ",
    });
    expect(
      template.layers.find(
        layer => layer.id === "series-watermark-text-primary"
      )
    ).toMatchObject({
      type: "text",
      content: "@channel",
    });
  });

  it("renders Production Episode BGM windows, timed overlays, and a scrolling credits roll", () => {
    const { template } = buildVdRemotionTemplate({
      clips: [
        {
          clipNumber: 1,
          url: "https://cdn.example.com/1.mp4",
          durationSec: 20,
        },
      ],
      videoDurationSeconds: 20,
      productionBgm: [
        {
          id: "track-1",
          resolvedAudioUrl: "https://cdn.example.com/music.mp3",
          startSec: 2,
          durationSec: 6,
          volume: 0.35,
          loop: true,
        },
      ],
      productionOverlays: [
        { atSeconds: 5, durationSeconds: 4, text: "ประกาศ", style: "top_bar" },
      ],
      productionCredits: { text: "นักแสดง\nทีมงาน" },
    });

    expect(template.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-bgm-track-1",
          type: "audio",
          startFrame: 60,
          durationFrames: 180,
          loop: true,
          volume: 0.35,
        }),
        expect.objectContaining({
          id: "production-overlay-0",
          type: "text",
          startFrame: 150,
          durationFrames: 120,
          content: "ประกาศ",
        }),
        expect.objectContaining({
          id: "production-credits-roll",
          type: "text",
          animation: "scrollUp",
          startFrame: 240,
          durationFrames: 360,
        }),
      ])
    );
  });

  it("maps every VdTextOverlayAssKind to a text layer within its resolved window", () => {
    const overlays: RunAssemblyJobTextOverlayEventInput[] = [
      {
        kind: "end_card",
        text: "END",
        endAnchored: true,
        durationSecForEndAnchor: 3,
        startSec: 0,
        endSec: 0,
      },
      { kind: "opener_recap", text: "Previously...", startSec: 0, endSec: 3 },
      {
        kind: "title_bumper",
        text: "EP 3: The Return",
        secondaryText: "ตอนที่ 3",
        startSec: 0,
        endSec: 2,
      },
      {
        kind: "episode_indicator",
        text: "EP 3",
        entireClip: true,
        startSec: 0,
        endSec: 0,
        variant: "top_left",
      },
      {
        kind: "character_intro",
        text: "Mai",
        secondaryText: "The Lead",
        startSec: 5,
        endSec: 8,
      },
      { kind: "time_setting", text: "3 days later", startSec: 20, endSec: 23 },
      {
        kind: "narrative_hook",
        text: "But little did she know...",
        startSec: 30,
        endSec: 33,
      },
      {
        kind: "watermark_text",
        text: "@brand",
        entireClip: true,
        startSec: 0,
        endSec: 0,
        variant: "bottom_right",
      },
      {
        kind: "age_badge",
        text: "18+",
        entireClip: true,
        startSec: 0,
        endSec: 0,
      },
    ];
    const { template } = buildVdRemotionTemplate({
      clips: [
        {
          clipNumber: 1,
          url: "https://cdn.example.com/1.mp4",
          durationSec: 60,
        },
      ],
      videoDurationSeconds: 60,
      overlays,
    });
    const textLayers = template.layers.filter(l => l.type === "text");
    // One primary layer per overlay + a secondary layer for the 2 overlays
    // that carry `secondaryText` (title_bumper, character_intro).
    expect(textLayers.length).toBe(overlays.length + 2);
    for (const overlay of overlays) {
      const layer = textLayers.find(
        l => l.id === `overlay-${overlay.kind}-${overlays.indexOf(overlay)}`
      );
      expect(layer).toBeTruthy();
      expect(layer && "content" in layer && layer.content).toBe(overlay.text);
    }
    const endCardLayer = textLayers.find(l =>
      l.id.startsWith("overlay-end_card-")
    );
    expect(endCardLayer?.startFrame).toBe(Math.round(57 * 30));
  });

  it("positions an ad banner via the shared placement preset box, resolving 'entire' to the real duration", () => {
    const { template } = buildVdRemotionTemplate({
      clips: [
        {
          clipNumber: 1,
          url: "https://cdn.example.com/1.mp4",
          durationSec: 60,
        },
      ],
      videoDurationSeconds: 60,
      banners: [
        {
          imageUrl: "https://cdn.example.com/banner.png",
          resolvedImageUrl: "https://cdn.example.com/banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 60,
          fadeSec: 0.3,
          entire: true,
        },
      ],
    });
    const bannerLayer = template.layers.find(l => l.id === "banner-0");
    expect(bannerLayer?.type).toBe("image");
    expect(bannerLayer?.durationFrames).toBe(60 * 30);
  });

  // Regression: the image-watermark branch referenced the per-clip
  // `durationFrames` loop variable outside the clip loop (`ReferenceError`),
  // so ANY render of a series with an image watermark configured crashed the
  // Remotion path and silently fell back to the ffmpeg queue — which has no
  // consumer. Fixed 2026-07-30; this pins the whole-timeline layer.
  it("composites the series IMAGE watermark as a full-timeline corner layer", () => {
    const { template, durationInFrames } = buildVdRemotionTemplate({
      clips: [
        { clipNumber: 1, url: "https://cdn.example.com/1.mp4", durationSec: 8 },
        { clipNumber: 2, url: "https://cdn.example.com/2.mp4", durationSec: 4 },
      ],
      videoDurationSeconds: 12,
      watermarkImages: [
        {
          slotId: "primary",
          imageUrl: "https://cdn.example.com/logo.png",
          resolvedImageUrl: "https://cdn.example.com/logo.png",
          position: "top_right",
          opacity: 0.45,
          scalePct: 10,
          marginPx: 32,
        },
      ],
    });
    const layer = template.layers.find(
      l => l.id === "series-watermark-primary"
    );
    expect(layer?.type).toBe("image");
    // Spans the ENTIRE timeline, not just the first clip.
    expect(layer?.startFrame).toBe(0);
    expect(layer?.durationFrames).toBe(durationInFrames);
    expect(layer?.durationFrames).toBe(360);
    expect(layer?.opacity).toBe(0.45);
    // top_right → x = 100 - marginPct - sizePct, y = marginPct.
    expect(layer && "width" in layer && layer.width).toBe(10);
    expect(layer?.y).toBeCloseTo((32 / 1080) * 100, 5);
    expect(layer?.x).toBeCloseTo(100 - (32 / 1080) * 100 - 10, 5);
    // A square logo must not stretch on the 9:16 canvas.
    expect(layer && "height" in layer && layer.height).toBeCloseTo(
      10 * (1080 / 1920),
      5
    );
  });

  it("dual watermark: composites TWO independent full-timeline layers with distinct ids and anchors", () => {
    const { template, durationInFrames } = buildVdRemotionTemplate({
      clips: [
        { clipNumber: 1, url: "https://cdn.example.com/1.mp4", durationSec: 8 },
        { clipNumber: 2, url: "https://cdn.example.com/2.mp4", durationSec: 4 },
      ],
      videoDurationSeconds: 12,
      watermarkImages: [
        {
          slotId: "primary",
          imageUrl: "https://cdn.example.com/series-logo.png",
          resolvedImageUrl: "https://cdn.example.com/series-logo.png",
          position: "top_right",
          opacity: 0.45,
          scalePct: 10,
          marginPx: 32,
        },
        {
          slotId: "secondary",
          imageUrl: "https://cdn.example.com/channel-logo.png",
          resolvedImageUrl: "https://cdn.example.com/channel-logo.png",
          position: "bottom_left",
          opacity: 0.6,
          scalePct: 8,
          marginPx: 16,
        },
      ],
    });
    const primaryLayer = template.layers.find(
      l => l.id === "series-watermark-primary"
    );
    const secondaryLayer = template.layers.find(
      l => l.id === "series-watermark-secondary"
    );
    expect(primaryLayer).toBeDefined();
    expect(secondaryLayer).toBeDefined();
    // Distinct ids — no collision/overwrite.
    expect(primaryLayer!.id).not.toBe(secondaryLayer!.id);
    // Both span the FULL timeline, independently of each other.
    expect(primaryLayer?.startFrame).toBe(0);
    expect(primaryLayer?.durationFrames).toBe(durationInFrames);
    expect(secondaryLayer?.startFrame).toBe(0);
    expect(secondaryLayer?.durationFrames).toBe(durationInFrames);
    // Independent anchors — primary top_right, secondary bottom_left.
    expect(primaryLayer?.y).toBeCloseTo((32 / 1080) * 100, 5);
    expect(primaryLayer?.x).toBeCloseTo(100 - (32 / 1080) * 100 - 10, 5);
    expect(secondaryLayer?.x).toBeCloseTo((16 / 1080) * 100, 5);
    expect(secondaryLayer?.y).toBeCloseTo(
      100 - (16 / 1080) * 100 - 8 * (1080 / 1920),
      5
    );
  });

  it("throws a typed error when the layer budget (40) is exceeded", () => {
    const manyOverlays: RunAssemblyJobTextOverlayEventInput[] = Array.from(
      { length: 40 },
      (_, i) => ({
        kind: "narrative_hook" as const,
        text: `hook ${i}`,
        startSec: i,
        endSec: i + 1,
      })
    );
    expect(() =>
      buildVdRemotionTemplate({
        clips: [
          {
            clipNumber: 1,
            url: "https://cdn.example.com/1.mp4",
            durationSec: 60,
          },
        ],
        videoDurationSeconds: 60,
        overlays: manyOverlays,
      })
    ).toThrow(VdRemotionRenderError);
  });

  it("keeps a compact episode label visible without a large blocking card", () => {
    const { template, durationInFrames, layerCount } = buildVdRemotionTemplate({
      clips: [
        { clipNumber: 2, url: "https://cdn.example.com/2.mp4", durationSec: 4 },
        { clipNumber: 7, url: "https://cdn.example.com/7.mp4", durationSec: 5 },
      ],
      videoDurationSeconds: 9,
      previewCard: {
        label: "ตัวอย่าง Sub-EP 21 - คืนก่อนวันตัดสินใจ",
        coverImageUrl: "https://cdn.example.com/cover.jpg",
      },
    });

    expect(layerCount).toBe(5);
    expect(durationInFrames).toBe(345);
    expect(
      template.layers.filter(layer => layer.type === "video")
    ).toHaveLength(2);
    expect(
      template.layers.find(layer => layer.id === "preview-title")
    ).toMatchObject({
      type: "text",
      content: "ตัวอย่าง Sub-EP 21 - คืนก่อนวันตัดสินใจ",
      fontSizePx: 32,
      startFrame: 0,
      durationFrames: 345,
      zIndex: 32,
      x: 6,
      y: 2,
      width: 88,
      height: 7,
      textAlign: "left",
    });
    expect(
      template.layers.find(layer => layer.id === "preview-title-band")
    ).toMatchObject({
      durationFrames: 345,
      zIndex: 31,
      x: 4,
      y: 2,
      width: 92,
      height: 7,
      opacity: 0.52,
    });
    expect(
      template.layers.find(layer => layer.id === "preview-end-card")
    ).toMatchObject({
      type: "image",
      startFrame: 270,
      durationFrames: 75,
      src: "https://cdn.example.com/cover.jpg",
    });
  });
});

describe("submitVdEpisodePreview", () => {
  it("queues the selected clips and cover through the Remotion render-jobs contract", async () => {
    const queueJob = vi.fn().mockResolvedValue({
      created: true,
      job: { id: "preview-job-1" },
    });
    const stageAsset = vi.fn(
      async (url: string, _base: string, wantDuration: boolean) =>
        wantDuration
          ? {
              durationSec: url.endsWith("2.mp4") ? 4 : 5,
              sha256: `hash-${url}`,
            }
          : { sha256: `hash-${url}` }
    );

    const result = await submitVdEpisodePreview(
      {
        owner,
        slotId: 2,
        clips: [
          { clipNumber: 2, videoUrl: "/api/storage/files/2.mp4" },
          { clipNumber: 7, videoUrl: "/api/storage/files/7.mp4" },
        ],
        coverImageUrl: "/api/storage/files/cover.jpg",
        episodeLabel: "ตัวอย่าง Sub-EP 21 - คืนก่อนวันตัดสินใจ",
        internalBaseUrl: "http://localhost:3000",
        publicBaseUrl: "https://smarthub.example.com",
        tenantId: owner.tenantId,
        requestedByUserId: owner.userId,
      },
      { queueJob, stageAsset }
    );

    expect(result).toMatchObject({
      jobId: "preview-job-1",
      created: true,
      videoDurationSeconds: 9,
    });
    expect(queueJob).toHaveBeenCalledTimes(1);
    const workerInput = queueJob.mock.calls[0][0];
    expect(workerInput.renderProfile.profile).toBe("preview");
    expect(workerInput.videoProjectId).toBe("vd-episode-preview:10:20");
    expect(workerInput.projectRevision).toBe(2);
    expect(workerInput.compositionId).toBe("GenericTemplate");
    expect(workerInput.assetManifest.sources).toHaveLength(3);
    expect(workerInput.remotionTemplate.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "preview-title" }),
        expect.objectContaining({ id: "preview-end-card", type: "image" }),
      ])
    );
  });

  it("threads preview subtitles into the worker caption burn-in contract", async () => {
    const queueJob = vi.fn().mockResolvedValue({
      created: true,
      job: { id: "preview-job-captions" },
    });
    const stageAsset = vi.fn(
      async (_url: string, _base: string, wantDuration: boolean) =>
        wantDuration
          ? { durationSec: 4, sha256: "video-hash" }
          : { sha256: "cover-hash" }
    );

    await submitVdEpisodePreview(
      {
        owner,
        slotId: 1,
        clips: [{ clipNumber: 2, videoUrl: "/api/storage/files/2.mp4" }],
        coverImageUrl: "/api/storage/files/cover.jpg",
        episodeLabel: "ตัวอย่าง",
        subtitles: {
          preset: "classic_box",
          lines: [{ startSec: 0, endSec: 2, text: "สวัสดี" }],
        },
        internalBaseUrl: "http://localhost:3000",
        publicBaseUrl: "https://smarthub.example.com",
        tenantId: owner.tenantId,
        requestedByUserId: owner.userId,
      },
      { queueJob, stageAsset }
    );

    const workerInput = queueJob.mock.calls[0][0];
    expect(workerInput.renderProfile.burnInAssCaptions).toBe(true);
    expect(workerInput.postPasses).toContain("ass_burn");
    expect(workerInput.captionPresetId).toBe("classic_box");
    expect(workerInput.captionLines).toEqual([
      { startSec: 0, endSec: 2, text: "สวัสดี" },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* submitVdRemotionAssembly (dependency-injected)                             */
/* -------------------------------------------------------------------------- */

describe("submitVdRemotionAssembly", () => {
  it("enqueues a job and persists a pending compiledVideo state stamped remotion_queue, never dispatching Lane A in-process", async () => {
    episodeRow = { assemblyManifest: {} };
    const queueJob = vi
      .fn()
      .mockResolvedValue({ created: true, job: { id: "job-1" } });
    const stageAsset = vi
      .fn()
      .mockResolvedValue({ durationSec: 8, sha256: "abc" });

    const result = await submitVdRemotionAssembly(
      {
        owner,
        clips: [{ clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" }],
        internalBaseUrl: "http://localhost:3000",
        filename: "ep-1.mp4",
        tenantId: owner.tenantId,
        requestedByUserId: owner.userId,
      },
      { queueJob, stageAsset }
    );

    expect(result.jobId).toBe("job-1");
    expect(queueJob).toHaveBeenCalledTimes(1);
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      pendingJobId: "job-1",
      status: "pending",
      renderEngine: "remotion_queue",
    });
    expect(
      typeof (episodeRow.assemblyManifest as any).compiledVideo
        .renderSubmittedAt
    ).toBe("number");
  });

  it("uses each staged asset's REAL bytes-sha256 in the asset manifest, not sha256(url)", async () => {
    episodeRow = { assemblyManifest: {} };
    const queueJob = vi
      .fn()
      .mockResolvedValue({ created: true, job: { id: "job-2" } });
    const hashOf = (label: string) =>
      createHash("sha256").update(label).digest("hex");
    const stageAsset = vi.fn(
      async (url: string, _base: string, wantDuration: boolean) => {
        const sha256 = hashOf(`bytes-of:${url}`);
        return wantDuration ? { durationSec: 8, sha256 } : { sha256 };
      }
    );

    await submitVdRemotionAssembly(
      {
        owner,
        clips: [{ clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" }],
        internalBaseUrl: "http://localhost:3000",
        filename: "ep-1.mp4",
        tenantId: owner.tenantId,
        requestedByUserId: owner.userId,
        banners: [
          {
            imageUrl: "https://cdn.example.com/banner.png",
            placementId: "bottom_band",
            startSec: 0,
            endSec: 8,
            fadeSec: 0.3,
            entire: true,
          },
        ],
        dialogueAudio: {
          segments: [
            {
              audioUrl: "https://cdn.example.com/line1.mp3",
              startSec: 0,
              endSec: 2,
            },
          ],
        },
        // NOTE: `watermarkImages` is omitted here only to keep this case's
        // asset-manifest assertion at exactly 3 sources — the watermark layer(s)
        // itself is covered by the `buildVdRemotionTemplate` suite above.
        // (The `ReferenceError` this note used to flag was fixed 2026-07-30.)
      } as any,
      { queueJob, stageAsset }
    );

    expect(queueJob).toHaveBeenCalledTimes(1);
    const workerInput = queueJob.mock.calls[0][0];
    const sources: Array<{ role: string; url: string; sha256: string }> =
      workerInput.assetManifest.sources;
    expect(sources.length).toBe(3);
    for (const source of sources) {
      expect(source.sha256).toBe(hashOf(`bytes-of:${source.url}`));
      // Prove it's a real content hash, not `sha256(url string)`.
      expect(source.sha256).not.toBe(hashOf(source.url));
    }
  });

  it("passes top-level Text Overlay Suite events into the Remotion template", async () => {
    episodeRow = { assemblyManifest: {} };
    const queueJob = vi
      .fn()
      .mockResolvedValue({ created: true, job: { id: "job-overlay" } });
    const stageAsset = vi
      .fn()
      .mockResolvedValue({ durationSec: 8, sha256: "abc" });
    const overlays: RunAssemblyJobTextOverlayEventInput[] = [
      {
        kind: "episode_indicator",
        text: "SUB-EP 21/30",
        variant: "top_left",
        startSec: 0,
        endSec: 0,
        entireClip: true,
      },
    ];

    await submitVdRemotionAssembly(
      {
        owner,
        clips: [{ clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" }],
        internalBaseUrl: "http://localhost:3000",
        filename: "ep-1.mp4",
        tenantId: owner.tenantId,
        overlays,
      },
      { queueJob, stageAsset }
    );

    const workerInput = queueJob.mock.calls[0]![0];
    expect(workerInput.remotionTemplate.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "overlay-episode_indicator-0",
          type: "text",
          content: "SUB-EP 21/30",
          startFrame: 0,
          durationFrames: 240,
        }),
      ])
    );
  });

  it("throws when no clips have a video URL (caller must fall back to ffmpeg)", async () => {
    await expect(
      submitVdRemotionAssembly(
        {
          owner,
          clips: [{ clipNumber: 1 }],
          internalBaseUrl: "http://localhost:3000",
          filename: "ep-1.mp4",
          tenantId: owner.tenantId,
        },
        { queueJob: vi.fn() }
      )
    ).rejects.toThrow(VdRemotionRenderError);
  });

  it("throws when ffprobe cannot determine a clip's duration", async () => {
    await expect(
      submitVdRemotionAssembly(
        {
          owner,
          clips: [{ clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" }],
          internalBaseUrl: "http://localhost:3000",
          filename: "ep-1.mp4",
          tenantId: owner.tenantId,
        },
        {
          queueJob: vi.fn(),
          stageAsset: vi.fn().mockResolvedValue({ sha256: "abc" }),
        }
      )
    ).rejects.toThrow(VdRemotionRenderError);
  });
});

describe("submitVdProductionEpisodeAssembly", () => {
  it("queues one segmented Remotion job with one template per Sub-Episode", async () => {
    const queueJob = vi.fn().mockResolvedValue({
      created: true,
      job: { id: "production-job-1" },
    });
    const stageAsset = vi
      .fn()
      .mockResolvedValue({ durationSec: 8, sha256: "bytes-sha" });

    const result = await submitVdProductionEpisodeAssembly(
      {
        owner: { tenantId: "tenant-1", userId: 1, seriesId: 10 },
        productionEpisodeNumber: 1,
        segments: [
          {
            subEpisodeNumber: 1,
            clips: [
              { clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" },
            ],
          },
          {
            subEpisodeNumber: 2,
            clips: [
              { clipNumber: 1, videoUrl: "https://cdn.example.com/2.mp4" },
            ],
          },
        ],
        internalBaseUrl: "http://localhost:3000",
        seriesTitle: "เรื่องทดสอบ",
        showEpisodeIndicator: true,
        showSeriesTitle: true,
      },
      { queueJob, stageAsset }
    );

    expect(result).toMatchObject({
      jobId: "production-job-1",
      segmentCount: 2,
      durationSeconds: 16,
    });
    const queuedInput = queueJob.mock.calls[0][0] as Record<string, any>;
    expect(queuedInput.segmentTemplates).toHaveLength(2);
    expect(queuedInput.segmentPlan.parts).toHaveLength(2);
    expect(queuedInput.postPasses).toEqual(["segment_concat"]);
  });

  it("slices multi-track BGM across segments and keeps credits on the final segment", async () => {
    const queueJob = vi.fn().mockResolvedValue({
      created: true,
      job: { id: "production-job-audio" },
    });
    const stageAsset = vi
      .fn()
      .mockResolvedValue({ durationSec: 8, sha256: "bytes-sha" });

    await submitVdProductionEpisodeAssembly(
      {
        owner: { tenantId: "tenant-1", userId: 1, seriesId: 10 },
        productionEpisodeNumber: 2,
        segments: [
          {
            subEpisodeNumber: 1,
            clips: [
              { clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" },
            ],
          },
          {
            subEpisodeNumber: 2,
            clips: [
              { clipNumber: 1, videoUrl: "https://cdn.example.com/2.mp4" },
            ],
          },
        ],
        internalBaseUrl: "http://localhost:3000",
        showEpisodeIndicator: true,
        showSeriesTitle: false,
        bgm: {
          tracks: [
            {
              id: "music-a",
              url: "https://cdn.example.com/music-a.mp3",
              startSeconds: 4,
              endSeconds: null,
              volumePercent: 50,
              loopUntilEnd: true,
              duckUnderVideoAudio: false,
            },
            {
              id: "music-b",
              url: "https://cdn.example.com/music-b.mp3",
              startSeconds: 0,
              endSeconds: 6,
              volumePercent: 25,
              loopUntilEnd: false,
              duckUnderVideoAudio: false,
            },
          ],
        },
        credits: { text: "เครดิต" },
      },
      { queueJob, stageAsset }
    );

    const queuedInput = queueJob.mock.calls[0][0] as Record<string, any>;
    expect(queuedInput.segmentTemplates[0].layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-bgm-music-a-0",
          startFrame: 120,
          durationFrames: 120,
        }),
      ])
    );
    expect(queuedInput.segmentTemplates[1].layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-bgm-music-a-1",
          startFrame: 0,
          durationFrames: 240,
        }),
      ])
    );
    expect(
      queuedInput.segmentTemplates[0].layers.find(
        (layer: any) => layer.id === "production-credits-roll"
      )
    ).toBeUndefined();
    expect(queuedInput.segmentTemplates[1].layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "production-credits-roll" }),
      ])
    );
    expect(
      queuedInput.assetManifest.sources.filter(
        (source: any) => source.role === "audio"
      )
    ).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* retimeSubtitleLinesToProbedClips                                           */
/* -------------------------------------------------------------------------- */

describe("retimeSubtitleLinesToProbedClips", () => {
  function line(over: Partial<Record<string, unknown>> = {}) {
    return {
      startSec: 0,
      endSec: 4,
      text: "hi",
      clipNumber: 1,
      clipLocalStartFrac: 0,
      clipLocalEndFrac: 0.5,
      ...over,
    } as any;
  }

  /**
   * Episode 124: 9 clips planned at 8s each (72s) delivered 90.35s of real
   * video. Captions timed off the plan ended ~18s early and drifted further
   * with every clip.
   */
  it("places captions on the real timeline, not the planned one", () => {
    const clips = Array.from({ length: 9 }, (_, index) => ({
      clipNumber: index + 1,
      durationSec: 10.0385, // 90.35 / 9 — what actually came back from ffprobe
    }));
    const lines = [
      // Planned: clip 1 [0,8) -> first half.
      line({
        clipNumber: 1,
        clipLocalStartFrac: 0,
        clipLocalEndFrac: 0.5,
        startSec: 0,
        endSec: 4,
      }),
      // Planned: clip 9 [64,72) -> last quarter.
      line({
        clipNumber: 9,
        clipLocalStartFrac: 0.75,
        clipLocalEndFrac: 1,
        startSec: 70,
        endSec: 72,
      }),
    ];

    const retimed = retimeSubtitleLinesToProbedClips(lines, clips);

    expect(retimed[0].startSec).toBeCloseTo(0, 3);
    expect(retimed[0].endSec).toBeCloseTo(5.019, 3);
    // The last caption must now close out the REAL 90.35s video, not 72s.
    expect(retimed[1].startSec).toBeCloseTo(8 * 10.0385 + 0.75 * 10.0385, 3);
    expect(retimed[1].endSec).toBeCloseTo(9 * 10.0385, 3);
  });

  /** One clip overrunning must not shift a later clip's captions by its error. */
  it("is per-clip, so an uneven overrun does not accumulate wrongly", () => {
    const clips = [
      { clipNumber: 1, durationSec: 20 }, // planned 8, ran way long
      { clipNumber: 2, durationSec: 8 }, // planned 8, on target
    ];
    const retimed = retimeSubtitleLinesToProbedClips(
      [
        line({
          clipNumber: 2,
          clipLocalStartFrac: 0,
          clipLocalEndFrac: 1,
          startSec: 8,
          endSec: 16,
        }),
      ],
      clips
    );

    expect(retimed[0].startSec).toBeCloseTo(20, 5);
    expect(retimed[0].endSec).toBeCloseTo(28, 5);
  });

  it("passes through lines with no clip attribution untouched", () => {
    const original = {
      startSec: 3,
      endSec: 5,
      text: "sequential estimate",
    } as any;
    const [result] = retimeSubtitleLinesToProbedClips(
      [original],
      [{ clipNumber: 1, durationSec: 10 }]
    );
    expect(result).toBe(original);
  });

  it("passes through when the attributed clip is not in this render", () => {
    const original = line({ clipNumber: 42 });
    const [result] = retimeSubtitleLinesToProbedClips(
      [original],
      [{ clipNumber: 1, durationSec: 10 }]
    );
    expect(result).toBe(original);
  });

  it("keeps the original rather than emitting a zero-length caption", () => {
    const original = line({ clipLocalStartFrac: 0.5, clipLocalEndFrac: 0.5 });
    const [result] = retimeSubtitleLinesToProbedClips(
      [original],
      [{ clipNumber: 1, durationSec: 10 }]
    );
    expect(result).toBe(original);
  });

  it("preserves speaker and text while re-timing", () => {
    const [result] = retimeSubtitleLinesToProbedClips(
      [
        line({
          speakerName: "ปราง",
          text: "มือถือเครื่องเดียว ทำไมต้องตามไม่เลิก",
        }),
      ],
      [{ clipNumber: 1, durationSec: 10 }]
    );
    expect(result.speakerName).toBe("ปราง");
    expect(result.text).toBe("มือถือเครื่องเดียว ทำไมต้องตามไม่เลิก");
    expect(result.endSec).toBeCloseTo(5, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileVdRemotionAssembly                                                */
/* -------------------------------------------------------------------------- */

describe("reconcileVdRemotionAssembly", () => {
  it("is a no-op while the worker job is still queued/running", async () => {
    workerJobRow = { id: "job-1", status: "running" };
    const result = await reconcileVdRemotionAssembly(owner, "job-1");
    expect(result).toEqual({ reconciled: false });
  });

  it("writes status:'completed' + videoUrl from outputJson.outputUrl on success", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-1" },
      },
    };
    workerJobRow = {
      id: "job-1",
      status: "completed",
      outputJson: { outputUrl: "https://cdn.example.com/final.mp4" },
    };
    const result = await reconcileVdRemotionAssembly(owner, "job-1");
    expect(result).toEqual({ reconciled: true, status: "completed" });
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "completed",
      videoUrl: "https://cdn.example.com/final.mp4",
    });
  });

  /**
   * Field incident 2026-08-01 — worker job
   * `da73b8ef-9d4e-436f-b6fa-530d3381c438` (`vd-sub-episode-remotion:21:124`)
   * rendered a 93 MB mp4 and published it, but reconcile read the never-written
   * `outputJson.outputUrl` and persisted `status:"failed"` with
   * "Remotion render completed but produced no output URL", throwing away a
   * finished video. This is the REAL `outputJson` shape from that row.
   */
  it("resolves the mp4 from the worker completion payload mirror, not outputJson.outputUrl", async () => {
    const storageRef =
      "worker-artifacts/tenant-ZCSKEM9s/da73b8ef-9d4e-436f-b6fa-530d3381c438/a053bf438ffd8d24f25335fa-render.mp4";
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-6" },
      },
    };
    workerJobRow = {
      id: "job-6",
      status: "completed",
      outputJson: {
        assignedAt: "2026-08-01T06:43:14.241Z",
        assignmentStatus: "active",
        lastEventType: "job.completed",
        lastArtifactType: "remotion_render_mp4",
        lastEventPayload: {
          outputUrl: storageRef,
          outputArtifactRef: { storageRef, mimeType: "video/mp4" },
        },
      },
    };

    const result = await reconcileVdRemotionAssembly(owner, "job-6");

    expect(result).toEqual({ reconciled: true, status: "completed" });
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "completed",
      videoUrl: "https://cdn.example.com/resolved.mp4",
    });
  });

  it("prefers the already-servable publishedArtifacts sourceUrl over a bare storage key", async () => {
    const storageRef = "worker-artifacts/tenant-x/job-9/render.mp4";
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-9" },
      },
    };
    workerJobRow = {
      id: "job-9",
      status: "completed",
      outputJson: {
        publishedArtifacts: [
          {
            sourceUrl: `/api/storage/files/${storageRef}`,
            publishedItemId: 650,
          },
        ],
        lastEventPayload: { outputUrl: storageRef },
      },
    };

    const result = await reconcileVdRemotionAssembly(owner, "job-9");

    expect(result).toEqual({ reconciled: true, status: "completed" });
    // Already an http-less but servable path -> persisted as-is, no storageGet
    // round trip (which would have returned the mocked cdn URL instead).
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "completed",
      videoUrl: `/api/storage/files/${storageRef}`,
    });
  });

  it("falls back to the published worker_artifacts mp4 row when the payload mirror is missing", async () => {
    const storageRef = "worker-artifacts/tenant-x/job-7/render.mp4";
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-7" },
      },
    };
    workerJobRow = {
      id: "job-7",
      status: "completed",
      outputJson: { assignedAt: "x" },
    };
    workerArtifactRows = [{ storageRef }];

    const result = await reconcileVdRemotionAssembly(owner, "job-7");

    expect(result).toEqual({ reconciled: true, status: "completed" });
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "completed",
    });
    workerArtifactRows = [];
  });

  it("still fails when the job completed with no artifact anywhere", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-8" },
      },
    };
    workerJobRow = {
      id: "job-8",
      status: "completed",
      outputJson: { assignedAt: "x" },
    };
    workerArtifactRows = [];

    const result = await reconcileVdRemotionAssembly(owner, "job-8");

    expect(result).toEqual({ reconciled: true, status: "failed" });
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "failed",
      error: "Remotion render completed but produced no output URL",
    });
  });

  it("writes status:'failed' with the worker job's failureReason", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-2" },
      },
    };
    workerJobRow = {
      id: "job-2",
      status: "failed",
      failureReason: "renderer crashed",
    };
    const result = await reconcileVdRemotionAssembly(owner, "job-2");
    expect(result).toEqual({ reconciled: true, status: "failed" });
    expect((episodeRow.assemblyManifest as any).compiledVideo).toMatchObject({
      status: "failed",
      error: "renderer crashed",
    });
  });

  /* ---------------------------------------------------------------------- */
  /* §P3 queued-TTL fallback (worker-app-remotion-render-video plan)        */
  /* ---------------------------------------------------------------------- */

  it("is a no-op while still queued and within the TTL", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-3" },
      },
    };
    workerJobRow = { id: "job-3", status: "queued" };
    const submittedAt = Date.now() - (VD_REMOTION_QUEUED_TTL_MS - 60_000);
    const result = await reconcileVdRemotionAssembly(
      owner,
      "job-3",
      submittedAt
    );
    expect(result).toEqual({ reconciled: false });
    expect((episodeRow.assemblyManifest as any).compiledVideo.status).toBe(
      "pending"
    );
  });

  it("falls back to a failed compiledVideo state once the queued TTL elapses (no Lane B claim)", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-4" },
      },
    };
    workerJobRow = { id: "job-4", status: "queued" };
    const submittedAt = Date.now() - (VD_REMOTION_QUEUED_TTL_MS + 60_000);
    const result = await reconcileVdRemotionAssembly(
      owner,
      "job-4",
      submittedAt
    );
    expect(result).toEqual({ reconciled: true, status: "failed" });
    const compiledVideo = (episodeRow.assemblyManifest as any).compiledVideo;
    expect(compiledVideo.status).toBe("failed");
    expect(compiledVideo.error).toContain("vd_remotion_worker_unavailable");
    expect(compiledVideo.pendingJobId).toBeUndefined();
  });

  it("treats a missing submittedAt as never-timed-out (stays pending)", async () => {
    episodeRow = {
      assemblyManifest: {
        compiledVideo: { status: "pending", pendingJobId: "job-5" },
      },
    };
    workerJobRow = { id: "job-5", status: "queued" };
    const result = await reconcileVdRemotionAssembly(owner, "job-5");
    expect(result).toEqual({ reconciled: false });
  });
});
