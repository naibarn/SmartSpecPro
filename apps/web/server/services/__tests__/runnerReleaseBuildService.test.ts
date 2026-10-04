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

import {
  getRunnerReleaseBuildStatus,
  listLatestDesktopRunnerDownloads,
  startRunnerReleaseBuild,
} from "../runnerReleaseBuildService";

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

  it("attaches a desktop build only to its matching GitHub workflow run", async () => {
    const build = {
      ...failedBuild,
      id: "desktop-build-0.2.9",
      workflow: "runner-desktop-release.yml",
      version: "0.2.9",
      releaseId: "0.2.9-desktop",
      status: "queued",
      publish: false,
      syncStatus: "idle",
      syncError: null,
      updatedAt: new Date("2026-10-03T16:00:00.000Z"),
    };
    const updatedBuild = {
      ...build,
      status: "in_progress",
      workflowRunId: "52",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/52",
    };
    const update = vi.fn(() => ({
      where: () => ({ returning: async () => [updatedBuild] }),
    }));
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [build] }) }) }),
      update: () => ({ set: update }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      workflow_runs: [
        { id: 53, html_url: "https://github.com/naibarn/SmartSpecPro/actions/runs/53", status: "completed", conclusion: "success", head_sha: "stale", display_title: "SmartAIHub Runner desktop 0.2.8 · old-build" },
        { id: 52, html_url: "https://github.com/naibarn/SmartSpecPro/actions/runs/52", status: "in_progress", conclusion: null, head_sha: "current", display_title: `SmartAIHub Runner desktop 0.2.9 · ${build.id}-${build.updatedAt.getTime()}` },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await getRunnerReleaseBuildStatus(build.id);

    expect(result).toMatchObject({ id: build.id, status: "in_progress", workflowRunId: "52" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ workflowRunId: "52" }));
  });

  it("returns the five most recent Desktop versions with available platform artifacts", async () => {
    const builds = ["0.2.10", "0.2.9", "0.2.8", "0.2.7", "0.2.6", "0.2.5"].map((version, index) => ({
      ...failedBuild,
      id: `desktop-build-${version}`,
      repository: "naibarn/SmartSpecPro",
      workflow: "runner-desktop-release.yml",
      workflowRunId: `${500 + index}`,
      version,
      platform: "all",
      status: "completed",
      publish: false,
      createdAt: new Date(Date.UTC(2026, 9, 4 - index)),
    }));
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => builds }),
          }),
        }),
      }),
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const runId = String(input).match(/actions\/runs\/(\d+)\/artifacts/)?.[1] ?? "0";
      const version = builds.find(build => build.workflowRunId === runId)?.version ?? "unknown";
      const artifacts = ["windows-x64", "macos-universal"].map((platform, index) => ({
        id: Number(runId) * 10 + index,
        name: `smartaihub-runner-${platform}-${version}-unsigned-review`,
        size_in_bytes: 1024,
        expired: false,
        expires_at: "2027-01-02T00:00:00.000Z",
      }));
      return new Response(JSON.stringify({ artifacts }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await listLatestDesktopRunnerDownloads();

    expect(result.downloads).toHaveLength(10);
    expect([...new Set(result.downloads.map(download => download.version))])
      .toEqual(["0.2.10", "0.2.9", "0.2.8", "0.2.7", "0.2.6"]);
    expect(result.downloads.filter(download => download.version === "0.2.10").map(download => download.platform))
      .toEqual(["windows", "macos"]);
  });
});
