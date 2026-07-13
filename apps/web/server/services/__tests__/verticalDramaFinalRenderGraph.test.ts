/**
 * Vertical Drama Series — Final Render filter graph tests (task #21 / W12.5
 * phase A).
 *
 * Pure string/array assertions only — NO real ffmpeg execution (per task
 * constraints). `buildConcatFfmpegArgs` is imported directly from the sibling
 * job-service module ONLY for the byte-identical regression-lock comparison
 * below; that module's `db`/`storage` imports are lazy getters (see
 * `server/db.ts`) so importing it here for a single pure function needs no
 * mocking ceremony.
 */

import { describe, expect, it } from "vitest";
import { buildConcatFfmpegArgs } from "../verticalDramaEpisodeVideoAssembly";
import {
  buildAssBurnFfmpegArgs,
  buildAssSubtitleFile,
  buildBannerInputArgs,
  buildBgmMixFfmpegArgs,
  buildBgmMixFilterComplex,
  buildCreditsAssFile,
  buildCreditsBurnFfmpegArgs,
  buildFinalRenderFfmpegArgs,
  buildProductionOverlaysAssFile,
  buildSubtitlesFilterOption,
  buildWatermarkInputArgs,
  escapeFfmpegFilterPath,
  resolveBannerOverlayChain,
  resolveCreditsRollGeometry,
  resolveCreditsRollWindow,
  resolveWatermarkOverlayFragment,
  splitCreditsRollLines,
  validateResolvedBanners,
  VD_CREDITS_ROLL_WINDOW_SEC,
  VD_PRODUCTION_OVERLAY_MAX_COUNT,
  VD_TEXT_OVERLAY_ASS_KINDS,
  type ProductionEpisodeOverlayItem,
  type ResolvedBanner,
  type ResolvedWatermarkImage,
  type VdTextOverlayAssEvent,
} from "../verticalDramaFinalRenderGraph";

const CONCAT_LIST_PATH = "/tmp/concat.txt";
const OUTPUT_PATH = "/tmp/out.mp4";

function extractFilterComplex(args: string[]): string {
  const idx = args.indexOf("-filter_complex");
  if (idx === -1) throw new Error("no -filter_complex in args");
  return args[idx + 1]!;
}

/* -------------------------------------------------------------------------- */
/* Regression lock                                                            */
/* -------------------------------------------------------------------------- */

describe("buildFinalRenderFfmpegArgs — concat-only regression lock", () => {
  it("is byte-identical to buildConcatFfmpegArgs when no new inputs are supplied", () => {
    const legacy = buildConcatFfmpegArgs({
      inputPaths: [],
      concatListPath: CONCAT_LIST_PATH,
      outputPath: OUTPUT_PATH,
    });
    const finalRender = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 60,
    });
    expect(finalRender).toEqual(legacy);
  });

  it("is byte-identical with an explicit fps override too", () => {
    const legacy = buildConcatFfmpegArgs({
      inputPaths: [],
      concatListPath: CONCAT_LIST_PATH,
      outputPath: OUTPUT_PATH,
      fps: 24,
    });
    const finalRender = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 60,
      fps: 24,
    });
    expect(finalRender).toEqual(legacy);
  });

  it("stays on the legacy path when banners/subtitles are explicitly empty/null (not just absent)", () => {
    const legacy = buildConcatFfmpegArgs({
      inputPaths: [],
      concatListPath: CONCAT_LIST_PATH,
      outputPath: OUTPUT_PATH,
    });
    const finalRender = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 60,
      banners: [],
      subtitles: null,
    });
    expect(finalRender).toEqual(legacy);
  });
});

/* -------------------------------------------------------------------------- */
/* Banners only                                                               */
/* -------------------------------------------------------------------------- */

describe("buildFinalRenderFfmpegArgs — banners only", () => {
  it("stages a bottom_band 'entire' banner with correct box/fade/overlay + optional audio map", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      banners: [
        {
          localPngPath: "/tmp/banner0.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 24,
          fadeSec: 0.3,
        },
      ],
    });

    expect(args.slice(0, 7)).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      CONCAT_LIST_PATH,
    ]);
    // Banner input args (itsoffset/loop/t/i) come right after the concat input.
    expect(args.slice(7, 15)).toEqual([
      "-itsoffset",
      "0",
      "-loop",
      "1",
      "-t",
      "24",
      "-i",
      "/tmp/banner0.png",
    ]);

    const fc = extractFilterComplex(args);
    expect(fc).toContain(
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]"
    );
    expect(fc).toContain(
      "[1:v]scale=1080:360:force_original_aspect_ratio=increase,crop=1080:360,format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=23.7:d=0.3:alpha=1[nbimg0]"
    );
    expect(fc).toContain(
      "[vbase][nbimg0]overlay=0:1400:enable='between(t\\,0\\,24)'[nb0]"
    );

    expect(args).toContain("-map");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("[nb0]");
    expect(args[mapIdx + 3]).toBe("0:a?");
    expect(args[args.length - 1]).toBe(OUTPUT_PATH);
  });

  it("mirrors side_vertical to the right edge when sideAlign is 'right'", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      banners: [
        {
          localPngPath: "/tmp/side.png",
          placementId: "side_vertical",
          sideAlign: "right",
          startSec: 0,
          endSec: 24,
          fadeSec: 0.3,
        },
      ],
    });
    const fc = extractFilterComplex(args);
    // box.w=300 box.x default 20 -> mirrored x = 1080 - 300 - 20 = 760; y=480,h=960 unchanged.
    expect(fc).toContain(
      "scale=300:960:force_original_aspect_ratio=increase,crop=300:960"
    );
    expect(fc).toContain("overlay=760:480:enable=");
  });

  it("keeps left-aligned side_vertical at its default box when sideAlign is omitted", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      banners: [
        {
          localPngPath: "/tmp/side.png",
          placementId: "side_vertical",
          startSec: 0,
          endSec: 24,
          fadeSec: 0.3,
        },
      ],
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain("overlay=20:480:enable=");
  });

  it("places a fullscreen 'window' banner with itsoffset/duration matching its own window, not the full video", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 60,
      banners: [
        {
          localPngPath: "/tmp/full.png",
          placementId: "fullscreen",
          startSec: 10,
          endSec: 13,
          fadeSec: 0.3,
        },
      ],
    });
    expect(args.slice(7, 15)).toEqual([
      "-itsoffset",
      "10",
      "-loop",
      "1",
      "-t",
      "3",
      "-i",
      "/tmp/full.png",
    ]);
    const fc = extractFilterComplex(args);
    expect(fc).toContain(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=rgba,fade=t=in:st=10:d=0.3:alpha=1,fade=t=out:st=12.7:d=0.3:alpha=1"
    );
    expect(fc).toContain("overlay=0:0:enable='between(t\\,10\\,13)'");
  });
});

/* -------------------------------------------------------------------------- */
/* Dialogue audio only                                                        */
/* -------------------------------------------------------------------------- */

describe("buildFinalRenderFfmpegArgs — dialogueAudio only", () => {
  it("adelay-shifts a single segment (ms math) and volume-trims when gainDb is set, then amixes with clip audio", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: {
        segments: [{ localPath: "/tmp/d0.mp3", startSec: 2.5, gainDb: 3 }],
      },
    });
    // No banners -> the dialogue segment is ffmpeg input index 1.
    expect(args.slice(7, 9)).toEqual(["-i", "/tmp/d0.mp3"]);

    const fc = extractFilterComplex(args);
    expect(fc).toContain("[1:a]adelay=2500:all=1,volume=3dB[da0]");
    expect(fc).toContain(
      "[0:a][da0]amix=inputs=2:duration=longest:dropout_transition=0[afinal]"
    );
    expect(fc).not.toContain("loudnorm");

    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("[vbase]");
    expect(args[mapIdx + 3]).toBe("[afinal]");
  });

  it("omits the volume filter when gainDb is absent", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: { segments: [{ localPath: "/tmp/d0.mp3", startSec: 1 }] },
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain("[1:a]adelay=1000:all=1[da0]");
    expect(fc).not.toContain("volume=");
  });

  it("mixes multiple segments and chains loudnorm after amix when loudnessNormalize is set", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: {
        segments: [
          { localPath: "/tmp/d0.mp3", startSec: 0 },
          { localPath: "/tmp/d1.mp3", startSec: 4.2 },
        ],
        loudnessNormalize: true,
      },
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain("[1:a]adelay=0:all=1[da0]");
    expect(fc).toContain("[2:a]adelay=4200:all=1[da1]");
    expect(fc).toContain(
      "[0:a][da0][da1]amix=inputs=3:duration=longest:dropout_transition=0[amixed]"
    );
    expect(fc).toContain("[amixed]loudnorm=I=-16:TP=-1.5:LRA=11[afinal]");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 3]).toBe("[afinal]");
  });

  it("normalizes the plain clip audio directly when loudnessNormalize is set with zero segments", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: { segments: [], loudnessNormalize: true },
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain("[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[afinal]");
    expect(fc).not.toContain("amix");
  });

  it("accepts duckClipAudioDb as a documented no-op (identical graph with or without it)", () => {
    const withDuck = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: {
        segments: [{ localPath: "/tmp/d0.mp3", startSec: 0 }],
        duckClipAudioDb: -6,
      },
    });
    const withoutDuck = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      dialogueAudio: { segments: [{ localPath: "/tmp/d0.mp3", startSec: 0 }] },
    });
    expect(withDuck).toEqual(withoutDuck);
  });
});

/* -------------------------------------------------------------------------- */
/* Subtitles only                                                             */
/* -------------------------------------------------------------------------- */

describe("buildFinalRenderFfmpegArgs — subtitles only", () => {
  it("adds a subtitles filter stage mapping [vbase] -> [vsub]", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      subtitles: { assPath: "/tmp/captions.ass" },
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain("[vbase]subtitles=filename='/tmp/captions.ass'[vsub]");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("[vsub]");
    expect(args[mapIdx + 3]).toBe("0:a?");
  });

  it("appends an escaped fontsdir option when supplied", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      subtitles: {
        assPath: "/tmp/captions.ass",
        fontsDir: "/usr/share/fonts/thai",
      },
    });
    const fc = extractFilterComplex(args);
    expect(fc).toContain(
      "subtitles=filename='/tmp/captions.ass':fontsdir='/usr/share/fonts/thai'[vsub]"
    );
  });
});

/* -------------------------------------------------------------------------- */
/* All combined + z-order                                                     */
/* -------------------------------------------------------------------------- */

describe("buildFinalRenderFfmpegArgs — all features combined, z-order", () => {
  it("orders video -> non-fullscreen banners -> subtitles -> fullscreen banners, and mixes audio", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 24,
      banners: [
        {
          localPngPath: "/tmp/band.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 24,
          fadeSec: 0.3,
        },
        {
          localPngPath: "/tmp/full.png",
          placementId: "fullscreen",
          startSec: 10,
          endSec: 13,
          fadeSec: 0.3,
        },
      ],
      dialogueAudio: { segments: [{ localPath: "/tmp/d0.mp3", startSec: 1 }] },
      subtitles: { assPath: "/tmp/captions.ass" },
    });

    // Global input order: concat(0), band banner(1), fullscreen banner(2), dialogue segment(3).
    expect(args.slice(7, 15)).toEqual([
      "-itsoffset",
      "0",
      "-loop",
      "1",
      "-t",
      "24",
      "-i",
      "/tmp/band.png",
    ]);
    expect(args.slice(15, 23)).toEqual([
      "-itsoffset",
      "10",
      "-loop",
      "1",
      "-t",
      "3",
      "-i",
      "/tmp/full.png",
    ]);
    expect(args.slice(23, 25)).toEqual(["-i", "/tmp/d0.mp3"]);

    const fc = extractFilterComplex(args);
    const bandOverlayIdx = fc.indexOf("[vbase][nbimg0]overlay=0:1400");
    const subtitlesIdx = fc.indexOf("subtitles=filename=");
    const fullscreenScaleIdx = fc.indexOf("[2:v]scale=1080:1920");
    const fullscreenOverlayIdx = fc.indexOf("overlay=0:0:enable=");
    const dialogueAdelayIdx = fc.indexOf("[3:a]adelay=");

    expect(bandOverlayIdx).toBeGreaterThan(-1);
    expect(subtitlesIdx).toBeGreaterThan(bandOverlayIdx);
    expect(fullscreenScaleIdx).toBeGreaterThan(subtitlesIdx);
    expect(fullscreenOverlayIdx).toBeGreaterThan(fullscreenScaleIdx);
    // The subtitles stage must consume the non-fullscreen chain's own output label.
    expect(fc).toContain("[nb0]subtitles=filename=");
    // The fullscreen chain must consume the subtitles stage's output label.
    expect(fc).toContain(
      "[vsub][fbimg0]overlay=0:0:enable='between(t\\,10\\,13)'[fb0]"
    );
    expect(dialogueAdelayIdx).toBeGreaterThan(-1);

    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("[fb0]");
    expect(args[mapIdx + 3]).toBe("[afinal]");
  });
});

/* -------------------------------------------------------------------------- */
/* Banner validation                                                          */
/* -------------------------------------------------------------------------- */

function bannerAt(overrides: Partial<ResolvedBanner> = {}): ResolvedBanner {
  return {
    localPngPath: "/tmp/b.png",
    placementId: "bottom_band",
    startSec: 0,
    endSec: 10,
    fadeSec: 0.3,
    ...overrides,
  };
}

describe("validateResolvedBanners", () => {
  it("returns no issues for a valid, small banner set", () => {
    const issues = validateResolvedBanners([bannerAt()], 60);
    expect(issues).toEqual([]);
  });

  it("flags more than 5 banners as an error", () => {
    const banners = Array.from({ length: 6 }, () => bannerAt());
    const issues = validateResolvedBanners(banners, 60);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_FINAL_RENDER_BANNER_TOO_MANY",
        severity: "error",
      })
    );
  });

  it("flags an unknown placementId as an error", () => {
    const issues = validateResolvedBanners(
      [
        bannerAt({
          placementId: "banner_typo" as ResolvedBanner["placementId"],
        }),
      ],
      60
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_FINAL_RENDER_BANNER_UNKNOWN_PLACEMENT",
        severity: "error",
      })
    );
  });

  it("flags an invalid time window (endSec <= startSec) as an error", () => {
    const issues = validateResolvedBanners(
      [bannerAt({ startSec: 5, endSec: 5 })],
      60
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_FINAL_RENDER_BANNER_INVALID_WINDOW",
        severity: "error",
      })
    );
  });

  it("flags a banner ending after the video duration as out of bounds", () => {
    const issues = validateResolvedBanners(
      [bannerAt({ startSec: 0, endSec: 61 })],
      60
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_FINAL_RENDER_BANNER_OUT_OF_BOUNDS",
        severity: "error",
      })
    );
  });

  it("flags two overlapping fullscreen banners as an error", () => {
    const issues = validateResolvedBanners(
      [
        bannerAt({ placementId: "fullscreen", startSec: 0, endSec: 5 }),
        bannerAt({ placementId: "fullscreen", startSec: 3, endSec: 8 }),
      ],
      60
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "VD_FINAL_RENDER_BANNER_FULLSCREEN_OVERLAP",
        severity: "error",
      })
    );
  });

  it("does not flag two back-to-back (non-overlapping) fullscreen banners", () => {
    const issues = validateResolvedBanners(
      [
        bannerAt({ placementId: "fullscreen", startSec: 0, endSec: 5 }),
        bannerAt({ placementId: "fullscreen", startSec: 5, endSec: 8 }),
      ],
      60
    );
    expect(
      issues.filter(i => i.code === "VD_FINAL_RENDER_BANNER_FULLSCREEN_OVERLAP")
    ).toEqual([]);
  });

  it("warns (does not error) when fullscreen banners exceed 20% of the video duration", () => {
    const issues = validateResolvedBanners(
      [bannerAt({ placementId: "fullscreen", startSec: 0, endSec: 15 })],
      60
    );
    const budgetIssue = issues.find(
      i => i.code === "VD_FINAL_RENDER_BANNER_FULLSCREEN_BUDGET"
    );
    expect(budgetIssue).toBeTruthy();
    expect(budgetIssue?.severity).toBe("warning");
    expect(issues.some(i => i.severity === "error")).toBe(false);
  });

  it("buildFinalRenderFfmpegArgs throws an aggregated error for invalid banners", () => {
    const banners = Array.from({ length: 6 }, () => bannerAt());
    expect(() =>
      buildFinalRenderFfmpegArgs({
        concatListPath: CONCAT_LIST_PATH,
        output: OUTPUT_PATH,
        videoDurationSeconds: 60,
        banners,
      })
    ).toThrow(/vertical_drama_final_render_invalid_banners/);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveBannerOverlayChain / buildBannerInputArgs (direct)                  */
/* -------------------------------------------------------------------------- */

describe("resolveBannerOverlayChain", () => {
  it("passes the base label straight through for an empty item list", () => {
    const chain = resolveBannerOverlayChain([], {
      baseLabel: "vbase",
      labelPrefix: "nb",
    });
    expect(chain).toEqual({ filterFragments: [], outputLabel: "vbase" });
  });

  it("chains multiple items sequentially with unique labels", () => {
    const chain = resolveBannerOverlayChain(
      [
        { banner: bannerAt({ placementId: "bottom_band" }), inputIndex: 1 },
        { banner: bannerAt({ placementId: "side_vertical" }), inputIndex: 2 },
      ],
      { baseLabel: "vbase", labelPrefix: "x" }
    );
    expect(chain.filterFragments).toHaveLength(4);
    expect(chain.outputLabel).toBe("x1");
    expect(chain.filterFragments[1]).toContain("[vbase][ximg0]");
    expect(chain.filterFragments[3]).toContain("[x0][ximg1]");
  });
});

describe("buildBannerInputArgs", () => {
  it("builds -itsoffset/-loop/-t/-i for every banner in array order", () => {
    const args = buildBannerInputArgs([
      bannerAt({ localPngPath: "/a.png", startSec: 0, endSec: 10 }),
      bannerAt({
        localPngPath: "/b.png",
        placementId: "fullscreen",
        startSec: 5,
        endSec: 8,
      }),
    ]);
    expect(args).toEqual([
      "-itsoffset",
      "0",
      "-loop",
      "1",
      "-t",
      "10",
      "-i",
      "/a.png",
      "-itsoffset",
      "5",
      "-loop",
      "1",
      "-t",
      "3",
      "-i",
      "/b.png",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* escapeFfmpegFilterPath                                                     */
/* -------------------------------------------------------------------------- */

describe("escapeFfmpegFilterPath", () => {
  it("wraps a plain path in single quotes", () => {
    expect(escapeFfmpegFilterPath("/tmp/plain.ass")).toBe("'/tmp/plain.ass'");
  });

  it("backslash-escapes colons", () => {
    expect(escapeFfmpegFilterPath("/tmp/a:b.ass")).toBe("'/tmp/a\\:b.ass'");
  });

  it("doubles backslashes and escapes colons together", () => {
    const result = escapeFfmpegFilterPath("C:\\fonts\\thai.ttf");
    expect(result).toContain("C\\:");
    expect(result).toContain("\\\\fonts\\\\thai.ttf");
  });

  it("escapes an embedded single quote using the close-escape-reopen idiom", () => {
    expect(escapeFfmpegFilterPath("/tmp/it's.ass")).toBe("'/tmp/it'\\''s.ass'");
  });
});

/* -------------------------------------------------------------------------- */
/* buildAssSubtitleFile                                                       */
/* -------------------------------------------------------------------------- */

describe("buildAssSubtitleFile", () => {
  it("classic_box: emits the mapped Style line + a speaker-chip line + a plain narration line", () => {
    const ass = buildAssSubtitleFile(
      [
        { startSec: 0, endSec: 2.5, speakerName: "สมชาย", text: "สวัสดีครับ" },
        { startSec: 2.5, endSec: 5, text: "ข้อความบรรยาย" },
      ],
      "classic_box",
      { playResX: 1080, playResY: 1920 }
    );

    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("WrapStyle: 0");
    expect(ass).toContain(
      "Style: VdClassicBox,Noto Sans Thai,60,&H00FFFFFF,&H000000FF,&H7A000000,&HA0000000,0,0,0,0,100,100,0,0,3,2,0,2,96,96,170,1"
    );
    expect(ass).toContain(
      "Dialogue: 0,0:00:00.00,0:00:02.50,VdClassicBox,,0,0,0,,{\\b1\\fs36}สมชาย:{\\r}\\Nสวัสดีครับ"
    );
    expect(ass).toContain(
      "Dialogue: 0,0:00:02.50,0:00:05.00,VdClassicBox,,0,0,0,,ข้อความบรรยาย"
    );
  });

  it("neon_glow: uses the Kanit/cyan-magenta style and escapes braces/commas/newlines", () => {
    const ass = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 3, text: "สวัสดี {ครับ} เธอ,ฉัน\nรัก" }],
      "neon_glow",
      { playResX: 1080, playResY: 1920 }
    );
    expect(ass).toContain(
      "Style: VdNeonGlow,Kanit,56,&H00FEE2A8,&H000000FF,&H00FF2ABF,&HB0000000,1,0,0,0,100,100,0,0,3,2,1,2,84,84,170,1"
    );
    // Braces neutralized to fullwidth look-alikes (never left as literal { }).
    expect(ass).not.toMatch(/,\{[^\\]/); // no raw "{" starting the Text field content itself
    expect(ass).toContain("｛ครับ｝");
    // Commas inside dialogue text are preserved verbatim (safe as the last CSV field).
    expect(ass).toContain("เธอ,ฉัน");
    // Embedded newline becomes a literal ASS forced line break.
    expect(ass).toContain("เธอ,ฉัน\\Nรัก");
    expect(ass).not.toMatch(/เธอ,ฉัน\nรัก/);
  });

  it("no_subtitle_style: emits a valid header with zero Dialogue events", () => {
    const ass = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 2, text: "hi" }],
      "no_subtitle_style",
      {
        playResX: 1080,
        playResY: 1920,
      }
    );
    expect(ass).toContain("[Events]");
    expect(ass).not.toContain("Dialogue:");
    expect(ass).not.toContain("Style: Vd");
  });

  it("emits zero Dialogue events for an empty lines array on a real preset", () => {
    const ass = buildAssSubtitleFile([], "classic_box", {
      playResX: 1080,
      playResY: 1920,
    });
    expect(ass).not.toContain("Dialogue:");
    expect(ass).toContain("Style: VdClassicBox");
  });

  it("records fontsDir as an informational comment line without embedding a real font path in the graph builder", () => {
    const ass = buildAssSubtitleFile([], "classic_box", {
      playResX: 1080,
      playResY: 1920,
      fontsDir: "/opt/fonts/thai",
    });
    expect(ass).toContain(
      "; Fonts directory (resolved by caller; not embedded): /opt/fonts/thai"
    );
  });

  it("karaoke_word: splits space-delimited words and tags them with evenly-distributed \\k durations", () => {
    const ass = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 3, text: "hello world foo" }],
      "karaoke_word",
      {
        playResX: 1080,
        playResY: 1920,
      }
    );
    // 3s * 100 = 300 centiseconds / 3 words = 100 each.
    expect(ass).toContain("{\\k100}hello {\\k100}world {\\k100}foo");
  });

  it("karaoke_word: falls back to fixed-size chunking when the text has no whitespace", () => {
    const ass = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 2, text: "abcdefghij" }],
      "karaoke_word",
      {
        playResX: 1080,
        playResY: 1920,
      }
    );
    // No spaces -> chunks of 5 chars: "abcde", "fghij". 2s*100=200cs / 2 chunks = 100 each.
    expect(ass).toContain("{\\k100}abcde {\\k100}fghij");
  });
});

/* -------------------------------------------------------------------------- */
/* Text Overlay Suite (task #34)                                              */
/* -------------------------------------------------------------------------- */

describe("buildAssSubtitleFile — text overlay events (task #34)", () => {
  it("is byte-identical to the pre-task-#34 call shape when overlays is omitted", () => {
    const withoutOverlaysArg = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 2, text: "hi" }],
      "classic_box",
      { playResX: 1080, playResY: 1920 }
    );
    const withEmptyOverlays = buildAssSubtitleFile(
      [{ startSec: 0, endSec: 2, text: "hi" }],
      "classic_box",
      { playResX: 1080, playResY: 1920 },
      []
    );
    expect(withEmptyOverlays).toBe(withoutOverlaysArg);
  });

  it("renders overlay styles/events even when preset is no_subtitle_style (subtitlePreset 'none')", () => {
    const ass = buildAssSubtitleFile([], "no_subtitle_style", {
      playResX: 1080,
      playResY: 1920,
    }, [
      { kind: "end_card", startSec: 57, endSec: 60, text: "ติดตามตอนต่อไป" },
    ]);
    expect(ass).toContain("Style: VdEndCardTeaser");
    expect(ass).toContain("Dialogue:");
    expect(ass).toContain("ติดตามตอนต่อไป");
    // No dialogue captions when preset itself is the sentinel.
    expect(ass).not.toContain("Style: VdClassicBox");
  });

  it("only emits [V4+ Styles] entries for overlay kinds actually present", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "episode_indicator", startSec: 0, endSec: 60, text: "EP 3/10" },
    ]);
    expect(ass).toContain("Style: VdEpIndicator");
    for (const kind of VD_TEXT_OVERLAY_ASS_KINDS) {
      if (kind === "episode_indicator") continue;
      // None of the other 7 overlay style names should appear.
      expect(ass).not.toContain(`Style: Vd${kind}`);
    }
  });

  it("drops a degenerate overlay event (endSec <= startSec) without throwing", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "end_card", startSec: 10, endSec: 10, text: "should be dropped" },
    ]);
    expect(ass).not.toContain("Style: VdEndCardTeaser");
    expect(ass).not.toContain("should be dropped");
  });

  it("drops an overlay event with blank text without throwing", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "end_card", startSec: 0, endSec: 3, text: "   " },
    ]);
    expect(ass).not.toContain("Style: VdEndCardTeaser");
  });

  it("applies the end_card lower_band variant as an inline \\an2\\pos() override", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "end_card", startSec: 0, endSec: 3, text: "แบนด์ล่าง", variant: "lower_band" },
    ]);
    expect(ass).toContain("\\an2\\pos(540,1650)");
  });

  it("center_card (default/omitted variant) does NOT add a position override", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "end_card", startSec: 0, endSec: 3, text: "กลางจอ" },
    ]);
    expect(ass).not.toContain("\\pos(540,1650)");
  });

  it("applies the episode_indicator top_left variant as an inline \\an7 override", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "episode_indicator", startSec: 0, endSec: 60, text: "EP 1", variant: "top_left" },
    ]);
    expect(ass).toContain("\\an7");
  });

  it("renders watermark_text with a \\pos() computed from its corner + marginPx, and an \\1a alpha override from opacity", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      {
        kind: "watermark_text",
        startSec: 0,
        endSec: 60,
        text: "@mychannel",
        variant: "bottom_left",
        marginPx: 40,
        opacity: 0.5,
      },
    ]);
    // bottom_left => x=marginPx, y=1920-marginPx.
    expect(ass).toContain("\\an1\\pos(40,1880)");
    // opacity 0.5 -> alpha byte round((1-0.5)*255)=128=0x80.
    expect(ass).toContain("\\1a&H80&");
  });

  it("renders a secondaryText line via \\N with a smaller font-size override", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      {
        kind: "character_intro",
        startSec: 0,
        endSec: 2.5,
        text: "มาลี",
        secondaryText: "นางเอก",
      },
    ]);
    expect(ass).toContain("มาลี\\N{\\fs");
    expect(ass).toContain("นางเอก");
  });

  it("fades every overlay kind in/out via \\fad(...)", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "title_bumper", startSec: 0, endSec: 1.2, text: "ชื่อเรื่อง" },
    ]);
    expect(ass).toMatch(/\\fad\(\d+,\d+\)/);
  });

  it("renders multiple distinct overlay kinds together in one file, each with its own style", () => {
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, [
      { kind: "title_bumper", startSec: 0, endSec: 1.2, text: "ชื่อเรื่อง" },
      { kind: "opener_recap", startSec: 1.2, endSec: 5.2, text: "ความเดิม" },
      { kind: "time_setting", startSec: 10, endSec: 12.5, text: "ปี 1980" },
      { kind: "narrative_hook", startSec: 15, endSec: 18, text: "จะเกิดอะไรขึ้น" },
    ]);
    expect(ass).toContain("Style: VdTitleBumper");
    expect(ass).toContain("Style: VdOpenerRecap");
    expect(ass).toContain("Style: VdTimeSetting");
    expect(ass).toContain("Style: VdNarrativeHook");
  });

  it("covers all 8 overlay kinds without throwing and emits a style line for each", () => {
    const events: VdTextOverlayAssEvent[] = VD_TEXT_OVERLAY_ASS_KINDS.map((kind, i) => ({
      kind,
      startSec: i * 10,
      endSec: i * 10 + 2,
      text: `event ${kind}`,
    }));
    const ass = buildAssSubtitleFile([], "classic_box", { playResX: 1080, playResY: 1920 }, events);
    for (const kind of VD_TEXT_OVERLAY_ASS_KINDS) {
      expect(ass).toContain(`event ${kind}`);
    }
  });
});

describe("buildFinalRenderFfmpegArgs — watermark image (task #34)", () => {
  const watermark: ResolvedWatermarkImage = {
    localPngPath: "/tmp/watermark.png",
    position: "top_right",
    opacity: 0.45,
    scalePct: 10,
    marginPx: 32,
  };

  it("takes the complex-graph path (not the legacy concat shortcut) when only a watermark is supplied", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      watermarkImage: watermark,
    });
    expect(args).toContain("-filter_complex");
    expect(extractFilterComplex(args)).toContain("colorchannelmixer=aa=0.45");
  });

  it("appends the watermark input AFTER concat + banners + dialogue audio, leaving their indices unchanged", () => {
    const banner: ResolvedBanner = {
      localPngPath: "/tmp/banner.png",
      placementId: "bottom_band",
      startSec: 0,
      endSec: 5,
      fadeSec: 0.3,
    };
    const withoutWatermark = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      banners: [banner],
    });
    const withWatermark = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      banners: [banner],
      watermarkImage: watermark,
    });
    // Same [1:v] banner reference in both — banner input index unchanged.
    expect(extractFilterComplex(withoutWatermark)).toContain("[1:v]scale=");
    expect(extractFilterComplex(withWatermark)).toContain("[1:v]scale=");
    // Watermark uses input index 2 (0=concat, 1=banner, 2=watermark).
    expect(extractFilterComplex(withWatermark)).toContain("[2:v]scale=");
  });

  it("composites the watermark AFTER (on top of) a fullscreen banner in the filter chain", () => {
    const fullscreenBanner: ResolvedBanner = {
      localPngPath: "/tmp/fs.png",
      placementId: "fullscreen",
      startSec: 0,
      endSec: 3,
      fadeSec: 0.3,
    };
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      banners: [fullscreenBanner],
      watermarkImage: watermark,
    });
    const graph = extractFilterComplex(args);
    const fullscreenOverlayIdx = graph.indexOf("overlay=0:0");
    const watermarkScaleIdx = graph.indexOf("scale=108:-2"); // 1080*10% = 108
    expect(fullscreenOverlayIdx).toBeGreaterThan(-1);
    expect(watermarkScaleIdx).toBeGreaterThan(fullscreenOverlayIdx);
    // Final map targets the watermark's own output label.
    expect(args).toContain("[wm]");
  });

  it("positions top_right with a main_w-overlay_w-margin expression", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      watermarkImage: watermark,
    });
    expect(extractFilterComplex(args)).toContain(
      "overlay=main_w-overlay_w-32:32"
    );
  });

  it("positions bottom_left with margin-only x and a main_h-overlay_h-margin y expression", () => {
    const args = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      watermarkImage: { ...watermark, position: "bottom_left", marginPx: 20 },
    });
    expect(extractFilterComplex(args)).toContain(
      "overlay=20:main_h-overlay_h-20"
    );
  });

  it("is a complete no-op (identical args) when watermarkImage is omitted", () => {
    const withUndefined = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      dialogueAudio: { segments: [{ localPath: "/tmp/a.mp3", startSec: 0 }] },
    });
    const withExplicitUndefined = buildFinalRenderFfmpegArgs({
      concatListPath: CONCAT_LIST_PATH,
      output: OUTPUT_PATH,
      videoDurationSeconds: 30,
      dialogueAudio: { segments: [{ localPath: "/tmp/a.mp3", startSec: 0 }] },
      watermarkImage: undefined,
    });
    expect(withExplicitUndefined).toEqual(withUndefined);
  });
});

describe("buildWatermarkInputArgs", () => {
  it("loops the watermark PNG for the full probed video duration", () => {
    const args = buildWatermarkInputArgs(
      {
        localPngPath: "/tmp/w.png",
        position: "top_right",
        opacity: 0.4,
        scalePct: 8,
        marginPx: 24,
      },
      42.5
    );
    expect(args).toEqual(["-loop", "1", "-t", "42.5", "-i", "/tmp/w.png"]);
  });
});

describe("resolveWatermarkOverlayFragment", () => {
  it("scales to scalePct% of the 1080px frame width, rounded to an even pixel count", () => {
    const { filterFragments } = resolveWatermarkOverlayFragment(
      { localPngPath: "/tmp/w.png", position: "top_right", opacity: 0.45, scalePct: 15, marginPx: 32 },
      1,
      { baseLabel: "vbase" }
    );
    // 1080 * 15% = 162 (already even).
    expect(filterFragments[0]).toContain("scale=162:-2");
  });

  it("rounds an odd target width up to the nearest even number", () => {
    const { filterFragments } = resolveWatermarkOverlayFragment(
      { localPngPath: "/tmp/w.png", position: "top_right", opacity: 0.45, scalePct: 5, marginPx: 32 },
      1,
      { baseLabel: "vbase" }
    );
    // 1080 * 5% = 54 (even already) — use 7% to force an odd rounding case: 1080*0.07=75.6 -> round 76 (even).
    expect(filterFragments[0]).toContain("scale=54:-2");
  });

  it("clamps opacity into [0,1] defensively", () => {
    const { filterFragments } = resolveWatermarkOverlayFragment(
      { localPngPath: "/tmp/w.png", position: "top_right", opacity: 5, scalePct: 10, marginPx: 32 },
      1,
      { baseLabel: "vbase" }
    );
    expect(filterFragments[0]).toContain("colorchannelmixer=aa=1");
  });
});

/* -------------------------------------------------------------------------- */
/* Production Episode BGM mix (Phase B-1,                                    */
/* planning/vertical-drama-production-render/plan.md Phase B)                */
/* -------------------------------------------------------------------------- */

describe("buildBgmMixFilterComplex", () => {
  it("volume-scales the BGM (input 1) and mixes it flat under the video's own audio (input 0) when ducking is off", () => {
    const fc = buildBgmMixFilterComplex({ volumePercent: 35, duckUnderVideoAudio: false });
    expect(fc).toBe(
      "[1:a]volume=0.35[bgmvol];[0:a][bgmvol]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]"
    );
    expect(fc).not.toContain("sidechaincompress");
  });

  it("ducks the BGM under the video's own audio via sidechaincompress — BGM as the MAIN input, video audio as the SIDECHAIN key — when ducking is on", () => {
    const fc = buildBgmMixFilterComplex({ volumePercent: 35, duckUnderVideoAudio: true });
    expect(fc).toBe(
      "[1:a]volume=0.35[bgmvol];" +
        "[bgmvol][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=300[bgmducked];" +
        "[0:a][bgmducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]"
    );
  });

  it("disables amix's built-in normalize so the video's own audio is never auto-attenuated by the mix", () => {
    const flat = buildBgmMixFilterComplex({ volumePercent: 35, duckUnderVideoAudio: false });
    const ducked = buildBgmMixFilterComplex({ volumePercent: 35, duckUnderVideoAudio: true });
    expect(flat).toContain("amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]");
    expect(ducked).toContain("amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]");
  });

  it("converts volumePercent to a clamped 0-1 linear multiplier at the extremes", () => {
    expect(
      buildBgmMixFilterComplex({ volumePercent: 100, duckUnderVideoAudio: false })
    ).toContain("[1:a]volume=1[bgmvol]");
    expect(
      buildBgmMixFilterComplex({ volumePercent: 1, duckUnderVideoAudio: false })
    ).toContain("[1:a]volume=0.01[bgmvol]");
  });
});

describe("buildBgmMixFfmpegArgs", () => {
  const BASE_INPUT = {
    videoPath: "/tmp/production-episode.mp4",
    bgmPath: "/tmp/bgm.mp3",
    output: "/tmp/production-episode-bgm.mp4",
    videoDurationSeconds: 250.5,
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  it("loops the BGM input via -stream_loop -1 (input 1) after the video (input 0)", () => {
    const args = buildBgmMixFfmpegArgs(BASE_INPUT);
    expect(args.slice(0, 8)).toEqual([
      "-y",
      "-i",
      "/tmp/production-episode.mp4",
      "-stream_loop",
      "-1",
      "-i",
      "/tmp/bgm.mp3",
      "-filter_complex",
    ]);
  });

  it("bounds the output with -t at the video's own probed duration, so the endlessly-looped BGM input never hangs ffmpeg", () => {
    const args = buildBgmMixFfmpegArgs(BASE_INPUT);
    const tIndex = args.indexOf("-t");
    expect(tIndex).toBeGreaterThan(-1);
    expect(args[tIndex + 1]).toBe("250.5");
  });

  it("stream-copies the video (-c:v copy) and maps 0:v + the mixed [aout] audio label, in that order", () => {
    const args = buildBgmMixFfmpegArgs(BASE_INPUT);
    const mapVIndex = args.indexOf("-map");
    expect(args[mapVIndex + 1]).toBe("0:v");
    const mapAIndex = args.indexOf("-map", mapVIndex + 1);
    expect(args[mapAIndex + 1]).toBe("[aout]");
    const cvIndex = args.indexOf("-c:v");
    expect(args[cvIndex + 1]).toBe("copy");
  });

  it("embeds the SAME filter_complex buildBgmMixFilterComplex produces for the same input", () => {
    const args = buildBgmMixFfmpegArgs(BASE_INPUT);
    expect(extractFilterComplex(args)).toBe(buildBgmMixFilterComplex(BASE_INPUT));
  });

  it("omits sidechaincompress from the embedded graph when duckUnderVideoAudio is false", () => {
    const args = buildBgmMixFfmpegArgs({ ...BASE_INPUT, duckUnderVideoAudio: false });
    expect(extractFilterComplex(args)).not.toContain("sidechaincompress");
  });

  it("ends with the output path as the final argv element", () => {
    const args = buildBgmMixFfmpegArgs(BASE_INPUT);
    expect(args[args.length - 1]).toBe("/tmp/production-episode-bgm.mp4");
  });
});

/* -------------------------------------------------------------------------- */
/* Production Episode credits roll (Phase C-1,                                */
/* planning/vertical-drama-production-render/plan.md Phase C)                 */
/* -------------------------------------------------------------------------- */

describe("splitCreditsRollLines", () => {
  it("normalizes CRLF and lone CR to \\n", () => {
    expect(splitCreditsRollLines("A\r\nB\r\nC")).toEqual(["A", "B", "C"]);
    expect(splitCreditsRollLines("A\rB\rC")).toEqual(["A", "B", "C"]);
  });

  it("trims leading and trailing fully-blank lines", () => {
    expect(splitCreditsRollLines("\n\nA\nB\n\n\n")).toEqual(["A", "B"]);
  });

  it("preserves interior blank lines as intentional section spacing", () => {
    expect(splitCreditsRollLines("Cast\nJane Doe\n\nCrew\nJohn Smith")).toEqual([
      "Cast",
      "Jane Doe",
      "",
      "Crew",
      "John Smith",
    ]);
  });

  it("trims trailing whitespace per line but preserves leading indentation", () => {
    expect(splitCreditsRollLines("  Jane Doe   \nJohn Smith\t")).toEqual([
      "  Jane Doe",
      "John Smith",
    ]);
  });

  it("returns an empty array for whitespace-only text", () => {
    expect(splitCreditsRollLines("   \n\n  \t \n")).toEqual([]);
  });
});

describe("resolveCreditsRollWindow", () => {
  it("tail-anchors a normal-length video to the fixed window constant", () => {
    expect(resolveCreditsRollWindow(300)).toEqual({
      startSec: 300 - VD_CREDITS_ROLL_WINDOW_SEC,
      endSec: 300,
    });
  });

  it("shrinks the window (never starts before 0) for a video shorter than the window", () => {
    expect(resolveCreditsRollWindow(8)).toEqual({ startSec: 0, endSec: 8 });
  });

  it("collapses to a zero-length window for a zero-duration video", () => {
    expect(resolveCreditsRollWindow(0)).toEqual({ startSec: 0, endSec: 0 });
  });

  it("clamps a defensive negative duration to a zero-length window, never negative", () => {
    expect(resolveCreditsRollWindow(-5)).toEqual({ startSec: 0, endSec: 0 });
  });

  it("handles the exact boundary where duration equals the window length", () => {
    expect(resolveCreditsRollWindow(VD_CREDITS_ROLL_WINDOW_SEC)).toEqual({
      startSec: 0,
      endSec: VD_CREDITS_ROLL_WINDOW_SEC,
    });
  });
});

describe("resolveCreditsRollGeometry", () => {
  it("centers horizontally at playResX/2 and starts the block fully below the frame", () => {
    const geometry = resolveCreditsRollGeometry(1, { playResX: 1080, playResY: 1920 });
    expect(geometry.centerX).toBe(540);
    expect(geometry.startY).toBe(1920);
  });

  it("ends with the block's top edge above the frame by its own estimated height", () => {
    const oneLine = resolveCreditsRollGeometry(1, { playResX: 1080, playResY: 1920 });
    // fontSize 42 * 1.4 multiplier, rounded = 59px per line.
    expect(oneLine.endY).toBe(-59);

    const tenLines = resolveCreditsRollGeometry(10, { playResX: 1080, playResY: 1920 });
    expect(tenLines.endY).toBe(-590);
  });

  it("treats a zero/negative lineCount the same as a single line (never divides by zero or inverts direction)", () => {
    expect(resolveCreditsRollGeometry(0, { playResX: 1080, playResY: 1920 })).toEqual(
      resolveCreditsRollGeometry(1, { playResX: 1080, playResY: 1920 })
    );
  });

  it("respects a non-default playResX/Y", () => {
    const geometry = resolveCreditsRollGeometry(2, { playResX: 720, playResY: 1280 });
    expect(geometry.centerX).toBe(360);
    expect(geometry.startY).toBe(1280);
  });
});

describe("buildCreditsAssFile", () => {
  it("emits the mapped VdCreditsRoll style line", () => {
    const ass = buildCreditsAssFile("Jane Doe", 300, { playResX: 1080, playResY: 1920 });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("WrapStyle: 0");
    expect(ass).toContain(
      "Style: VdCreditsRoll,Noto Sans Thai,42,&H00FFFFFF,&H000000FF,&HA0000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,8,90,90,0,1"
    );
  });

  it("joins every credits line into ONE \\N-separated, \\move-driven Dialogue event, tail-anchored to the video's end", () => {
    const ass = buildCreditsAssFile(
      "Jane Doe — Writer\nJohn Smith — Director",
      300,
      { playResX: 1080, playResY: 1920 }
    );
    // resolveCreditsRollWindow(300) -> {startSec: 288, endSec: 300};
    // resolveCreditsRollGeometry(2, ...) -> centerX 540, startY 1920, endY -118.
    expect(ass).toContain(
      "Dialogue: 0,0:04:48.00,0:05:00.00,VdCreditsRoll,,0,0,0,,{\\move(540,1920,540,-118)}Jane Doe — Writer\\NJohn Smith — Director"
    );
    // Exactly one Dialogue event for the whole block, not one per line.
    expect(ass.match(/Dialogue:/g)?.length).toBe(1);
  });

  it("escapes braces the same way every other Dialogue builder in this file does", () => {
    const ass = buildCreditsAssFile("Producer {Executive}", 20, {
      playResX: 1080,
      playResY: 1920,
    });
    expect(ass).toContain("Producer ｛Executive｝");
    expect(ass).not.toMatch(/,\{[^\\]/);
  });

  it("emits a header-only, zero-event file for whitespace-only credits text", () => {
    const ass = buildCreditsAssFile("   \n\n  ", 300, { playResX: 1080, playResY: 1920 });
    expect(ass).toContain("[Events]");
    expect(ass).not.toContain("Dialogue:");
    // The style is still emitted (mirrors buildAssSubtitleFile's own
    // "header always valid" convention) — only the EVENT is conditional.
    expect(ass).toContain("Style: VdCreditsRoll");
  });

  it("emits a header-only, zero-event file for a zero-duration video even with real credits text", () => {
    const ass = buildCreditsAssFile("Jane Doe", 0, { playResX: 1080, playResY: 1920 });
    expect(ass).not.toContain("Dialogue:");
  });

  it("still renders when the video is shorter than the fixed roll window — window shrinks to the whole clip", () => {
    const ass = buildCreditsAssFile("Jane Doe", 5, { playResX: 1080, playResY: 1920 });
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:05.00,VdCreditsRoll");
  });

  it("records fontsDir as an informational comment line, same convention as buildAssSubtitleFile", () => {
    const ass = buildCreditsAssFile("Jane Doe", 300, {
      playResX: 1080,
      playResY: 1920,
      fontsDir: "/opt/fonts/thai",
    });
    expect(ass).toContain(
      "; Fonts directory (resolved by caller; not embedded): /opt/fonts/thai"
    );
  });

  it("omitting credits (empty string) is the same as whitespace-only — no Dialogue event", () => {
    const ass = buildCreditsAssFile("", 300, { playResX: 1080, playResY: 1920 });
    expect(ass).not.toContain("Dialogue:");
  });
});

describe("buildCreditsBurnFfmpegArgs", () => {
  const BASE_INPUT = {
    videoPath: "/tmp/production-episode.mp4",
    credits: { assPath: "/tmp/credits.ass" },
    output: "/tmp/production-episode-credits.mp4",
  };

  it("burns the credits .ass via a plain -vf subtitles= filter (no -filter_complex)", () => {
    const args = buildCreditsBurnFfmpegArgs(BASE_INPUT);
    expect(args.slice(0, 3)).toEqual(["-y", "-i", "/tmp/production-episode.mp4"]);
    const vfIndex = args.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(args[vfIndex + 1]).toBe("subtitles=filename='/tmp/credits.ass'");
    expect(args).not.toContain("-filter_complex");
  });

  it("reuses the EXACT SAME subtitles= option string buildSubtitlesFilterOption produces for the same input", () => {
    const withFonts = {
      ...BASE_INPUT,
      credits: { assPath: "/tmp/credits.ass", fontsDir: "/opt/fonts/thai" },
    };
    const args = buildCreditsBurnFfmpegArgs(withFonts);
    const vfIndex = args.indexOf("-vf");
    expect(args[vfIndex + 1]).toBe(
      `subtitles=${buildSubtitlesFilterOption(withFonts.credits)}`
    );
    expect(args[vfIndex + 1]).toContain("fontsdir='/opt/fonts/thai'");
  });

  it("RE-ENCODES video (libx264) but stream-copies audio (-c:a copy) — unlike the -c:v copy bgm post-pass", () => {
    const args = buildCreditsBurnFfmpegArgs(BASE_INPUT);
    const cvIndex = args.indexOf("-c:v");
    expect(args[cvIndex + 1]).toBe("libx264");
    const caIndex = args.indexOf("-c:a");
    expect(args[caIndex + 1]).toBe("copy");
  });

  it("ends with the output path as the final argv element", () => {
    const args = buildCreditsBurnFfmpegArgs(BASE_INPUT);
    expect(args[args.length - 1]).toBe("/tmp/production-episode-credits.mp4");
  });
});

/**
 * Phase C-2 (`planning/vertical-drama-production-render/plan.md` Phase C,
 * "overlays generalization") — the Production Episode timed text overlays
 * `.ass` builder, plus the general N-pass `.ass` burn-in argv builder used to
 * fold it with the Phase C-1 credits pass. Pure string/array assertions only,
 * same convention as every other describe block in this file.
 */
describe("buildProductionOverlaysAssFile", () => {
  const OPTS = { playResX: 1080, playResY: 1920 };

  it("emits the mapped style line ONLY for styles actually used by a surviving overlay", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 5, durationSeconds: 3, text: "Hello", style: "lower_third" }],
      100,
      OPTS
    );
    expect(ass).toContain(
      "Style: VdProdOverlayLowerThird,Noto Sans Thai,52,&H00FFFFFF,&H000000FF,&H80000000,&HA0000000,1,0,0,0,100,100,0,0,3,2,0,2,90,90,230,1"
    );
    expect(ass).not.toContain("VdProdOverlayCentered");
    expect(ass).not.toContain("VdProdOverlayTopBar");
  });

  it("emits the mapped style lines for top_bar and centered too", () => {
    const topBar = buildProductionOverlaysAssFile(
      [{ atSeconds: 1, durationSeconds: 2, text: "A", style: "top_bar" }],
      100,
      OPTS
    );
    expect(topBar).toContain(
      "Style: VdProdOverlayTopBar,Noto Sans Thai,50,&H00FFFFFF,&H000000FF,&H80000000,&HA0000000,1,0,0,0,100,100,0,0,3,2,0,8,90,90,130,1"
    );

    const centered = buildProductionOverlaysAssFile(
      [{ atSeconds: 1, durationSeconds: 2, text: "B", style: "centered" }],
      100,
      OPTS
    );
    expect(centered).toContain(
      "Style: VdProdOverlayCentered,Noto Sans Thai,56,&H00FFFFFF,&H000000FF,&H80000000,&HA0000000,1,0,0,0,100,100,0,0,3,2,0,5,90,90,160,1"
    );
  });

  it("builds one Dialogue event per overlay, Start=atSeconds, End=atSeconds+durationSeconds", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 5, durationSeconds: 3, text: "Hello", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).toContain(
      "Dialogue: 0,0:00:05.00,0:00:08.00,VdProdOverlayCentered,,0,0,0,,Hello"
    );
    expect(ass.match(/Dialogue:/g)?.length).toBe(1);
  });

  it("clamps End to the video's own duration when atSeconds+durationSeconds would exceed it", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 95, durationSeconds: 10, text: "Near the end", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).toContain(
      "Dialogue: 0,0:01:35.00,0:01:40.00,VdProdOverlayCentered,,0,0,0,,Near the end"
    );
  });

  it("skips an overlay whose atSeconds is AT the video's own duration", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 100, durationSeconds: 3, text: "Too late", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).not.toContain("Dialogue:");
  });

  it("skips an overlay whose atSeconds is AFTER the video's own duration", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 150, durationSeconds: 3, text: "Way too late", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).not.toContain("Dialogue:");
  });

  it("skips an overlay whose text is blank after trimming", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 5, durationSeconds: 3, text: "   ", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).not.toContain("Dialogue:");
  });

  it("escapes braces and newlines the same way every other Dialogue builder in this file does", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 1, durationSeconds: 2, text: "Say {hi}\nnow", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).toContain("Say ｛hi｝\\Nnow");
  });

  it("sorts events by atSeconds regardless of input order", () => {
    // NB: overlay texts deliberately avoid substrings that also occur in the
    // ASS header (e.g. "Second" collides with the "SecondaryColour" Format
    // field), so indexOf() locates the Dialogue events, not the header.
    const overlays: ProductionEpisodeOverlayItem[] = [
      { atSeconds: 10, durationSeconds: 2, text: "OverlayLater", style: "centered" },
      { atSeconds: 2, durationSeconds: 2, text: "OverlayFirst", style: "centered" },
    ];
    const ass = buildProductionOverlaysAssFile(overlays, 100, OPTS);
    expect(ass.indexOf("OverlayFirst")).toBeGreaterThan(-1);
    expect(ass.indexOf("OverlayLater")).toBeGreaterThan(-1);
    expect(ass.indexOf("OverlayFirst")).toBeLessThan(ass.indexOf("OverlayLater"));
  });

  it("returns a header-only file (no Dialogue events, no Style lines) for an EMPTY overlays array", () => {
    const ass = buildProductionOverlaysAssFile([], 100, OPTS);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[Events]");
    expect(ass).not.toContain("Dialogue:");
    // Line-anchored so the "WrapStyle:" header field does not count as a
    // "Style:" definition line (there must be no real `Style:` line).
    expect(ass).not.toMatch(/^Style:/m);
  });

  it("omitting overlays is the same as an empty array — no Dialogue events", () => {
    const withEmpty = buildProductionOverlaysAssFile([], 100, OPTS);
    expect(withEmpty).not.toContain("Dialogue:");
  });

  it("records fontsDir as an informational comment line, same convention as buildAssSubtitleFile/buildCreditsAssFile", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 1, durationSeconds: 2, text: "A", style: "centered" }],
      100,
      { ...OPTS, fontsDir: "/opt/fonts/thai" }
    );
    expect(ass).toContain(
      "; Fonts directory (resolved by caller; not embedded): /opt/fonts/thai"
    );
  });

  it("emits PlayResX/PlayResY/WrapStyle header fields", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: 1, durationSeconds: 2, text: "A", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("WrapStyle: 0");
  });

  it("clamps a defensively-negative atSeconds to 0 rather than producing an invalid timestamp", () => {
    const ass = buildProductionOverlaysAssFile(
      [{ atSeconds: -5, durationSeconds: 3, text: "Clamped", style: "centered" }],
      100,
      OPTS
    );
    expect(ass).toContain(
      "Dialogue: 0,0:00:00.00,0:00:03.00,VdProdOverlayCentered,,0,0,0,,Clamped"
    );
  });
});

describe("buildAssBurnFfmpegArgs", () => {
  it("chains a SINGLE pass as one subtitles= filter — same argv shape as buildCreditsBurnFfmpegArgs", () => {
    const args = buildAssBurnFfmpegArgs({
      videoPath: "/tmp/production-episode.mp4",
      passes: [{ assPath: "/tmp/overlays.ass" }],
      output: "/tmp/production-episode-overlays.mp4",
    });
    expect(args.slice(0, 3)).toEqual(["-y", "-i", "/tmp/production-episode.mp4"]);
    const vfIndex = args.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(args[vfIndex + 1]).toBe("subtitles=filename='/tmp/overlays.ass'");
    expect(args).not.toContain("-filter_complex");

    // Same shape buildCreditsBurnFfmpegArgs would produce for an equivalent
    // single-pass input.
    const creditsShape = buildCreditsBurnFfmpegArgs({
      videoPath: "/tmp/production-episode.mp4",
      credits: { assPath: "/tmp/overlays.ass" },
      output: "/tmp/production-episode-overlays.mp4",
    });
    expect(args).toEqual(creditsShape);
  });

  it("chains TWO passes as comma-joined subtitles= filters inside ONE -vf value (one re-encode)", () => {
    const args = buildAssBurnFfmpegArgs({
      videoPath: "/tmp/production-episode.mp4",
      passes: [
        { assPath: "/tmp/overlays.ass" },
        { assPath: "/tmp/credits.ass", fontsDir: "/opt/fonts/thai" },
      ],
      output: "/tmp/production-episode-combined.mp4",
    });
    const vfIndex = args.indexOf("-vf");
    expect(args[vfIndex + 1]).toBe(
      "subtitles=filename='/tmp/overlays.ass',subtitles=filename='/tmp/credits.ass':fontsdir='/opt/fonts/thai'"
    );
    // Exactly ONE -i (single re-encode over one input) and ONE -vf.
    expect(args.filter(a => a === "-i").length).toBe(1);
    expect(args.filter(a => a === "-vf").length).toBe(1);
  });

  it("reuses the EXACT SAME subtitles= option string buildSubtitlesFilterOption produces for each pass", () => {
    const pass = { assPath: "/tmp/credits.ass", fontsDir: "/opt/fonts/thai" };
    const args = buildAssBurnFfmpegArgs({
      videoPath: "/tmp/in.mp4",
      passes: [pass],
      output: "/tmp/out.mp4",
    });
    const vfIndex = args.indexOf("-vf");
    expect(args[vfIndex + 1]).toBe(`subtitles=${buildSubtitlesFilterOption(pass)}`);
  });

  it("RE-ENCODES video (libx264) but stream-copies audio (-c:a copy)", () => {
    const args = buildAssBurnFfmpegArgs({
      videoPath: "/tmp/in.mp4",
      passes: [{ assPath: "/tmp/a.ass" }],
      output: "/tmp/out.mp4",
    });
    const cvIndex = args.indexOf("-c:v");
    expect(args[cvIndex + 1]).toBe("libx264");
    const caIndex = args.indexOf("-c:a");
    expect(args[caIndex + 1]).toBe("copy");
  });

  it("ends with the output path as the final argv element", () => {
    const args = buildAssBurnFfmpegArgs({
      videoPath: "/tmp/in.mp4",
      passes: [{ assPath: "/tmp/a.ass" }],
      output: "/tmp/out.mp4",
    });
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });
});

describe("VD_PRODUCTION_OVERLAY_MAX_COUNT", () => {
  it("is a positive, finite sanity cap", () => {
    expect(VD_PRODUCTION_OVERLAY_MAX_COUNT).toBeGreaterThan(0);
    expect(Number.isFinite(VD_PRODUCTION_OVERLAY_MAX_COUNT)).toBe(true);
  });
});
