/**
 * Feature 142, section-01 startup-wiring regression guard (the
 * "taught-but-not-wired" failure class — same idea as
 * `verticalDramaEpisodeStageJobsWiring.test.ts`, copied wholesale):
 * `initVideoIntelligenceJobsQueue()` had ZERO callers in `_core/index.ts`, so
 * every Video Studio stage (scene plan / quality review / quality repair)
 * enqueue silently failed and the client spun on `queued` forever.
 *
 * Asserts against the REAL `_core/index.ts` source so the wiring can never
 * silently disappear again. Also asserts the service file itself exists.
 *
 * ── Anchor deviation from the section-01 doc (verified at this worktree's
 * HEAD, 2026-08-02) ──────────────────────────────────────────────────────
 * The section doc says to anchor the pairing assertions against
 * `initVerticalDramaEpisodeStageJobsQueue()` /
 * `closeVerticalDramaEpisodeStageJobsQueue()`. Those calls DO NOT EXIST in
 * `_core/index.ts` at this worktree's HEAD — that wiring is an uncommitted
 * change living only in the main checkout — so
 * `verticalDramaEpisodeStageJobsWiring.test.ts` is ALREADY RED here (3
 * pre-existing failures, not caused by this section). Anchoring to a sibling
 * that isn't itself wired would make this guard's non-vacuity check
 * meaningless. Instead this file anchors against the committed sibling that
 * IS verified present at HEAD: `initVerticalDramaStoryJobsQueue()` (1 call)
 * and `closeVerticalDramaStoryJobsQueue()` (2 calls, one per shutdown
 * block). The non-vacuity assertions below assert that sibling count
 * directly (`>= 1` / `>= 2`) so the pairing check can never pass vacuously.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CORE_INDEX_PATH = path.resolve(__dirname, "../_core/index.ts");
const VIDEO_INTELLIGENCE_JOBS_SERVICE_PATH = path.resolve(
  __dirname,
  "../services/videoIntelligenceJobs.ts",
);

/** Counts real invocations — `name()` — never the bare import-list mention. */
const countCalls = (source: string, fnName: string): number =>
  (source.match(new RegExp(`${fnName}\\(\\)`, "g")) ?? []).length;

describe("video intelligence jobs queue wiring in _core/index.ts", () => {
  const source = fs.readFileSync(CORE_INDEX_PATH, "utf-8");

  it("the video intelligence jobs service file exists (the router statically imports it)", () => {
    expect(fs.existsSync(VIDEO_INTELLIGENCE_JOBS_SERVICE_PATH)).toBe(true);
  });

  it("imports init/close from the video intelligence jobs service", () => {
    expect(source).toContain('from "../services/videoIntelligenceJobs"');
    expect(source).toContain("initVideoIntelligenceJobsQueue");
    expect(source).toContain("closeVideoIntelligenceJobsQueue");
  });

  it("startup CALLS initVideoIntelligenceJobsQueue() — without it every stage strands at 'queued'", () => {
    expect(countCalls(source, "initVideoIntelligenceJobsQueue")).toBeGreaterThanOrEqual(1);

    // Non-vacuity guard: the sibling itself must actually be wired, otherwise
    // the pairing assertion below would pass vacuously (0 >= 0).
    const siblingInitCalls = countCalls(source, "initVerticalDramaStoryJobsQueue");
    expect(siblingInitCalls).toBeGreaterThanOrEqual(1);

    expect(countCalls(source, "initVideoIntelligenceJobsQueue")).toBeGreaterThanOrEqual(
      siblingInitCalls,
    );
  });

  it("every shutdown block that closes the VD story-jobs queue also closes the VI queue", () => {
    const siblingCloseCalls = countCalls(source, "closeVerticalDramaStoryJobsQueue");
    // Non-vacuity guard — there are two shutdown blocks (SIGTERM + SIGINT),
    // so this must be >= 2 or the pairing assertion below is meaningless.
    expect(siblingCloseCalls).toBeGreaterThanOrEqual(2);

    expect(countCalls(source, "closeVideoIntelligenceJobsQueue")).toBeGreaterThanOrEqual(
      siblingCloseCalls,
    );
  });
});
