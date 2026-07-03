/**
 * Focused tests for the Vertical Drama Storyboard Review handoff service
 * (spec feature 131, section-06). Covers the pure, DB-free surface:
 *   - episodePlanHash determinism (+ assemblyManifest exclusion)
 *   - idempotent reopen vs create decision
 *   - sub-shot fan-out task count + lineage fields
 *   - the literal extraParams.source
 *   - append-only video prompt edit history + stale gating
 */

import { describe, it, expect } from "vitest";
import {
  computeEpisodePlanHash,
  decideHandoffAction,
  buildVerticalDramaHandoffTasks,
  buildVerticalDramaReviewData,
  appendVideoPromptEdit,
  type ApprovedEpisodePlan,
  type BuildHandoffInput,
} from "./verticalDramaStoryboardHandoff";
import { buildVerticalDramaHandoffKey } from "../../shared/verticalDramaSeries/storyboardHandoff";

/** Approved plan with 9 storyboard shots -> 8 bridge clips (60s: 8×7 + 4). */
function makePlan(): ApprovedEpisodePlan {
  const shots = Array.from({ length: 9 }, (_, i) => ({
    shotNumber: i + 1,
    contactSheetPrompt: `contact ${i + 1}`,
    cellPrompts: [`cell ${i + 1}a`, `cell ${i + 1}b`],
    negativePrompt: "no watermark",
  }));
  const clips = Array.from({ length: 8 }, (_, i) => ({
    clipNumber: i + 1,
    shotNumber: i + 1,
    prompt: `motion ${i + 1}`,
    durationSeconds: i === 7 ? 4 : 8,
    startFrameAssetId: `frame-${i + 1}`,
    endFrameAssetId: `frame-${i + 2}`,
  }));
  return {
    script: { logline: "test" },
    storyboard: { shots },
    startFramePlan: { frames: shots.map((s) => ({ shotNumber: s.shotNumber, approvedMediaAssetId: `frame-${s.shotNumber}` })) },
    motionPromptPack: { motionMode: "first_last_frame_bridge", clips },
    dialogueAudioPlan: { audioStrategy: "narrator" },
  };
}

function makeInput(overrides: Partial<BuildHandoffInput> = {}): BuildHandoffInput {
  return {
    seriesId: "42",
    episodeId: "7",
    episodeNumber: 3,
    durationProfileId: "vertical_drama_60s_9_frames_8_clips",
    motionMode: "first_last_frame_bridge",
    imageModelId: "img-model",
    videoModelId: "vid-model",
    plan: makePlan(),
    subShotsEnabled: false,
    ...overrides,
  };
}

describe("computeEpisodePlanHash", () => {
  it("is deterministic across key order", () => {
    const a = computeEpisodePlanHash({
      script: { a: 1, b: 2 },
      storyboard: { shots: [{ shotNumber: 1 }] },
    });
    const b = computeEpisodePlanHash({
      storyboard: { shots: [{ shotNumber: 1 }] },
      script: { b: 2, a: 1 },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the approved plan changes", () => {
    const base = computeEpisodePlanHash(makePlan());
    const changed = computeEpisodePlanHash({ ...makePlan(), script: { logline: "different" } });
    expect(changed).not.toBe(base);
  });

  it("ignores the back-filled assemblyManifest", () => {
    const withoutManifest = computeEpisodePlanHash(makePlan());
    const withManifest = computeEpisodePlanHash({ ...makePlan(), assemblyManifest: { id: "am-1" } });
    expect(withManifest).toBe(withoutManifest);
  });
});

describe("idempotency key + decideHandoffAction", () => {
  it("builds the pinned key format", () => {
    const data = buildVerticalDramaReviewData(makeInput());
    expect(data.idempotencyKey).toBe(
      buildVerticalDramaHandoffKey("42", "7", data.episodePlanHash),
    );
    expect(data.idempotencyKey).toMatch(/^vertical-drama:42:episode:7:handoff:[0-9a-f]{64}$/);
  });

  it("reopens on unchanged plan, creates on changed plan", () => {
    const first = buildVerticalDramaReviewData(makeInput());
    expect(decideHandoffAction({ existingReviewData: first, newKey: first.idempotencyKey })).toBe("reopen");

    const changedPlan = makePlan();
    (changedPlan.script as Record<string, unknown>).logline = "rewrite";
    const second = buildVerticalDramaReviewData(makeInput({ plan: changedPlan }));
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(decideHandoffAction({ existingReviewData: first, newKey: second.idempotencyKey })).toBe("create");
  });

  it("creates when there is no existing review", () => {
    const data = buildVerticalDramaReviewData(makeInput());
    expect(decideHandoffAction({ existingReviewData: null, newKey: data.idempotencyKey })).toBe("create");
  });
});

describe("buildVerticalDramaHandoffTasks — default bridge", () => {
  it("creates 8 ordered clip tasks from 9 approved frames", () => {
    const tasks = buildVerticalDramaHandoffTasks(makeInput());
    expect(tasks).toHaveLength(8);
    expect(tasks.map((t) => t.extraParams.shotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("preserves the 8+8+8+8+8+8+8+4 duration profile", () => {
    const tasks = buildVerticalDramaHandoffTasks(makeInput());
    expect(tasks.map((t) => t.durationSeconds)).toEqual([8, 8, 8, 8, 8, 8, 8, 4]);
    expect(tasks.reduce((s, t) => s + t.durationSeconds, 0)).toBe(60);
  });

  it("maps start/stop frames with roles and start_stop reference mode", () => {
    const [first] = buildVerticalDramaHandoffTasks(makeInput());
    expect(first.storyboardContext.referenceFrameRoles).toEqual(["start", "stop"]);
    expect(first.storyboardContext.referenceImages.map((r) => r.role)).toEqual(["start", "stop"]);
    expect(first.videoSegmentState.videoSegmentPlan.referenceMode).toBe("start_stop");
    expect(first.extraParams.startFrameAssetId).toBe("frame-1");
    expect(first.extraParams.endFrameAssetId).toBe("frame-2");
  });

  it("task.prompt is the video prompt only (no image prompts leaked)", () => {
    const [first] = buildVerticalDramaHandoffTasks(makeInput());
    expect(first.prompt).toBe("motion 1");
    expect(first.prompt).not.toContain("contact");
    expect(first.prompt).not.toContain("cell");
    // Image prompts round-trip separately.
    expect(first.storyboardContext.imagePrompts?.contactSheetPrompt).toBe("contact 1");
  });

  it("stamps the literal extraParams.source on every task", () => {
    const tasks = buildVerticalDramaHandoffTasks(makeInput());
    expect(tasks.every((t) => t.extraParams.source === "vertical_drama_series")).toBe(true);
    // assemblyManifestId is absent at creation (back-filled at assembly).
    expect(tasks.every((t) => t.extraParams.assemblyManifestId === undefined)).toBe(true);
    // Skill-ID fields present.
    expect(tasks[0].extraParams.videoPromptSkillId).toBe("vertical-drama-video-motion-prompt-pack");
  });
});

describe("buildVerticalDramaHandoffTasks — sub-shot fan-out", () => {
  function planWithSubShots(): ApprovedEpisodePlan {
    const plan = makePlan();
    (plan.motionPromptPack as Record<string, unknown>).sub_shot_plan = [
      {
        parentShotNumber: 1,
        subShots: [
          { subShotNumber: 1, durationSeconds: 3, prompt: "sub 1a", transitionIn: "cut", cameraSetup: "wide" },
          { subShotNumber: 2, durationSeconds: 3, prompt: "sub 1b", transitionIn: "match_cut", cameraSetup: "close" },
          { subShotNumber: 3, durationSeconds: 2, prompt: "sub 1c", transitionIn: "smash_cut", cameraSetup: "insert" },
        ],
      },
    ];
    return plan;
  }

  it("fans a decomposed shot into one ordered task per sub-shot when the flag is on", () => {
    const tasks = buildVerticalDramaHandoffTasks(
      makeInput({ plan: planWithSubShots(), subShotsEnabled: true }),
    );
    // Shot 1 -> 3 sub-shot tasks; shots 2..8 -> 1 each = 10 total.
    expect(tasks).toHaveLength(10);
    const shot1 = tasks.filter((t) => t.extraParams.parentShotNumber === 1);
    expect(shot1).toHaveLength(3);
    expect(shot1.map((t) => t.extraParams.subShotNumber)).toEqual([1, 2, 3]);
    expect(shot1.every((t) => t.extraParams.subShotCount === 3)).toBe(true);
    expect(shot1.map((t) => t.extraParams.subShotTransitionIn)).toEqual(["cut", "match_cut", "smash_cut"]);
    // shotNumber still resolves to the parent storyboard shot.
    expect(shot1.every((t) => t.extraParams.shotNumber === 1)).toBe(true);
    // task.prompt is the sub-shot motion prompt only.
    expect(shot1.map((t) => t.prompt)).toEqual(["sub 1a", "sub 1b", "sub 1c"]);
    expect(shot1[0].prompt).not.toContain("wide"); // camera setup not leaked
  });

  it("no regression: flag off keeps a single task per shot with no sub-shot fields", () => {
    const tasks = buildVerticalDramaHandoffTasks(
      makeInput({ plan: planWithSubShots(), subShotsEnabled: false }),
    );
    expect(tasks).toHaveLength(8);
    expect(tasks.every((t) => t.extraParams.subShotNumber === undefined)).toBe(true);
  });
});

describe("appendVideoPromptEdit", () => {
  it("records an append-only edit and marks the task stale", () => {
    const [task] = buildVerticalDramaHandoffTasks(makeInput());
    const edited = appendVideoPromptEdit(task, { newPrompt: "new motion", editedByUserId: 99, editedAt: 1000 });
    expect(edited.prompt).toBe("new motion");
    expect(edited.promptEditHistory).toEqual([
      { editedByUserId: 99, editedAt: 1000, original: "motion 1" },
    ]);
    expect(edited.videoSegmentState.staleTaskIds).toContain(task.id);
    expect(edited.videoSegmentState.staleReason).toBe("video_prompt_edited");
    // Original task is untouched (no in-place mutation).
    expect(task.prompt).toBe("motion 1");
    expect(task.promptEditHistory).toHaveLength(0);
  });
});
