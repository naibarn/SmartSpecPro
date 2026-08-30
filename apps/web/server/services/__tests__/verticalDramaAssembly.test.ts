/**
 * Vertical Drama Series — assembly builder tests (section 09 "Tests First").
 *
 * These exercise the pure assembly-manifest core (no DB): default-bridge and
 * fallback profiles, sub-shot flatten ordering + per-parent sums, and the
 * repair-action paths for missing clips / duration mismatches.
 */

import { describe, expect, it } from "vitest";
import {
  buildAssemblyManifest,
  buildSubtitlesSrt,
  flattenClips,
  scheduleFor,
  sourceShotsFor,
  type ClipImportInput,
} from "../verticalDramaAssembly";
import { createUniformVerticalDramaDurationPlan } from "@shared/verticalDramaSeries/durationProfiles";

/** 8 ready clips on the default-bridge schedule (8+8+8+8+8+8+8+4 = 60). */
function defaultBridgeClips(): ClipImportInput[] {
  return scheduleFor("default_bridge").map((durationSeconds, i) => ({
    clipNumber: i + 1,
    durationSeconds,
    mediaAssetId: `asset_${i + 1}`,
    providerJobId: `job_${i + 1}`,
    providerStatus: "succeeded",
    status: "ready",
  }));
}

/** 9 ready clips on the fallback schedule ([8,8,8,4,8,8,4,8,4] = 60). */
function fallbackClips(): ClipImportInput[] {
  return scheduleFor("fallback_9_shots").map((durationSeconds, i) => ({
    clipNumber: i + 1,
    durationSeconds,
    mediaAssetId: `asset_${i + 1}`,
    providerJobId: `job_${i + 1}`,
    providerStatus: "succeeded",
    status: "ready",
  }));
}

describe("buildAssemblyManifest — default bridge", () => {
  it("preserves 8 clips from 9 frames with 8+8+8+8+8+8+8+4 timing", () => {
    const { manifest, valid, errors } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_default",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips: defaultBridgeClips(),
    });
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
    expect(manifest.clips).toHaveLength(8);
    expect(manifest.clips.map((c) => c.durationSeconds)).toEqual([8, 8, 8, 8, 8, 8, 8, 4]);
    // Bridge clip i maps to source frames [i, i+1].
    expect(manifest.clips[0].sourceShotNumbers).toEqual([1, 2]);
    expect(manifest.clips[7].sourceShotNumbers).toEqual([8, 9]);
    // Sums to 60.
    expect(manifest.clips.reduce((a, c) => a + c.durationSeconds, 0)).toBe(60);
  });

  it("includes concat plan, subtitle plan, audio/BGM plan, and export settings", () => {
    const { manifest } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_default2",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips: defaultBridgeClips(),
      subtitlePlan: [
        { subtitleCueId: "c1", startSeconds: 0, endSeconds: 3, text: "สวัสดี", safeArea: "bottom_safe" },
      ],
      audioBgmPlan: [{ trackType: "bgm", startSeconds: 0, endSeconds: 60, volumeDb: -18 }],
    });
    expect(manifest.ffmpegConcatPlan).toHaveLength(8);
    expect(manifest.ffmpegConcatPlan[0]).toBe("file 'media:asset_1'");
    expect(manifest.subtitlePlan).toHaveLength(1);
    expect(manifest.audioBgmPlan).toHaveLength(1);
    expect(manifest.exportSettings).toEqual({
      aspectRatio: "9:16",
      resolution: "1080p",
      fps: 30,
      container: "mp4",
    });
    expect(manifest.subtitlesSrt).toContain("สวัสดี");
    expect(manifest.ffmpegCommand).toContain("final_episode_60s_vertical.mp4");
  });

  it("projects explicit still/video B-roll without provider URLs and rejects overflow", () => {
    const { manifest, valid, errors } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_broll",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips: defaultBridgeClips(),
      brollPlan: [{
        bindingId: "b1",
        shotNumber: 2,
        order: 0,
        sourceSlotId: 10,
        sourceAssetId: 11,
        mediaAssetId: "44",
        segmentId: "seg-1",
        segmentRevision: 2,
        mediaType: "video",
        inSeconds: 3,
        outSeconds: 8,
        fitMode: "cover",
        audioPolicy: "mute",
        labelMode: "source",
      }],
    });
    expect(valid).toBe(true);
    expect(manifest.brollPlan?.[0]).toMatchObject({ mediaAssetId: "44", inSeconds: 3, outSeconds: 8 });
    expect(JSON.stringify(manifest.brollPlan)).not.toContain("http");
    const overflow = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_broll_overflow",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips: defaultBridgeClips(),
      brollPlan: Array.from({ length: 2 }, (_, index) => ({
        bindingId: `b${index}`,
        shotNumber: 1,
        order: index,
        mediaAssetId: String(index + 1),
        mediaType: "video" as const,
        inSeconds: 0,
        outSeconds: 40,
        fitMode: "cover" as const,
        audioPolicy: "keep" as const,
        labelMode: "none" as const,
      })),
    });
    expect(overflow.valid).toBe(false);
    expect(errors).toEqual([]);
    expect(overflow.errors.some(error => error.startsWith("broll_overflow:"))).toBe(true);
  });
});

describe("buildAssemblyManifest — fallback profile", () => {
  it("records 9 clips with [8,8,8,4,8,8,4,8,4] trim/timing summing to 60", () => {
    const { manifest, valid } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_fallback",
      durationProfileId: "vertical_drama_60s_9_shots",
      profileKind: "fallback_9_shots",
      clips: fallbackClips(),
    });
    expect(valid).toBe(true);
    expect(manifest.clips).toHaveLength(9);
    expect(manifest.clips.map((c) => c.durationSeconds)).toEqual([8, 8, 8, 4, 8, 8, 4, 8, 4]);
    expect(manifest.clips[0].sourceShotNumbers).toEqual([1]);
    expect(manifest.clips.reduce((a, c) => a + c.durationSeconds, 0)).toBe(60);
  });
});

describe("buildAssemblyManifest — selected 9-shot duration profile", () => {
  it("uses the exact 9-shot vector and derived runtime without changing legacy profiles", () => {
    const durationPlan = createUniformVerticalDramaDurationPlan(10);
    const clips = durationPlan.shotDurationsSeconds.map((durationSeconds, i) => ({
      clipNumber: i + 1,
      durationSeconds,
      mediaAssetId: `asset_selected_${i + 1}`,
      status: "ready" as const,
    }));

    const { manifest, valid, errors } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_selected",
      durationProfileId: durationPlan.profileId,
      profileKind: "selected_9_shots",
      durationPlan,
      clips,
    });

    expect(valid).toBe(true);
    expect(errors).toEqual([]);
    expect(manifest.targetDurationSeconds).toBe(90);
    expect(manifest.clips).toHaveLength(9);
    expect(manifest.clips.map(c => c.sourceShotNumbers)).toEqual(
      durationPlan.shotDurationsSeconds.map((_, i) => [i + 1]),
    );
    expect(manifest.ffmpegCommand).toContain("final_episode_90s_vertical.mp4");
  });
});

describe("buildAssemblyManifest — sub-shots (flatten order + per-parent sums)", () => {
  it("flattens sub-shots by parent then sub-shot order, per-parent sums to parent, total 60, 9 shots", () => {
    // Fallback schedule [8,8,8,4,8,8,4,8,4]; decompose every parent into subs.
    const schedule = scheduleFor("fallback_9_shots");
    const clips: ClipImportInput[] = [];
    schedule.forEach((parentDuration, idx) => {
      const parent = idx + 1;
      // Split parent into 2 subs (halves) — deterministic.
      const first = parentDuration / 2;
      const second = parentDuration - first;
      clips.push({
        clipNumber: parent * 100 + 2,
        durationSeconds: second,
        mediaAssetId: `a_${parent}_2`,
        parentShotNumber: parent,
        subShotNumber: 2,
        status: "ready",
      });
      clips.push({
        clipNumber: parent * 100 + 1,
        durationSeconds: first,
        mediaAssetId: `a_${parent}_1`,
        parentShotNumber: parent,
        subShotNumber: 1,
        status: "ready",
      });
    });
    // Intentionally shuffle input order — builder must re-sort.
    const shuffled = [...clips].reverse();

    const { manifest, valid, errors } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_sub",
      durationProfileId: "vertical_drama_60s_9_shots",
      profileKind: "fallback_9_shots",
      clips: shuffled,
      subShotsEnabled: true,
    });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    // Flatten order = parent asc, then sub asc.
    const order = manifest.clips.map((c) => [c.parentShotNumber, c.subShotNumber]);
    expect(order[0]).toEqual([1, 1]);
    expect(order[1]).toEqual([1, 2]);
    expect(order[2]).toEqual([2, 1]);
    // ffmpeg concat sequence equals the ordered flatten.
    expect(manifest.ffmpegConcatPlan).toEqual(manifest.clips.map((c) => `file 'media:${c.mediaAssetId}'`));
    // Cut boundaries within parent 1: [0,4] then [4,8].
    expect(manifest.clips[0].cutStartSeconds).toBe(0);
    expect(manifest.clips[1].cutEndSeconds).toBe(8);
    // Episode still totals 60 and shot count stays 9.
    expect(manifest.clips.reduce((a, c) => a + c.durationSeconds, 0)).toBe(60);
    const parents = new Set(manifest.clips.map((c) => c.parentShotNumber));
    expect(parents.size).toBe(9);
  });

  it("flags a per-parent duration mismatch as a repair action", () => {
    const clips: ClipImportInput[] = [
      // parent 1 (fallback duration 8) but subs sum to 6 → mismatch
      { clipNumber: 101, durationSeconds: 3, mediaAssetId: "x1", parentShotNumber: 1, subShotNumber: 1, status: "ready" },
      { clipNumber: 102, durationSeconds: 3, mediaAssetId: "x2", parentShotNumber: 1, subShotNumber: 2, status: "ready" },
    ];
    const { valid, errors, repairActions } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_sub_bad",
      durationProfileId: "vertical_drama_60s_9_shots",
      profileKind: "fallback_9_shots",
      clips,
      subShotsEnabled: true,
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("sub_shot_parent_duration_mismatch"))).toBe(true);
    expect(repairActions.some((r) => r.action === "repair_duration_mismatch")).toBe(true);
  });
});

describe("buildAssemblyManifest — sub-shots OFF is unchanged (no regression)", () => {
  it("produces no sub-shot fields when the flag is off", () => {
    const { manifest } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_off",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips: defaultBridgeClips(),
      subShotsEnabled: false,
    });
    expect(manifest.subShotsEnabled).toBe(false);
    expect(manifest.clips.every((c) => c.parentShotNumber === undefined)).toBe(true);
    expect(manifest.clips.every((c) => c.subShotNumber === undefined)).toBe(true);
  });
});

describe("buildAssemblyManifest — repair paths", () => {
  it("creates a missing-clip repair action when a clip has no media asset", () => {
    const clips = defaultBridgeClips();
    clips[3] = { ...clips[3], mediaAssetId: undefined, status: "planned" };
    const { repairActions } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_missing",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips,
    });
    expect(repairActions.some((r) => r.action === "repair_missing_clip")).toBe(true);
  });

  it("creates a duration-mismatch repair action when clips do not sum to 60", () => {
    const clips = defaultBridgeClips().slice(0, 7); // drops the last 4s clip → 56s
    const { valid, repairActions } = buildAssemblyManifest({
      assemblyManifestId: "vdasm_test_dur",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      profileKind: "default_bridge",
      clips,
    });
    expect(valid).toBe(false);
    expect(repairActions.some((r) => r.action === "repair_duration_mismatch")).toBe(true);
  });
});

describe("pure helpers", () => {
  it("flattenClips sorts by parent then sub-shot", () => {
    const clips: ClipImportInput[] = [
      { clipNumber: 2, durationSeconds: 4, parentShotNumber: 2, subShotNumber: 1 },
      { clipNumber: 1, durationSeconds: 4, parentShotNumber: 1, subShotNumber: 2 },
      { clipNumber: 0, durationSeconds: 4, parentShotNumber: 1, subShotNumber: 1 },
    ];
    const order = flattenClips(clips).map((c) => [c.parentShotNumber, c.subShotNumber]);
    expect(order).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  it("sourceShotsFor bridges frames on default and maps 1:1 on fallback", () => {
    expect(sourceShotsFor("default_bridge", 0)).toEqual([1, 2]);
    expect(sourceShotsFor("fallback_9_shots", 0)).toEqual([1]);
  });

  it("buildSubtitlesSrt emits sequential cues with SRT timestamps", () => {
    const srt = buildSubtitlesSrt([
      { subtitleCueId: "c1", startSeconds: 0, endSeconds: 2.5, text: "Hi", safeArea: "bottom_safe" },
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:02,500");
    expect(srt).toContain("Hi");
  });
});
