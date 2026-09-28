import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInternalUrl, mockRunnerControlPlaneOrigin, mockToken } = vi.hoisted(() => ({
  mockInternalUrl: vi.fn(() => "http://smartspec-web:3000"),
  mockRunnerControlPlaneOrigin: vi.fn(() => "https://smartaihub.app"),
  mockToken: vi.fn(() => "internal-token"),
}));

vi.mock("../appRuntimeConfig", () => ({
  getCachedInternalNodeUrl: mockInternalUrl,
  getCachedRunnerControlPlaneOrigin: mockRunnerControlPlaneOrigin,
  getCachedPreferredInternalToken: mockToken,
}));

import { dispatchRunnerJobCommand } from "../runnerJobCommandClient";

function command(controlPlaneOrigin = "https://smartaihub.app") {
  return {
    commandId: "command-p213-origin",
    commandType: "execute" as const,
    contractVersion: "runner-job-v1" as const,
    jobId: "job-p213-origin",
    attempt: 1,
    leaseId: "lease:job-p213-origin:attempt-p213-origin",
    fencingToken: 1,
    tenantId: "tenant-p213",
    userId: 109,
    runnerId: "runner-p213",
    runnerSessionId: "session-p213",
    capabilitySnapshotId: "snapshot-p213",
    capabilitySnapshotRevision: "revision-p213",
    controlPlaneOrigin,
    executionKind: "computer_use.browser" as const,
    adapterId: "browser.v1" as const,
    adapterVersionConstraint: "0.1.0",
    browserEngineConstraint: "chromium",
    idempotencyKey: "computer-use:job-p213-origin:1",
    deadline: "2099-01-01T00:00:00.000Z",
    authorizationGrantRef: "runner-auth:sha256:grant",
    inputRef: "runner-input:job-p213-origin:attempt-p213-origin",
    payload: { stage: "observe" },
  };
}

describe("Runner command dispatch origin boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the internal gateway for dispatch while fencing against the public control-plane origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "accepted",
      commandId: "command-p213-origin",
      runnerId: "runner-p213",
      runnerSessionId: "session-p213",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(dispatchRunnerJobCommand(command())).resolves.toMatchObject({ status: "accepted" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://smartspec-web:3000/api/internal/runners/runner-p213/job-command",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails closed when a command still carries the local origin", async () => {
    await expect(dispatchRunnerJobCommand(command("http://localhost:3000")))
      .rejects.toThrow("RUNNER_CONTROL_PLANE_MISMATCH");
  });
});
