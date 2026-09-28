import { describe, expect, it } from "vitest";
import { getCanonicalWorkerJobsPath, LEGACY_RENDER_JOBS_ROUTE, WORKER_JOBS_ROUTE } from "../workerJobsRoute";

describe("Worker Jobs route migration", () => {
  it("uses the canonical route and keeps legacy route as a named compatibility surface", () => {
    expect(WORKER_JOBS_ROUTE).toBe("/worker-jobs");
    expect(LEGACY_RENDER_JOBS_ROUTE).toBe("/render-jobs");
  });

  it("preserves queue deep-link query context", () => {
    expect(getCanonicalWorkerJobsPath("?jobId=j1&status=running")).toBe("/worker-jobs?jobId=j1&status=running");
    expect(getCanonicalWorkerJobsPath("jobId=j1")).toBe("/worker-jobs?jobId=j1");
    expect(getCanonicalWorkerJobsPath()).toBe("/worker-jobs");
  });

  it("marks legacy redirects without dropping existing filters", () => {
    expect(getCanonicalWorkerJobsPath("?jobId=j1&status=running", { legacyAlias: true })).toBe("/worker-jobs?jobId=j1&status=running&legacyAlias=render-jobs");
  });
});
