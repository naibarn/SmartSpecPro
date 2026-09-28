import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateControlPlaneJob, mockGetStatus } = vi.hoisted(() => ({
  mockCreateControlPlaneJob: vi.fn(),
  mockGetStatus: vi.fn(),
}));

vi.mock("../jobControlPlaneGateway", () => ({
  createControlPlaneJob: mockCreateControlPlaneJob,
}));
vi.mock("../runnerGateway", () => ({
  defaultRunnerGateway: { getStatus: mockGetStatus },
}));

import { createCanonicalComputerUseBrowserJob } from "../computerUseFeature195Gateway";

const context = { tenantId: "tenant-p213", user: { id: 109 } } as any;

function readyNode() {
  return {
    runnerId: "runner-p213",
    tenantId: "tenant-p213",
    ownerUserId: 109,
    profile: "local_device",
    nodeKind: "local_device",
    deviceId: "device-p213",
    displayName: "P213 Runner",
    trustState: "trusted",
    status: "online",
    currentSnapshotRevision: "snapshot-revision-1",
    activeSessionId: "session-p213",
    revokedAt: null,
    currentSnapshot: {
      runnerId: "runner-p213",
      tenantId: "tenant-p213",
      runnerSessionId: "session-p213",
      capabilitySnapshotId: "snapshot-p213",
      revision: "snapshot-revision-1",
      observedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      computerUse: {
        browser: {
          availabilityState: "available",
          authState: "authenticated",
          probeState: "ready",
          reasonCodes: [],
          manifest: {
            runnerId: "runner-p213",
            runnerSessionId: "session-p213",
            capabilitySnapshotId: "snapshot-p213",
            authorizationEvidenceRef: "runner-auth:sha256:grant",
            supports: { structuredObservation: true },
          },
        },
      },
    },
  };
}

describe("P213 canonical Feature 195 producer", () => {
  beforeEach(() => {
    mockGetStatus.mockReset();
    mockCreateControlPlaneJob.mockReset();
  });

  it("resolves localRunner and admits one computer_use.browser worker job", async () => {
    mockGetStatus.mockResolvedValueOnce(readyNode());
    mockCreateControlPlaneJob.mockResolvedValueOnce({ jobId: "job-p213", created: true });

    const result = await createCanonicalComputerUseBrowserJob(context, {
      runnerId: "runner-p213",
      idempotencyKey: "p213-golden-1",
      operation: "observe",
      action: "none",
    });

    expect(result).toMatchObject({ jobId: "job-p213", route: "localRunner" });
    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      definition: expect.objectContaining({
        jobType: "computer_use.browser",
        executionClass: "external",
        input: expect.objectContaining({
          runnerSessionId: "session-p213",
          capabilitySnapshotId: "snapshot-p213",
          payload: expect.objectContaining({
            requiresIndependentVerification: true,
            decisionRequest: expect.objectContaining({
              requestedProvider: "rules",
              goal: "observe page",
            }),
          }),
        }),
      }),
    }));
    const admittedDefinition = mockCreateControlPlaneJob.mock.calls[0][0].definition;
    expect(admittedDefinition.input.payload).not.toHaveProperty("action");
    expect(admittedDefinition.input.payload).not.toHaveProperty("targetId");
    expect(admittedDefinition.input.payload).not.toHaveProperty("selector");
    expect(admittedDefinition.input.payload.decision).not.toEqual(expect.objectContaining({
      provider: "request-bound-candidate-v1",
    }));
    expect(admittedDefinition.input.payload).toEqual(expect.objectContaining({
      verification: expect.objectContaining({
        required: true,
        verifier: "spec208-independent-v1",
      }),
    }));
  });

  it("fails closed before worker_jobs admission when the snapshot is stale", async () => {
    const node = readyNode();
    node.currentSnapshot!.expiresAt = new Date(Date.now() - 1000).toISOString();
    mockGetStatus.mockResolvedValueOnce(node);

    await expect(createCanonicalComputerUseBrowserJob(context, {
      runnerId: "runner-p213",
      idempotencyKey: "p213-stale-1",
      operation: "observe",
      action: "none",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockCreateControlPlaneJob).not.toHaveBeenCalled();
  });

  it("keeps the certification success condition server-owned", async () => {
    vi.stubEnv("P213_CERTIFICATION_MODE", "true");
    vi.stubEnv("P213_CERTIFICATION_TENANT_ID", "tenant-p213");
    vi.stubEnv("P213_CERTIFICATION_REQUESTER_USER_ID", "109");
    vi.stubEnv("P213_CERTIFICATION_APPROVER_USER_ID", "1");
    vi.stubEnv("P213_CERTIFICATION_PROJECT_REF", "p213-certification");
    mockGetStatus.mockResolvedValueOnce(readyNode());
    mockCreateControlPlaneJob.mockResolvedValueOnce({ jobId: "job-p213-certified", created: true });

    await createCanonicalComputerUseBrowserJob(context, {
      runnerId: "runner-p213",
      idempotencyKey: "p213-certification-1",
      operation: "observe",
      action: "none",
    }, {
      certificationDescriptor: {
        purpose: "p213_certification",
        fixture: "approval_required",
        riskClass: "explicit_approval_test",
        issuedBy: "server",
        tenantId: "tenant-p213",
        requesterId: 109,
        projectRef: "p213-certification",
      },
      fixtureUrlOverride: "https://smartaihub.app/__p213/certification/approval-required",
      expectedSuccessCondition: { text: "Certification complete" },
    });

    const payload = mockCreateControlPlaneJob.mock.calls[0][0].definition.input.payload;
    expect(payload).toMatchObject({
      p213Certification: expect.objectContaining({ issuedBy: "server" }),
      fixtureUrl: "https://smartaihub.app/__p213/certification/approval-required",
      expectedSuccessCondition: { text: "Certification complete" },
    });
  });
});
