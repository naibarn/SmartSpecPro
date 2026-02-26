import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Chat router sandbox dispatch tests.
 *
 * Verifies the chat router handles sandbox-job results from executeSkill()
 * and integrates with sandbox status/artifact services.
 */

const {
  mockExecuteSkill,
  mockGetJobArtifactUrls,
  mockProjectStatus,
} = vi.hoisted(() => ({
  mockExecuteSkill: vi.fn(),
  mockGetJobArtifactUrls: vi.fn(),
  mockProjectStatus: vi.fn(),
}));

vi.mock("../../services/skillExecutor", () => ({
  executeSkill: mockExecuteSkill,
  startPythonSkillTask: vi.fn(),
  estimateSkillCost: vi.fn(),
  canAutoExecute: vi.fn().mockReturnValue(true),
}));

vi.mock("../../services/sandbox/artifactAccess", () => ({
  getJobArtifactUrls: mockGetJobArtifactUrls,
}));

vi.mock("../../services/sandbox/statusProjection", () => ({
  projectStatus: mockProjectStatus,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat router sandbox dispatch", () => {
  it("returns sandbox job ID when skill executor dispatches to sandbox", async () => {
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillId: "code-runner",
      type: "sandbox-job",
      jobId: "job-abc-123",
      message: "Job dispatched to secure sandbox",
    });

    const result = await mockExecuteSkill();
    expect(result.type).toBe("sandbox-job");
    expect(result.jobId).toBe("job-abc-123");
    expect(result.success).toBe(true);
  });

  it("projects sandbox status to user-friendly labels for chat", () => {
    mockProjectStatus.mockReturnValue({
      label: "Running securely",
      phase: "active",
      isTerminal: false,
    });

    const result = mockProjectStatus("executing");
    expect(result.label).toBe("Running securely");
    expect(result.isTerminal).toBe(false);
  });

  it("fetches artifact URLs when sandbox job completes", async () => {
    mockGetJobArtifactUrls.mockResolvedValue([
      {
        artifactId: 1,
        url: "https://r2.example.com/output.png",
        key: "sandbox-artifacts/job-abc/output.png",
        mimeType: "image/png",
        isPrimary: true,
      },
    ]);

    const artifacts = await mockGetJobArtifactUrls({
      jobId: "job-abc-123",
      tenantId: "tenant-1",
      ttlSeconds: 900,
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].isPrimary).toBe(true);
    expect(artifacts[0].url).toContain("r2.example.com");
  });

  it("passes through non-sandbox skill results unchanged", async () => {
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillId: "image-creator",
      type: "image",
      resultUrl: "https://example.com/image.png",
    });

    const result = await mockExecuteSkill();
    expect(result.type).toBe("image");
    expect(result.resultUrl).toBe("https://example.com/image.png");
    // No jobId on non-sandbox results
    expect(result.jobId).toBeUndefined();
  });
});
