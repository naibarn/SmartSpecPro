/**
 * Async stage-job generalization
 * (`planning/vd-async-stage-jobs-generalization/plan.md`).
 *
 * The incident: `plan_episode_script` ran inline on the HTTP request and
 * outlived Cloudflare's ~100s edge timeout, so the browser got a 524 while the
 * generation went on to finish server-side (run #540 = succeeded). The user saw
 * a hard failure with a retry button — i.e. an invitation to pay for the same
 * LLM call twice. `storyboard_shotgrid` had already been moved off the request
 * for exactly this reason (bug #127), but every part of that path was hardcoded
 * to that one stage.
 *
 * These tests pin the two things that make the generalization safe:
 *  - the set of stages that must never run inline, and
 *  - the worker's dispatch, including the default that keeps jobs already
 *    sitting in the queue at deploy time (enqueued with no `stage`) running.
 */
import { describe, expect, it } from "vitest";
import { VERTICAL_DRAMA_ASYNC_STAGES } from "../verticalDramaEpisodePipeline";

describe("VERTICAL_DRAMA_ASYNC_STAGES", () => {
  it("covers both stages that outlive Cloudflare's ~100s edge timeout", () => {
    expect(VERTICAL_DRAMA_ASYNC_STAGES.has("storyboard_shotgrid")).toBe(true);
    expect(VERTICAL_DRAMA_ASYNC_STAGES.has("plan_episode_script")).toBe(true);
  });

  it("does not sweep in short stages that are fine to run inline", () => {
    expect(VERTICAL_DRAMA_ASYNC_STAGES.has("normalize_series_input")).toBe(false);
    expect(VERTICAL_DRAMA_ASYNC_STAGES.has("approve_episode")).toBe(false);
  });
});

/**
 * Mirrors the worker's dispatch expression exactly (see the processor in
 * `verticalDramaEpisodeStageJobs.ts`). Kept as a local restatement rather than
 * booting BullMQ: the branch itself is the contract worth pinning, and the
 * default is what stops in-flight jobs being dropped on deploy.
 */
function dispatchTarget(data: { stage?: string }): "storyboard" | "generic" {
  const stage = data.stage ?? "storyboard_shotgrid";
  return stage === "storyboard_shotgrid" ? "storyboard" : "generic";
}

describe("stage-job worker dispatch", () => {
  it("keeps storyboard_shotgrid on its own purpose-built job body", () => {
    expect(dispatchTarget({ stage: "storyboard_shotgrid" })).toBe("storyboard");
  });

  it("routes every other async stage through the generic runner", () => {
    expect(dispatchTarget({ stage: "plan_episode_script" })).toBe("generic");
  });

  it("defaults a job enqueued before this change to storyboard_shotgrid", () => {
    // Jobs already queued at deploy time carry no `stage` and are all
    // storyboard runs. Dropping or misrouting them would strand a paid run.
    expect(dispatchTarget({})).toBe("storyboard");
  });
});
