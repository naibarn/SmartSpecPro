import { describe, expect, it, vi } from "vitest";

const { createControlPlaneJob } = vi.hoisted(() => ({ createControlPlaneJob: vi.fn(async (input: any) => ({ jobId: input.createOptions.canonicalJobId, created: true })) }));
vi.mock("../jobControlPlaneGateway", () => ({ createControlPlaneJob: (input: unknown) => createControlPlaneJob(input) }));

import { createDeveloperFastLaneJob, DEVELOPER_FAST_LANE_CONTRACT, DEVELOPER_FAST_LANE_JOB } from "../spec224DeveloperFastLane";
import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";

const request = {
  developerLogin: "dev-user",
  sourceRevision: "a".repeat(40),
  task: "Implement one scoped change",
  allowedFiles: ["apps/web/server/a.ts", "apps/web/server/a.test.ts"],
  writableFiles: ["apps/web/server/a.ts"],
  tests: { runner: "vitest" as const, cwd: "apps/web", paths: ["apps/web/server/a.test.ts"] },
  acceptanceCriteria: ["The focused test passes"],
};

describe("SPEC-224 authenticated Developer Fast Lane registration", () => {
  it("creates one actor/tenant-bound canonical Node job without Protected Runner routing", async () => {
    const result = await createDeveloperFastLaneJob({ tenantId: "tenant-one", actorId: 42, idempotencyKey: "fast-lane-key-0001", request });
    const input = createControlPlaneJob.mock.calls.at(-1)![0];
    expect(result.jobId).toBe(result.workerJobId);
    expect(input.context).toMatchObject({ tenantId: "tenant-one", actorType: "user", actorId: 42, authorizationScope: "spec224.developer.fast_lane" });
    expect(input.definition).toMatchObject({ jobType: DEVELOPER_FAST_LANE_JOB, contractVersion: DEVELOPER_FAST_LANE_CONTRACT, executionClass: "long" });
    expect(input.createOptions).toMatchObject({ runtimeType: "node_job_worker", canonicalJobId: result.workerJobId });
    expect(input.definition.input.developerWorkUnit).toMatchObject({ workerJobId: result.workerJobId, tenantId: "tenant-one", actorId: 42, runId: result.runId });
    expect(defaultJobExecutorRegistry.resolve(DEVELOPER_FAST_LANE_JOB, DEVELOPER_FAST_LANE_CONTRACT)).toBeDefined();
    expect(POSTGRES_NODE_JOB_TYPES.has(DEVELOPER_FAST_LANE_JOB)).toBe(true);
    expect(input.definition.requiredCapabilities).toBeUndefined();
  });

  it("fails invalid WorkUnit paths and budgets before job creation", async () => {
    await expect(createDeveloperFastLaneJob({ tenantId: "tenant-one", actorId: 42, idempotencyKey: "fast-lane-key-0002", request: { ...request, writableFiles: ["../outside.ts"] } })).rejects.toThrow("DEVELOPER_FAST_LANE_SCOPE_INVALID");
    await expect(createDeveloperFastLaneJob({ tenantId: "tenant-one", actorId: 42, idempotencyKey: "fast-lane-key-0003", request: { ...request, budget: { implementationMaxTurns: 31, planMaxTurns: 4, reviewMaxTurns: 4 } } })).rejects.toThrow("DEVELOPER_FAST_LANE_TURN_BUDGET_INVALID");
  });
});
