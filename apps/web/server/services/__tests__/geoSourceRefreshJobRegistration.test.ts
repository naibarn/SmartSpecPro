import { describe, expect, it, vi } from "vitest";

import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";
import {
  createGeoSourceRefreshJobExecutor,
  defaultJobExecutorRegistry,
} from "../jobExecutorRegistry";
import type { JobExecutor } from "../jobExecutor";
import type { GeoSourceRefreshPipelineDependencies } from "../geoSources/refreshPipeline";

const lease = { jobId: "job-geo-1", attemptId: "attempt-geo-1", fencingVersion: 1 };
const reporter = {
  assertActive: vi.fn(async () => undefined),
  heartbeat: vi.fn(async () => undefined),
};

function executorInput(input: unknown): Parameters<JobExecutor>[0] {
  return {
    context: {
      tenantId: "tenant-1",
      input,
    } as Parameters<JobExecutor>[0]["context"],
    lease,
    reporter: reporter as Parameters<JobExecutor>[0]["reporter"],
    controlPlane: {} as Parameters<JobExecutor>[0]["controlPlane"],
  };
}

const validEnvelope = {
  sourceId: "source-1",
  sourceRef: "rid-levels",
  configurationRevision: 2,
  adapterId: "rid-levels-v2",
  adapterVersion: "geo-source.v1",
  windowStart: "2026-10-02T00:00:00.000Z",
};

describe("geo.source.refresh canonical worker registration", () => {
  it("routes the admitted source refresh type through the same node worker and executor registry", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("geo.source.refresh")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve("geo.source.refresh", "feature-186-v1")).toMatchObject({
      executionClass: "long",
      jobType: "geo.source.refresh",
    });
  });

  it("fails closed when no server-owned approved runtime binding was configured", async () => {
    const executor = defaultJobExecutorRegistry.resolve("geo.source.refresh", "feature-186-v1")!.executor;

    await expect(executor(executorInput(validEnvelope))).rejects.toMatchObject({
      diagnosticCode: "GEO_SOURCE_REFRESH_RUNTIME_NOT_CONFIGURED",
      class: "permanent",
    });
  });

  it("passes only the canonical envelope plus fixed server-owned scope to the configured pipeline", async () => {
    const runPipeline = vi.fn(async () => ({
      ok: true as const,
      captureId: "capture-1",
      captureCreated: true,
      observationsInserted: 2,
      observationsReplayed: 1,
    }));
    const dependencies = {} as Omit<GeoSourceRefreshPipelineDependencies, "reporter">;
    const executor = createGeoSourceRefreshJobExecutor({
      purpose: "public-emergency",
      geography: "TH",
      dependencies,
      runPipeline,
    });

    await expect(executor(executorInput(validEnvelope))).resolves.toEqual({
      output: {
        captureId: "capture-1",
        captureCreated: true,
        observationsInserted: 2,
        observationsReplayed: 1,
      },
    });
    expect(runPipeline).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      purpose: "public-emergency",
      geography: "TH",
      lease,
      job: validEnvelope,
    }, {
      ...dependencies,
      reporter,
    });
  });

  it("rejects malformed payloads before a configured pipeline can fetch or persist", async () => {
    const runPipeline = vi.fn();
    const executor = createGeoSourceRefreshJobExecutor({
      purpose: "public-emergency",
      geography: "TH",
      dependencies: {} as Omit<GeoSourceRefreshPipelineDependencies, "reporter">,
      runPipeline,
    });

    await expect(executor(executorInput({ ...validEnvelope, sourceRef: "https://attacker.invalid" }))).rejects.toMatchObject({
      diagnosticCode: "GEO_SOURCE_REFRESH_JOB_INVALID",
      class: "permanent",
    });
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("does not convert a revoked or malformed pipeline result into a successful job", async () => {
    const executor = createGeoSourceRefreshJobExecutor({
      purpose: "public-emergency",
      geography: "TH",
      dependencies: {} as Omit<GeoSourceRefreshPipelineDependencies, "reporter">,
      runPipeline: async () => ({ ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" }),
    });

    await expect(executor(executorInput(validEnvelope))).rejects.toMatchObject({
      diagnosticCode: "GEO_SOURCE_REVOKED_OR_REVISED",
      class: "permanent",
    });
  });
});
