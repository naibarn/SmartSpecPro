import { describe, expect, it, vi } from "vitest";
import {
  RunnerContainerLifecycle,
  buildRunnerContainerEnvironment,
  buildRunnerContainerManifest,
  runnerContainerInstanceId,
  validateRunnerContainerAssignment,
} from "./runnerContainer";

const assignment = {
  envelope: {
    job_id: "job-1",
    attempt_id: "attempt-1",
    contract_version: "feature-205-v1",
    business_attempt: 1,
    dispatch_id: "dispatch-1",
    dedupe_key: "job-1:1",
    routing_metadata: { tenantId: "tenant-1" },
  },
  tenantId: "tenant-1",
  attemptId: "attempt-1",
  leaseId: "lease-1",
  fencingVersion: 1,
  workspaceRef: "workspace:job-1",
  artifactRefs: ["artifact/job-1/input"],
  resourceProfile: "medium" as const,
};

describe("runner container boundary", () => {
  it("requires canonical tenant/job scope and rejects signed URLs", () => {
    expect(validateRunnerContainerAssignment(assignment)).toMatchObject({
      tenantId: "tenant-1",
    });
    expect(() =>
      validateRunnerContainerAssignment({
        ...assignment,
        artifactRefs: ["https://signed.invalid/input"],
      }),
    ).toThrow("RUNNER_CONTAINER_ARTIFACT_SCOPE_INVALID");
    expect(() =>
      validateRunnerContainerAssignment({
        ...assignment,
        tenantId: "tenant-2",
      }),
    ).toThrow("RUNNER_CONTAINER_TENANT_SCOPE_INVALID");
  });

  it("builds a pinned manifest without adding a scheduler", () => {
    expect(
      buildRunnerContainerManifest({
        resourceProfile: "small",
        imageDigest: `sha256:${"a".repeat(64)}`,
        contractVersion: "feature-205-v1",
      }),
    ).toMatchObject({
      entrypoint: "smartaihub-runner",
      command: ["smartaihub-runner", "run"],
      healthSignal: "/health/runner",
    });
    expect(() =>
      buildRunnerContainerManifest({
        resourceProfile: "small",
        imageDigest: "latest",
        contractVersion: "feature-205-v1",
      }),
    ).toThrow("RUNNER_CONTAINER_IMAGE_DIGEST_INVALID");
  });

  it("uses an assignment-scoped entrypoint and keeps lifecycle cleanup explicit", async () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      HYPERDRIVE: { connectionString: "postgres://test" },
      JOB_CONTAINERS: {
        start: vi.fn(async ({ instanceId }: { instanceId: string }) => {
          starts.push(instanceId);
          return { id: instanceId, status: "running" };
        }),
        find: vi.fn(async () => ({ status: "terminated" })),
        stop: vi.fn(async (instanceId: string) => {
          stops.push(instanceId);
        }),
      },
    };
    const runnerId = "container-runner-1";
    expect(runnerContainerInstanceId(assignment)).toBe("runner:job-1:attempt-1");
    expect(buildRunnerContainerEnvironment({ ...assignment, runnerId })).toEqual({
      SAH_RUNNER_PROFILE: "shared_container",
      SAH_RUNNER_ID: runnerId,
      SAH_RUNNER_JOB_ID: "job-1",
      SAH_RUNNER_ATTEMPT_ID: "attempt-1",
      SAH_RUNNER_LEASE_ID: "lease-1",
    });
    const lifecycle = new RunnerContainerLifecycle(env, assignment);
    expect((await lifecycle.start()).state).toBe("running");
    expect((await lifecycle.reconcile()).restarted).toBe(true);
    expect((await lifecycle.release()).state).toBe("released");
    expect(starts).toEqual(["runner:job-1:attempt-1", "runner:job-1:attempt-1"]);
    expect(stops).toEqual(["runner:job-1:attempt-1"]);
  });
});
