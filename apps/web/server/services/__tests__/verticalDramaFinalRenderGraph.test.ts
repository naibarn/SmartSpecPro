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
  buildAssSubtitleFile,
  buildBannerInputArgs,
  buildFinalRenderFfmpegArgs,
  escapeFfmpegFilterPath,
  resolveBannerOverlayChain,
  validateResolvedBanners,
  type ResolvedBanner,
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
