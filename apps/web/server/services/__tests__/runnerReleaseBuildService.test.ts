import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
const getDesktopReleaseConfigMock = vi.hoisted(() => vi.fn());
const persistRunnerReleaseAssetFromPathMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: getDbMock,
}));

vi.mock("../desktopReleaseSettings", () => ({
  getDesktopReleaseConfig: getDesktopReleaseConfigMock,
}));

vi.mock("../runnerReleaseService", () => ({
  persistRunnerReleaseAssetFromPath: persistRunnerReleaseAssetFromPathMock,
  RunnerReleaseError: class RunnerReleaseError extends Error {},
}));

import { startRunnerReleaseBuild } from "../runnerReleaseBuildService";

const failedBuild = {
  id: "build-0.2.0",
  repository: "naibarn/SmartSpecPro",
  workflow: "runner-release.yml",
  ref: "main",
  version: "0.2.0",
  platform: "windows",
  profile: "all",
  releaseId: "0.2.0",
  releaseNotes: "old attempt",
  workflowRunId: null,
  workflowRunUrl: null,
  status: "failed",
  syncStatus: "idle",
  syncError: "github_dispatch_failed",
  requestedBy: 1,
  publish: true,
  createdAt: new Date("2026-09-22T00:14:03.627Z"),
  updatedAt: new Date("2026-09-22T00:14:05.721Z"),
};

describe("runnerReleaseBuildService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    getDesktopReleaseConfigMock.mockResolvedValue({
      githubRepository: "naibarn/SmartSpecPro",
      runnerGithubWorkflow: "runner-release.yml",
      githubToken: "test-token",
      githubTokenConfigured: true,
    });
    persistRunnerReleaseAssetFromPathMock.mockReset();
  });

  it("reuses a failed release row when retrying the same release id", async () => {
    const update = vi.fn((values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => [{ ...failedBuild, ...values }],
      }),
    }));
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [failedBuild],
          }),
        }),
      }),
      insert: vi.fn(() => {
        throw new Error("retry must not insert a duplicate release id");
      }),
      update: vi.fn(() => ({
        set: update,
      })),
    };
    getDbMock.mockReturnValue(db);

    const result = await startRunnerReleaseBuild(
      {
        version: "0.2.0",
        releaseId: "0.2.0",
        ref: "main",
        platform: "windows",
        profile: "all",
        releaseNotes: "retry build",
        publish: true,
        signingMode: "required-secret",
      },
      1,
    );

    expect(result).toMatchObject({
      id: failedBuild.id,
      releaseId: "0.2.0",
      status: "queued",
      syncStatus: "idle",
      syncError: null,
      workflowRunId: null,
      workflowRunUrl: null,
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "queued",
      syncStatus: "idle",
      syncError: null,
      workflowRunId: null,
      workflowRunUrl: null,
      releaseNotes: "retry build",
    }));
  });

  it("records a failed retry without masking the dispatch error", async () => {
    const update = vi.fn((values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => [{ ...failedBuild, ...values }],
      }),
    }));
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [failedBuild],
          }),
        }),
      }),
      update: vi.fn(() => ({
        set: update,
      })),
    };
    getDbMock.mockReturnValue(db);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("dispatch unavailable")));

    await expect(startRunnerReleaseBuild(
      {
        version: "0.2.0",
        releaseId: "0.2.0",
        ref: "main",
        platform: "windows",
        profile: "all",
        releaseNotes: "retry build",
        publish: true,
        signingMode: "required-secret",
      },
      1,
    )).rejects.toThrow("dispatch unavailable");

    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "failed",
      syncError: "github_dispatch_failed",
    }));
  });
});
