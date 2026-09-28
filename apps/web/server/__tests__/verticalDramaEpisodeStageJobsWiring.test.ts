/**
 * Bug #127 startup-wiring regression guard (the "taught-not-wired" defense
 * class — same idea as the skill-loader real-file tests): the
 * `vertical_drama_episode_stage_jobs` BullMQ queue existed and the router's
 * submit path happily inserted `queued` run rows, but
 * `initVerticalDramaEpisodeStageJobsQueue()` was missing from
 * `_core/index.ts`'s startup sequence — so every enqueue was a silent no-op
 * and runs #496/#501 sat at `queued` forever (then became poison pills via
 * the submit path's idempotency reuse).
 *
 * Asserts against the REAL `_core/index.ts` source so the wiring can never
 * silently disappear again. Also asserts the service file itself exists:
 * it shipped git-UNTRACKED at first, meaning a clean clone could not even
 * build `main` (the router statically imports it).
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CORE_INDEX_PATH = path.resolve(__dirname, "../_core/index.ts");
const STAGE_JOBS_SERVICE_PATH = path.resolve(
  __dirname,
  "../services/verticalDramaEpisodeStageJobs.ts"
);

/** Counts real invocations — `name()` — never the bare import-list mention. */
const countCalls = (source: string, fnName: string): number =>
  (source.match(new RegExp(`${fnName}\\(\\)`, "g")) ?? []).length;

describe("bug #127: vertical drama episode stage jobs queue wiring in _core/index.ts", () => {
  const source = fs.readFileSync(CORE_INDEX_PATH, "utf-8");

  it("the stage-jobs service file exists (the router statically imports it — a clean clone cannot build without it)", () => {
    expect(fs.existsSync(STAGE_JOBS_SERVICE_PATH)).toBe(true);
  });

  it("imports the queue's init/close from the stage-jobs service", () => {
    expect(source).toContain('from "../services/verticalDramaEpisodeStageJobs"');
    expect(source).toContain("initVerticalDramaEpisodeStageJobsQueue");
    expect(source).toContain("closeVerticalDramaEpisodeStageJobsQueue");
  });

  it("startup CALLS initVerticalDramaEpisodeStageJobsQueue() — a missing call strands every storyboard_shotgrid submit at 'queued'", () => {
    expect(
      countCalls(source, "initVerticalDramaEpisodeStageJobsQueue")
    ).toBeGreaterThanOrEqual(1);
    // Wired wherever its sibling story-jobs queue is wired.
    expect(
      countCalls(source, "initVerticalDramaEpisodeStageJobsQueue")
    ).toBeGreaterThanOrEqual(
      countCalls(source, "initVerticalDramaStoryJobsQueue")
    );
  });

  it("every shutdown block that closes the story-jobs queue also closes the stage-jobs queue", () => {
    const storyCloses = countCalls(source, "closeVerticalDramaStoryJobsQueue");
    // Guard: if this ever hits 0 the pairing assertion below would pass
    // vacuously — fail loudly instead so the test gets re-anchored.
    expect(storyCloses).toBeGreaterThanOrEqual(1);
    expect(
      countCalls(source, "closeVerticalDramaEpisodeStageJobsQueue")
    ).toBeGreaterThanOrEqual(storyCloses);
  });
});
