import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPythonUrl, mockToken, mockFetch } = vi.hoisted(() => ({
  mockPythonUrl: vi.fn(),
  mockToken: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../appRuntimeConfig", () => ({
  getCachedPythonBackendUrl: mockPythonUrl,
  getCachedPreferredInternalToken: mockToken,
}));

import { createP213ApprovalRequest } from "../p213ApprovalGateway";

const input = {
  jobId: "job-p213",
  tenantId: "tenant-p213",
  requesterId: 109,
  approvalDescriptor: {
    purpose: "p213_certification" as const,
    fixture: "approval_required" as const,
    riskClass: "explicit_approval_test" as const,
    issuedBy: "server" as const,
    tenantId: "tenant-p213",
    requesterId: 109,
    projectRef: "p213-certification",
  },
  operationKey: "computer-use:job-p213:1",
  runnerId: "runner-p213",
  runnerSessionId: "session-p213",
  capabilitySnapshotId: "snapshot-p213",
  capabilitySnapshotRevision: "revision-p213",
  fencingVersion: 4,
  actionId: "semantic-action:sha256:action",
  actionDescription: "click button:Continue",
  actionDigest: "decision:sha256:action",
  domFingerprint: "observation:sha256:dom",
  correlationKey: "p213:job-p213:semantic-action:sha256:action",
};

describe("P213 Approval Service gateway", () => {
  beforeEach(() => {
    mockPythonUrl.mockReset();
    mockToken.mockReset();
    mockFetch.mockReset();
    vi.stubEnv("P213_CERTIFICATION_MODE", "true");
    vi.stubEnv("P213_CERTIFICATION_TENANT_ID", "tenant-p213");
    vi.stubEnv("P213_CERTIFICATION_REQUESTER_USER_ID", "109");
    vi.stubEnv("P213_CERTIFICATION_APPROVER_USER_ID", "1");
    vi.stubEnv("P213_CERTIFICATION_PROJECT_REF", "p213-certification");
    vi.stubGlobal("fetch", mockFetch);
    mockToken.mockReturnValue("gateway-secret");
  });

  it("fails closed instead of falling back to localhost", async () => {
    mockPythonUrl.mockReturnValue("http://localhost:8000");
    await expect(createP213ApprovalRequest(input)).rejects.toThrow("P213_APPROVAL_GATEWAY_DOMAIN_REQUIRED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the server-bound approval marker to the remote Approval Service", async () => {
    mockPythonUrl.mockReturnValue("https://api.smartaihub.app/");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        approvalRequestId: "approval-p213",
        status: "pending",
        correlationKey: input.correlationKey,
      }),
    });

    await expect(createP213ApprovalRequest(input)).resolves.toEqual({
      approvalRequestId: "approval-p213",
      status: "pending",
      correlationKey: input.correlationKey,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.smartaihub.app/api/v1/approvals/internal/p213/requests",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-internal-token": "gateway-secret" }),
        body: expect.stringContaining('"issuedBy"'),
      }),
    );
  });
});
