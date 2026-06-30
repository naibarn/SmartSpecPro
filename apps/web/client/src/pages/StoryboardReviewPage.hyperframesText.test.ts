import { describe, expect, it } from "vitest";

import { __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS } from "./StoryboardReviewPage";

describe("StoryboardReviewPage HyperFrames text helpers", () => {
  it("does not seed per-shot overlay text from video-generation prompts", () => {
    const overlay = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildHyperframesShotOverlayDraft({
      preset: "premium_product_hero",
      productContext: null,
      productTitle: "BENO เครื่องชงกาแฟ PRO-FLEX",
      description: "บด ชง ตีฟองในเครื่องเดียว",
      hookText: "ชงกาแฟหอมเข้ม แบบโปรในเครื่องเดียว",
      supportingText: "BENO PRO-FLEX บด ชง ตีฟองในเครื่องเดียว",
      clip: {
        id: "shot-3",
        prompt:
          'Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Use @Image2 as stop frame. Action: เทเมล็ดกาแฟลงเครื่อง. Dialogue: Presenter พูดเป็นภาษาไทยว่า "อีกหนึ่งความสะดวก ไม่ต้องวุ่นวายมีเครื่องตีฟองนมต่างหาก"',
      } as any,
      index: 2,
      total: 6,
    });

    expect(overlay).not.toContain("Create a 5-second cinematic video");
    expect(overlay).not.toContain("Use @Image1");
    expect(overlay).not.toContain("Use @Image2");
    expect(overlay.trim().length).toBeGreaterThan(0);
  });

  it("removes stale video prompt lines from saved per-shot overlay text", () => {
    const sanitized = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.sanitizeHyperframesShotTextMap({
      "shot-1": "ชงกาแฟหอมเข้ม\nCreate a 5-second cinematic video",
      "shot-2": "Use @Image1 as start frame\nSmart display ใช้ง่าย",
    });

    expect(sanitized["shot-1"]).toBe("ชงกาแฟหอมเข้ม");
    expect(sanitized["shot-2"]).toBe("Smart display ใช้ง่าย");
  });

  it("does not use video prompt boilerplate as a subtitle fallback", () => {
    const subtitle = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.defaultHyperframesSubtitleText({
      id: "shot-4",
      prompt: "Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Action: close-up product demo.",
    } as any);

    expect(subtitle).toBe("");
  });

  it("builds a clean subtitle map from shot voice lines only", () => {
    const map = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildHyperframesSubtitleTextMapFromClips([
      {
        id: "shot-1",
        prompt: 'Dialogue: Presenter พูดเป็นภาษาไทยว่า "แก้วแรกก็ได้ครีม่านุ่มสวย"',
      },
      {
        id: "shot-2",
        prompt: "Create a 5-second cinematic video. Scene: Use @Image1 as start frame.",
      },
    ] as any);

    expect(map["shot-1"]).toContain("แก้วแรกก็ได้ครีม่านุ่มสวย");
    expect(map["shot-2"]).toBe("");
  });

  it("resolves render overlay lines from the same preset fallback used by final composite", () => {
    const lines = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.resolveHyperframesFinalShotOverlayLines({
      textMode: "hook_and_per_shot",
      shotIndex: 0,
      overlayPreset: "badge_cascade",
      productContext: null,
      productTitle: "Manual Storyboard Project",
      productDescription: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
      storyboardName: "Manual Storyboard Project",
      hookText: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
      supportingText: "การเลี้ยงดูมีผลอย่างมาก",
      clip: {
        id: "shot-1",
        prompt: 'Dialogue: Presenter พูดเป็นภาษาไทยว่า "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก"',
      } as any,
      clipCount: 8,
      savedOverlayText: "",
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("พัฒนาการเด็ก");
    expect(lines.join("\n")).not.toContain("Dialogue:");
  });

  it("does not resolve per-shot overlay lines when the selected text mode is hook-only", () => {
    const lines = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.resolveHyperframesFinalShotOverlayLines({
      textMode: "hook_only",
      shotIndex: 1,
      overlayPreset: "badge_cascade",
      productContext: null,
      productTitle: "Manual Storyboard Project",
      productDescription: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
      storyboardName: "Manual Storyboard Project",
      hookText: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
      supportingText: "การเลี้ยงดูมีผลอย่างมาก",
      clip: {
        id: "shot-2",
        prompt: 'Dialogue: Presenter พูดเป็นภาษาไทยว่า "เพื่อพัฒนาการลูกน้อย"',
      } as any,
      clipCount: 8,
      savedOverlayText: "เพื่อพัฒนาการลูกน้อย",
    });

    expect(lines).toEqual([]);
  });

  it("builds preview-match capture payloads from the same final preview fields", () => {
    const payload =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildPreviewMatchPayloadPreview({
        renderPrompt: "Final preview prompt",
        overlayPreset: "badge_cascade",
        subtitlePreset: "classic_box",
        subtitleFontSizePx: 34,
        textMode: "hook_and_per_shot",
        textMotionPreset: "slide_right_to_left",
        fontFamily: "Prompt",
        hookText: "คุณแม่ทราบกันไหม",
        supportingText: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
        audioPackPresetId: "native",
        musicPresetId: "",
        sfxPresetIds: [],
        preserveNativeAudio: true,
        syntheticAudioFallback: true,
        burnInSubtitles: true,
        durationSeconds: 4,
        shots: [
          {
            id: "shot-1",
            prompt: "shot prompt",
            overlayText: "overlay",
            subtitleText: "display only",
            startSec: 0,
            endSec: 4,
            mediaStartSec: 0,
            sourceClipId: "clip-1",
            sourceVideoRef: "storage://clip-1.mp4",
            overlayLines: ["overlay"],
            subtitleCues: [
              {
                startSec: 0.5,
                endSec: 2.5,
                text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก",
              },
            ],
            durationSeconds: 4,
            overlayPreset: "badge_cascade",
            animationPreset: "smooth_reveal",
            transition: "fade",
            textMotionPreset: "slide_right_to_left",
          },
        ],
      });

    expect(payload.engine).toBe("preview_match_browser_capture");
    expect(payload.shots[0].subtitleCues).toEqual([
      {
        startSec: 0.5,
        endSec: 2.5,
        text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก",
      },
    ]);
    expect(
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.computePreviewMatchCompositionHash(payload),
    ).toMatch(/^pmc_/);
    expect(
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.computePreviewMatchTimelineHash(payload),
    ).toMatch(/^pmt_/);
  });

  it("normalizes long source clips to timeline shot duration in final payload preview", () => {
    const payload = JSON.parse(
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildHyperframesFinalPayloadPreview({
        renderPrompt: "Final preview prompt",
        overlayPreset: "badge_cascade",
        subtitlePreset: "classic_box",
        subtitleFontSizePx: 34,
        textMode: "hook_and_per_shot",
        textMotionPreset: "slide_right_to_left",
        fontFamily: "Prompt",
        hookText: "คุณแม่ทราบกันไหม",
        supportingText: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
        audioPackPresetId: "native",
        musicPresetId: "",
        sfxPresetIds: [],
        preserveNativeAudio: true,
        syntheticAudioFallback: true,
        burnInSubtitles: true,
        durationSeconds: 238.3,
        shots: [
          {
            id: "shot-1",
            prompt: "shot prompt",
            overlayText: "overlay",
            subtitleText: "display only",
            startSec: 0,
            endSec: 30,
            mediaStartSec: 0,
            sourceClipId: "clip-1",
            sourceVideoRef: "storage://clip-1.mp4",
            overlayLines: ["overlay"],
            subtitleCues: [],
            durationSeconds: 238.3,
            overlayPreset: "badge_cascade",
            animationPreset: "smooth_reveal",
            transition: "fade",
            textMotionPreset: "slide_right_to_left",
          },
        ],
      }),
    );

    expect(payload.output.durationSeconds).toBe(238.3);
    expect(payload.shots[0].durationSeconds).toBe(30);
  });

  it("splits an imported long source video using the real source duration", () => {
    const plan =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.splitHyperframesFinalSourceClips([
        {
          id: "manual-shot-1-1782006453374-k5236d",
          prompt: "Shot 1: ลากวิดีโอหรือภาพมาวาง แล้วเขียน prompt เอง",
          url: "/api/storage/files/media-jobs/assets/source.mp4",
          model: "วิดีโอที่อัปโหลด",
          durationSeconds: 238.28,
          mediaType: "video",
        },
      ] as any);

    expect(plan.originalDurationSeconds).toBe(238.3);
    expect(plan.plannedDurationSeconds).toBe(238.3);
    expect(plan.clips).toHaveLength(8);
    expect(plan.clips.map((clip) => clip.durationSeconds)).toEqual([
      30,
      30,
      30,
      30,
      30,
      30,
      30,
      28.3,
    ]);
    expect(plan.clips[7].mediaStartSec).toBe(210);
  });

  it("applies per-shot source trim before splitting source clips", () => {
    const plan =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.splitHyperframesFinalSourceClips([
        {
          id: "trimmed-source-shot",
          prompt: "Trimmed source",
          url: "/api/storage/files/media-jobs/assets/source.mp4",
          model: "วิดีโอที่อัปโหลด",
          durationSeconds: 90,
          mediaType: "video",
          generationExtraParams: {
            sourceTrim: {
              inSec: 12,
              outSec: 46,
              sourceDurationSec: 90,
              disabledRanges: [],
            },
          },
        },
      ] as any);

    expect(plan.originalDurationSeconds).toBe(90);
    expect(plan.plannedDurationSeconds).toBe(34);
    expect(plan.wasTrimmed).toBe(true);
    expect(plan.wasLimitedByFinalCap).toBe(false);
    expect(plan.usedSourceTrim).toBe(true);
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.map((clip) => clip.mediaStartSec)).toEqual([12, 42]);
    expect(plan.clips.map((clip) => clip.durationSeconds)).toEqual([30, 4]);
  });

  it("skips disabled middle ranges before building HyperFrames source clips", () => {
    const plan =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.splitHyperframesFinalSourceClips([
        {
          id: "middle-cut-source-shot",
          prompt: "Middle cut source",
          url: "/api/storage/files/media-jobs/assets/source.mp4",
          model: "วิดีโอที่อัปโหลด",
          durationSeconds: 90,
          mediaType: "video",
          generationExtraParams: {
            sourceTrim: {
              inSec: 0,
              outSec: 30,
              sourceDurationSec: 90,
              disabledRanges: [{ startSec: 10, endSec: 14 }],
            },
          },
        },
      ] as any);

    expect(plan.originalDurationSeconds).toBe(90);
    expect(plan.plannedDurationSeconds).toBe(26);
    expect(plan.wasSplit).toBe(true);
    expect(plan.wasTrimmed).toBe(true);
    expect(plan.usedSourceTrim).toBe(true);
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.map((clip) => clip.mediaStartSec)).toEqual([0, 14]);
    expect(plan.clips.map((clip) => clip.durationSeconds)).toEqual([10, 16]);
    expect(plan.clips.map((clip) => clip.segmentCount)).toEqual([2, 2]);
    expect(plan.clips.map((clip) => clip.segmentIndex)).toEqual([0, 1]);
    expect(plan.clips.map((clip) => clip.prompt)).toEqual([
      "Middle cut source (1/2)",
      "Middle cut source (2/2)",
    ]);
  });

  it("uses ready derived trim clips as natural source clips before HyperFrames split planning", () => {
    const plan =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.splitHyperframesFinalSourceClips([
        {
          id: "derived-middle-cut-source-shot",
          prompt: "Derived middle cut source",
          url: "/api/storage/files/media-jobs/assets/source.mp4",
          model: "วิดีโอที่อัปโหลด",
          durationSeconds: 90,
          mediaType: "video",
          generationExtraParams: {
            sourceTrim: {
              inSec: 0,
              outSec: 30,
              sourceDurationSec: 90,
              disabledRanges: [{ startSec: 10, endSec: 14 }],
            },
            sourceTrimDerived: {
              status: "ready",
              url: "/api/storage/files/media-jobs/assets/source-trimmed.mp4",
              durationSeconds: 26,
              sourceUrl: "/api/storage/files/media-jobs/assets/source.mp4",
            },
          },
        },
      ] as any);

    expect(plan.originalDurationSeconds).toBe(90);
    expect(plan.plannedDurationSeconds).toBe(26);
    expect(plan.wasSplit).toBe(false);
    expect(plan.wasTrimmed).toBe(true);
    expect(plan.usedSourceTrim).toBe(true);
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0]?.url).toBe("/api/storage/files/media-jobs/assets/source-trimmed.mp4");
    expect(plan.clips[0]?.mediaStartSec).toBe(0);
    expect(plan.clips[0]?.durationSeconds).toBe(26);
    expect(plan.clips[0]?.derivedFromUrl).toBe("/api/storage/files/media-jobs/assets/source.mp4");
  });

  it("prefers raw source task duration over the clamped review-task fallback", () => {
    const duration =
      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.resolveHyperframesSourceClipDurationSeconds(
        {
          id: "manual-shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Manual source",
          model: "วิดีโอที่อัปโหลด",
          durationSeconds: 238.28,
          createdAt: 1,
          updatedAt: 1,
        } as any,
        60,
      );

    expect(duration).toBe(238.28);
  });
});
