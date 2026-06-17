import { describe, expect, it } from "vitest";

import {
  classifyStoryboardReviewHyperframesFinalCompositeState,
  getStoryboardReviewHyperframesFinalCompositeState,
  mergeStoryboardReviewHyperframesFinalCompositeState,
} from "../storyboardReviewState";

const baseInput = {
  storyboardReviewProjectId: 55,
  productId: "mp_65ec0a79424b174a6108fcdc1198b839",
  runId: "mar_29c7e2346ec77b3d984aaa75d7245ed9",
  expectedRevision: 0,
  patch: {
    textVariables: {
      hookText: "พร้อมส่ง ของเล่นตักทราย",
      supportingText: "ของเล่นสีสด เล่นน้ำ เล่นทราย",
      audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
      musicPresetId: "hf_audio_music_upbeat_ecommerce_social_v1",
      sfxPresetIds: ["hf_audio_sfx_whoosh_scene_transition_v1"],
      preserveNativeAudio: true,
      syntheticAudioFallback: true,
      burnInSubtitles: true,
      subtitleFontSizePx: 28,
    },
    shotMediaAssignments: [
      {
        storyboardReviewProjectId: 55,
        shotId: "shot_1",
        shotIndex: 0,
        source: "media_library" as const,
        mediaKind: "video" as const,
        libraryItemId: "lib_1",
        sourceUrl: "/api/storage/files/media-jobs/assets/clip-1.mp4",
        contentHash: "hash_clip_123",
        assignedByUserId: 109,
        assignedAt: "2026-06-12T00:00:00.000Z",
      },
    ],
  },
};

describe("Storyboard Review HyperFrames final composite state", () => {
  it("creates server-owned state under reviewData.hyperframesFinalComposite", () => {
    const result = mergeStoryboardReviewHyperframesFinalCompositeState({
      reviewData: {
        marketplaceContext: { productId: baseInput.productId },
        autoReviewRunId: baseInput.runId,
      },
      input: baseInput,
      nowIso: "2026-06-12T00:00:00.000Z",
    });

    expect(result.state).toMatchObject({
      schemaVersion: 1,
      canonicalProductId: baseInput.productId,
      autoReviewRunId: baseInput.runId,
      storyboardReviewProjectId: 55,
      revision: 1,
      textVariables: {
        hookText: "พร้อมส่ง ของเล่นตักทราย",
        musicPresetId: "hf_audio_music_upbeat_ecommerce_social_v1",
        preserveNativeAudio: true,
        burnInSubtitles: true,
        subtitleFontSizePx: 28,
      },
    });
    expect(getStoryboardReviewHyperframesFinalCompositeState(result.reviewData)).toEqual(
      result.state
    );
  });

  it("persists dragged MP4 assignments across a second revision", () => {
    const first = mergeStoryboardReviewHyperframesFinalCompositeState({
      reviewData: {},
      input: baseInput,
      nowIso: "2026-06-12T00:00:00.000Z",
    });
    const second = mergeStoryboardReviewHyperframesFinalCompositeState({
      reviewData: first.reviewData,
      input: {
        ...baseInput,
        expectedRevision: 1,
        patch: {
          textVariables: { hookText: "แก้ Hook แล้ว" },
        },
      },
      nowIso: "2026-06-12T00:05:00.000Z",
    });

    expect(second.state.revision).toBe(2);
    expect(second.state.shotMediaAssignments).toHaveLength(1);
    expect(second.state.shotMediaAssignments[0]?.sourceUrl).toContain("clip-1.mp4");
    expect(second.state.textVariables.hookText).toBe("แก้ Hook แล้ว");
    expect(second.state.textVariables.musicPresetId).toBe(
      "hf_audio_music_upbeat_ecommerce_social_v1"
    );
    expect(second.state.textVariables.sfxPresetIds).toEqual([
      "hf_audio_sfx_whoosh_scene_transition_v1",
    ]);
  });

  it("accepts the Storyboard Review final composite UI variables used before render", () => {
    const result = mergeStoryboardReviewHyperframesFinalCompositeState({
      reviewData: {},
      input: {
        ...baseInput,
        patch: {
          ...baseInput.patch,
          textVariables: {
            ...baseInput.patch.textVariables,
            sfxDrafts: [
              {
                id: "sfx_draft_1",
                presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
                target: "all",
                visualTrigger: "scene_cut",
                role: "transition_sfx",
                offsetSec: 0.2,
                durationSec: 0.22,
                volume: 0.22,
              },
            ],
            perShotText: { shot_1: "BENO PRO-FLEX ชงกาแฟง่ายขึ้น" },
            perShotSubtitles: { shot_1: "พอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
            perShotSubtitleVtt: { shot_1: "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nพอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
            perShotSubtitleSrt: { shot_1: "1\n00:00:00,000 --> 00:00:01,500\nพอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
            burnInSubtitles: false,
            perShotOverlayPreset: { shot_1: "hook_sequence" },
            perShotAnimationPreset: { shot_1: "glow_feature" },
            perShotTransition: { shot_1: "fade" },
            textMotionPreset: "slide_right_to_left",
            perShotTextMotionPreset: { shot_1: "pop_scale" },
          },
        },
      },
      nowIso: "2026-06-12T00:00:00.000Z",
    });

    expect(result.state.textVariables).toMatchObject({
      sfxDrafts: [
        expect.objectContaining({
          presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
          visualTrigger: "scene_cut",
        }),
      ],
      perShotOverlayPreset: { shot_1: "hook_sequence" },
      perShotAnimationPreset: { shot_1: "glow_feature" },
      perShotTransition: { shot_1: "fade" },
      textMotionPreset: "slide_right_to_left",
      perShotTextMotionPreset: { shot_1: "pop_scale" },
      perShotText: { shot_1: "BENO PRO-FLEX ชงกาแฟง่ายขึ้น" },
      perShotSubtitles: { shot_1: "พอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
      perShotSubtitleVtt: { shot_1: "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nพอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
      perShotSubtitleSrt: { shot_1: "1\n00:00:00,000 --> 00:00:01,500\nพอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมได้เลย" },
      burnInSubtitles: false,
    });
  });

  it("rejects stale revisions, mismatched products, and raw remote URLs", () => {
    const first = mergeStoryboardReviewHyperframesFinalCompositeState({
      reviewData: {},
      input: baseInput,
      nowIso: "2026-06-12T00:00:00.000Z",
    });

    expect(() =>
      mergeStoryboardReviewHyperframesFinalCompositeState({
        reviewData: first.reviewData,
        input: { ...baseInput, expectedRevision: 0 },
        nowIso: "2026-06-12T00:06:00.000Z",
      })
    ).toThrow(/revision conflict/);

    expect(() =>
      mergeStoryboardReviewHyperframesFinalCompositeState({
        reviewData: first.reviewData,
        input: { ...baseInput, productId: "mp_other", expectedRevision: 1 },
        nowIso: "2026-06-12T00:06:00.000Z",
      })
    ).toThrow(/product/);

    expect(() =>
      mergeStoryboardReviewHyperframesFinalCompositeState({
        reviewData: {},
        input: {
          ...baseInput,
          patch: {
            shotMediaAssignments: [
              {
                storyboardReviewProjectId: 55,
                shotId: "shot_1",
                shotIndex: 0,
                source: "media_library",
                mediaKind: "video",
                sourceUrl: "https://cdn.example.test/raw.mp4",
                assignedByUserId: 109,
                assignedAt: "2026-06-12T00:00:00.000Z",
              },
            ],
          },
        },
        nowIso: "2026-06-12T00:00:00.000Z",
      })
    ).toThrow(/raw remote URLs/);
  });

  it("classifies legacy/corrupt rows without auto-repairing identity", () => {
    expect(classifyStoryboardReviewHyperframesFinalCompositeState({})).toBe("unknown");
    expect(
      classifyStoryboardReviewHyperframesFinalCompositeState({
        hyperframesFinalComposite: {
          canonicalProductId: baseInput.productId,
          autoReviewRunId: baseInput.runId,
          storyboardReviewProjectId: 55,
        },
      })
    ).toBe("repairable");
    expect(
      classifyStoryboardReviewHyperframesFinalCompositeState({
        hyperframesFinalComposite: { title: "Sand Toy Delight" },
      })
    ).toBe("delete_only");
  });
});
