import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTask = vi.fn();
const mockBuildCanonicalArtifactRef = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    getTask: (...args: unknown[]) => mockGetTask(...args),
  },
}));

vi.mock("../autoTeamArtifactRefService", () => ({
  buildCanonicalArtifactRef: (...args: unknown[]) =>
    mockBuildCanonicalArtifactRef(...args),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    update: mockDbUpdate,
    select: mockDbSelect,
  })),
}));

describe("autoTeamMediaExecutionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("canonicalizes successful polled media results before returning the job", async () => {
    const updateSetCalls: Array<Record<string, unknown>> = [];
    const baseJob = {
      id: "job-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      stageId: "stage-1",
      workItemId: "work-1",
      mediaType: "video",
      provider: "veo",
      model: "veo-3.1",
      providerTaskId: "task-1",
      providerStatus: "running",
      resultArtifactRefsJson: [],
      metadataJson: { routeClass: "media.video" },
    };

    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [baseJob],
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        updateSetCalls.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...baseJob, ...values }],
          }),
        };
      },
    });
    mockGetTask.mockResolvedValue({
      id: "task-1",
      taskId: "task-1",
      status: "completed",
      resultUrl: "https://cdn.example/final.mp4",
      resultData: { durationSeconds: 72 },
      model: "veo-3.1",
    });
    mockBuildCanonicalArtifactRef.mockResolvedValue({
      id: "artifact-1",
      safetyStatus: "safe",
      externalRef: "https://cdn.example/final.mp4",
    });

    const { pollMediaJob } = await import("../autoTeamMediaExecutionService");
    const result = await pollMediaJob({
      tenantId: "tenant-1",
      id: "job-1",
      provider: "veo",
      providerTaskId: "task-1",
      providerStatus: "running",
      userToken: "user-token",
    });

    expect(mockBuildCanonicalArtifactRef).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        stageId: "stage-1",
        workItemId: "work-1",
        artifactType: "media_result",
        artifactRole: "result",
        externalRef: "https://cdn.example/final.mp4",
        safetyStatus: "safe",
      }),
    );
    expect(updateSetCalls[0]).toMatchObject({
      providerStatus: "succeeded",
      resultArtifactRefsJson: ["artifact-1"],
      errorCode: null,
      errorMessage: null,
    });
    expect(updateSetCalls).toHaveLength(1);
    expect(JSON.stringify(updateSetCalls)).not.toContain("https://cdn.example/final.mp4");
    expect(result.resultArtifactRefsJson).toEqual(["artifact-1"]);
  });

  it("blocks tokenized media result URLs before persisting canonical artifacts", async () => {
    const updateSetCalls: Array<Record<string, unknown>> = [];
    const baseJob = {
      id: "job-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      stageId: "stage-1",
      workItemId: "work-1",
      mediaType: "video",
      provider: "veo",
      model: "veo-3.1",
      providerTaskId: "task-1",
      providerStatus: "running",
      resultArtifactRefsJson: [],
      metadataJson: { routeClass: "media.video" },
    };

    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [baseJob],
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        updateSetCalls.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...baseJob, ...values }],
          }),
        };
      },
    });
    mockGetTask.mockResolvedValue({
      id: "task-1",
      taskId: "task-1",
      status: "completed",
      resultUrl: "https://cdn.example/final.mp4?token=secret",
      resultData: { durationSeconds: 72 },
      model: "veo-3.1",
    });

    const { pollMediaJob } = await import("../autoTeamMediaExecutionService");
    const result = await pollMediaJob({
      tenantId: "tenant-1",
      id: "job-1",
      provider: "veo",
      providerTaskId: "task-1",
      providerStatus: "running",
      userToken: "user-token",
    });

    expect(mockBuildCanonicalArtifactRef).not.toHaveBeenCalled();
    expect(updateSetCalls[0]).toMatchObject({
      providerStatus: "failed",
      resultArtifactRefsJson: [],
      errorCode: "unsafe_output_detected",
      errorMessage: "sensitive_media_url_detected",
    });
    expect(result.resultArtifactRefsJson).toEqual([]);
    expect(JSON.stringify(updateSetCalls)).not.toContain("token=secret");
  });
});
