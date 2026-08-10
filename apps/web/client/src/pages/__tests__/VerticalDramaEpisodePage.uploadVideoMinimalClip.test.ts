/**
 * Unit coverage for `buildUpdatedClipsForVideoTask` (2026-07-07 fix) — the
 * pure logic behind persisting an uploaded video onto a shot that has no
 * matching `motionPromptPack` clip yet.
 *
 * Bug this fixes: the "อัปโหลดวิดีโอ" upload button in
 * `VerticalDramaStoryboardPanel` used to render ONLY when a
 * `motionPromptPack` clip already existed for the current shot (same gate as
 * the video-prompt box) — so shot 2+ (any shot before its video prompt had
 * ever been generated) silently had no upload option at all. The button now
 * renders on every shot; when no matching clip exists yet, the page's
 * `persistVideoTask` must create a minimal
 * `{clipNumber, sourceShotNumbers: [shotNumber], prompt: "", durationSeconds}`
 * clip entry — mirroring `generateShotVideoPrompt`'s (router) own
 * "no matching clip yet" convention — rather than silently dropping the
 * upload.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUpdatedClipsForVideoTask,
  type MinimalVideoTaskClip,
} from "../VerticalDramaEpisodePage";

describe("buildUpdatedClipsForVideoTask", () => {
  it("creates a minimal clip entry when no clip matches clipNumber yet (shot 2+ upload with no prior generation)", () => {
    const existingClips: MinimalVideoTaskClip[] = [
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "existing", durationSeconds: 6 },
    ];

    const updated = buildUpdatedClipsForVideoTask(
      existingClips,
      2,
      { videoUrl: "https://cdn/uploaded-2.mp4", source: "upload" },
      2,
      8
    );

    expect(updated).toHaveLength(2);
    expect(updated).toContainEqual(
      expect.objectContaining({ clipNumber: 1, prompt: "existing" }),
    );
    const newClip = updated.find(c => c.clipNumber === 2);
    expect(newClip).toMatchObject({
      clipNumber: 2,
      sourceShotNumbers: [2],
      prompt: "",
      durationSeconds: 8,
      videoTask: { videoUrl: "https://cdn/uploaded-2.mp4", source: "upload" },
    });
  });

  it("updates the existing clip's videoTask in place when a matching clip already exists", () => {
    const existingClips: MinimalVideoTaskClip[] = [
      { clipNumber: 3, sourceShotNumbers: [3], prompt: "an existing prompt", durationSeconds: 6 },
    ];

    const updated = buildUpdatedClipsForVideoTask(
      existingClips,
      3,
      { videoUrl: "https://cdn/uploaded-3.mp4", source: "upload" },
      3,
      8
    );

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      clipNumber: 3,
      prompt: "an existing prompt", // untouched — only videoTask patched
      videoTask: { videoUrl: "https://cdn/uploaded-3.mp4", source: "upload" },
    });
  });

  it("clears videoTask on an existing clip when passed null", () => {
    const existingClips: MinimalVideoTaskClip[] = [
      {
        clipNumber: 1,
        sourceShotNumbers: [1],
        prompt: "p",
        durationSeconds: 6,
        videoTask: { videoUrl: "https://cdn/old.mp4" },
      },
    ];

    const updated = buildUpdatedClipsForVideoTask(existingClips, 1, null, 1, 8);

    expect(updated[0]).not.toHaveProperty("videoTask");
  });

  it("is a no-op (never creates a phantom clip) when clearing (null) a clip that doesn't exist", () => {
    const existingClips: MinimalVideoTaskClip[] = [
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 6 },
    ];

    const updated = buildUpdatedClipsForVideoTask(existingClips, 99, null, 99, 8);

    expect(updated).toEqual(existingClips);
  });

  it("is a no-op when creating a new clip is requested without a sourceShotNumber (defensive — should never happen from the UI, but must not silently create a malformed clip)", () => {
    const existingClips: MinimalVideoTaskClip[] = [];

    const updated = buildUpdatedClipsForVideoTask(
      existingClips,
      5,
      { videoUrl: "https://cdn/x.mp4" },
      undefined,
      8
    );

    expect(updated).toEqual([]);
  });

  it("creates a minimal clip from a completely empty clip list (first-ever upload on an otherwise clip-less pack)", () => {
    const updated = buildUpdatedClipsForVideoTask(
      [],
      4,
      { pendingTaskId: "task-abc" },
      4,
      8
    );

    expect(updated).toEqual([
      {
        clipNumber: 4,
        sourceShotNumbers: [4],
        prompt: "",
        durationSeconds: 8,
        videoTask: { pendingTaskId: "task-abc" },
      },
    ]);
  });
});

describe("uploaded video persistence flow", () => {
  it("does not report success from a stale page when persistence is rejected", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const persistHelper = source.slice(
      source.indexOf("async function persistVideoTask("),
      source.indexOf(
        "/** Shared completion handler",
        source.indexOf("async function persistVideoTask(")
      )
    );

    expect(persistHelper).toContain(
      "const result = await persistVideoClipTaskMutation.mutateAsync"
    );
    expect(persistHelper).toContain("if (!result.persisted)");
    expect(persistHelper).toContain(
      "await utils.verticalDramaEpisodes.getEpisodeDetail.invalidate()"
    );
  });

  it("does not trigger post-upload identity QC", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const uploadHandler = source.slice(
      source.indexOf("async function handleUploadVideoClip("),
      source.indexOf("async function handleUploadVideoClip(") + 1800
    );

    expect(uploadHandler).not.toContain("runClipIdentityQcMutation");
    expect(uploadHandler).toContain("mediaAssetId");
    expect(uploadHandler).toContain('source: "upload"');
  });
});
