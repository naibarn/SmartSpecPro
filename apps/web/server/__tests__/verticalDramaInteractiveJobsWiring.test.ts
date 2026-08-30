/**
 * Regression guard for the shared Vertical Drama interactive BullMQ queue.
 * The service can exist and the router can enqueue jobs, but without startup
 * wiring the default enqueue path throws "queue is not initialized".
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CORE_INDEX_PATH = path.resolve(__dirname, "../_core/index.ts");
const INTERACTIVE_JOBS_SERVICE_PATH = path.resolve(
  __dirname,
  "../services/verticalDramaInteractiveJobs.ts"
);

const countCalls = (source: string, fnName: string): number =>
  (source.match(new RegExp(`${fnName}\\(\\)`, "g")) ?? []).length;

describe("vertical drama interactive jobs queue wiring", () => {
  const source = fs.readFileSync(CORE_INDEX_PATH, "utf-8");

  it("keeps the interactive jobs service available to the server entrypoint", () => {
    expect(fs.existsSync(INTERACTIVE_JOBS_SERVICE_PATH)).toBe(true);
    expect(source).toContain('from "../services/verticalDramaInteractiveJobs"');
    expect(source).toContain("initVerticalDramaInteractiveJobsQueue");
    expect(source).toContain("closeVerticalDramaInteractiveJobsQueue");
  });

  it("initializes the queue during startup", () => {
    expect(countCalls(source, "initVerticalDramaInteractiveJobsQueue")).toBe(1);
  });

  it("closes the queue in every graceful shutdown block", () => {
    expect(countCalls(source, "closeVerticalDramaStoryJobsQueue")).toBe(2);
    expect(countCalls(source, "closeVerticalDramaInteractiveJobsQueue")).toBe(
      2
    );
  });
});
