import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listDesktopReleaseCatalogMock = vi.hoisted(() => vi.fn());
const getDesktopReleaseConfigMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const persistDesktopReleaseUploadMock = vi.hoisted(() => vi.fn());

type SystemSettingRow = {
  id: number;
  category: string;
  key: string;
  valueJson: Record<string, any>;
  isSensitive: boolean | null;
  updatedAt: Date;
};

const systemSettingsRows: SystemSettingRow[] = [];

function createSystemSettingsQueryResult(rows: SystemSettingRow[]) {
  const sortedRows = [...rows].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  const builder = {
    where: () => builder,
    orderBy: () => builder,
    limit: async (limit: number) => sortedRows.slice(0, limit).map((row) => ({ ...row })),
    then: <TResult1 = SystemSettingRow[], TResult2 = never>(
      resolve?: ((value: SystemSettingRow[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(sortedRows.map((row) => ({ ...row }))).then(resolve, reject),
  };
  return builder;
}

const dbMock = {
  select: vi.fn(() => ({
    from: () => createSystemSettingsQueryResult(systemSettingsRows),
  })),
  insert: vi.fn(() => ({
    values: async () => undefined,
  })),
  update: vi.fn(() => ({
    set: () => ({
      where: async () => undefined,
    }),
  })),
};

vi.mock("../desktopReleaseService", () => ({
  listDesktopReleaseCatalog: listDesktopReleaseCatalogMock,
  persistDesktopReleaseUpload: persistDesktopReleaseUploadMock,
}));

vi.mock("../desktopReleaseSettings", () => ({
  DESKTOP_RELEASE_SETTINGS_CATEGORY: "desktop_release",
  getDesktopReleaseConfig: getDesktopReleaseConfigMock,
}));

vi.mock("../../db", () => ({
  getDb: getDbMock,
}));

import {
  buildDesktopReleaseFromGithubAction,
  buildPersistedDesktopReleaseBuildJobStateFromRow,
  fetchGithubRelease,
  getDesktopReleaseBuildRunStatus,
  listDesktopReleaseBuildHistory,
  suggestDesktopReleaseBuildVersion,
} from "../desktopReleaseBuildService";

describe("desktopReleaseBuildService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    listDesktopReleaseCatalogMock.mockReset();
    getDesktopReleaseConfigMock.mockReset();
    getDbMock.mockReset();
    persistDesktopReleaseUploadMock.mockReset();
    systemSettingsRows.splice(0, systemSettingsRows.length);

    listDesktopReleaseCatalogMock.mockResolvedValue({
      generatedAt: "2026-04-09T10:00:00.000Z",
      releases: [
        {
          version: "0.1.0",
        },
      ],
    });
    getDesktopReleaseConfigMock.mockResolvedValue({
      githubRepository: "naibarn/SmartSpecPro",
      githubRepositorySource: "db",
      githubWorkflow: "desktop-release.yml",
      githubWorkflowSource: "db",
      githubRef: "main",
      githubRefSource: "db",
      githubToken: "ghp_test_token",
      githubTokenConfigured: true,
      githubTokenSource: "db",
    });
    getDbMock.mockReturnValue(dbMock);
    dbMock.select.mockClear();
    dbMock.insert.mockClear();
    dbMock.update.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("suggests the next patch version from the current catalog", async () => {
    await expect(suggestDesktopReleaseBuildVersion()).resolves.toBe("0.1.1");
  });

  it("dispatches a GitHub workflow build with normalized inputs", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);

      if (href.endsWith("/dispatches")) {
        return new Response("", { status: 200 });
      }

      if (href.includes("/runs")) {
      return new Response(
        JSON.stringify({
          workflow_runs: [
            {
                id: 123,
                html_url: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
                created_at: new Date().toISOString(),
                head_branch: "main",
                event: "workflow_dispatch",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    });

    const result = await buildDesktopReleaseFromGithubAction({
      version: undefined,
      platform: "windows",
      bundleMode: "e2b",
      releaseNotes: "  Ship the build with fixes.  ",
    });

    expect(result.version).toBe("0.1.1");
    expect(result.platform).toBe("windows");
    expect(result.bundleMode).toBe("e2b");
    expect(result.releaseNotes).toBe("Ship the build with fixes.");
    expect(result.workflowRunId).toBe("123");
    expect(result.workflowRunUrl).toBe("https://github.com/naibarn/SmartSpecPro/actions/runs/123");

    expect(fetchMock).toHaveBeenCalled();
    const dispatchCall = fetchMock.mock.calls.find(([href]) => String(href).endsWith("/dispatches"));
    expect(dispatchCall).toBeTruthy();
    const dispatchInit = dispatchCall?.[1] as RequestInit | undefined;
    const dispatchBody = JSON.parse(String(dispatchInit?.body ?? "{}")) as {
      ref?: string;
      inputs?: Record<string, string>;
    };

    expect(dispatchBody.ref).toBe("main");
    expect(dispatchBody.inputs).toEqual(
      expect.objectContaining({
        tag: "v0.1.1",
        platform: "windows",
        bundle_mode: "e2b",
      }),
    );
  });

  it("lists persisted build history entries", async () => {
    const rawRow = {
      key: "build_job:123",
      valueJson: {
        workflowRunId: "123",
        repository: "naibarn/SmartSpecPro",
        workflow: "desktop-release.yml",
        ref: "main",
        queuedAt: "2026-04-09T10:00:00.000Z",
        workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
        workflowRunStatus: "completed",
        workflowRunConclusion: "success",
        workflowRunUpdatedAt: "2026-04-09T10:05:00.000Z",
        version: "0.1.1",
        platform: "windows",
        bundleMode: "on-demand",
        releaseNotes: "Ship fixes",
        requestedByUserId: 42,
        uploadedPlatforms: ["windows"],
        portalSyncStatus: "completed",
        portalSyncUpdatedAt: "2026-04-09T10:06:00.000Z",
        portalSyncError: null,
        portalSyncAttempts: 1,
      },
      updatedAt: new Date("2026-04-09T10:07:00.000Z"),
    };

    expect(buildPersistedDesktopReleaseBuildJobStateFromRow(rawRow)).toEqual(
      expect.objectContaining({
        workflowRunId: "123",
        repository: "naibarn/SmartSpecPro",
        workflow: "desktop-release.yml",
        workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
        ref: "main",
        version: "0.1.1",
        portalSyncStatus: "completed",
        uploadedPlatforms: ["windows"],
      }),
    );
  });

  it("falls back to the release list when GitHub does not expose a draft release by tag", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);

      if (href.includes("/releases/tags/v0.1.3")) {
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      if (href.includes("/releases?per_page=50")) {
        return new Response(
          JSON.stringify([
            {
              id: 987,
              tag_name: "v0.1.3",
              html_url: "https://github.com/naibarn/SmartSpecPro/releases/tag/untagged-test",
              draft: true,
              prerelease: false,
              body: "Smart AI Hub - Alpha Version 0.1.3",
              created_at: "2026-04-10T01:20:00.000Z",
              updated_at: "2026-04-10T01:25:00.000Z",
              assets: [],
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    });

    await expect(fetchGithubRelease("naibarn/SmartSpecPro", "ghp_test_token", "v0.1.3")).resolves.toEqual(
      expect.objectContaining({
        id: 987,
        tag_name: "v0.1.3",
        draft: true,
      }),
    );
  });

  it("resets portal sync state back to idle while the workflow is still running", async () => {
    systemSettingsRows.push({
      id: 1,
      category: "desktop_release",
      key: "build_job:123",
      valueJson: {
        workflowRunId: "123",
        repository: "naibarn/SmartSpecPro",
        workflow: "desktop-release.yml",
        ref: "main",
        queuedAt: "2026-04-10T01:00:00.000Z",
        workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
        workflowRunStatus: "completed",
        workflowRunConclusion: "success",
        workflowRunUpdatedAt: "2026-04-10T01:05:00.000Z",
        version: "0.1.3",
        platform: "windows",
        bundleMode: "e4b",
        releaseNotes: "Smart AI Hub - Alpha Version 0.1.3",
        requestedByUserId: 1,
        uploadedPlatforms: [],
        portalSyncStatus: "syncing",
        portalSyncUpdatedAt: "2026-04-10T01:06:00.000Z",
        portalSyncError: "desktop_release_github_release_not_ready",
        portalSyncAttempts: 22,
      },
      isSensitive: false,
      updatedAt: new Date("2026-04-10T01:07:00.000Z"),
    });

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);

      if (href.includes("/actions/runs/123")) {
        return new Response(
          JSON.stringify({
            id: 123,
            html_url: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
            status: "in_progress",
            conclusion: null,
            updated_at: "2026-04-10T01:19:47.000Z",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    });

    await expect(getDesktopReleaseBuildRunStatus("123")).resolves.toMatchObject({
      workflowRunStatus: "in_progress",
      workflowRunConclusion: null,
      portalSyncStatus: "idle",
      portalSyncError: null,
      portalSyncAttempts: null,
    });
  });

  it("deduplicates persisted build history rows by workflow run id", async () => {
    systemSettingsRows.push(
      {
        id: 10,
        category: "desktop_release",
        key: "build_job:24221542982",
        valueJson: {
          workflowRunId: "24221542982",
          repository: "naibarn/SmartSpecPro",
          workflow: "desktop-release.yml",
          ref: "main",
          queuedAt: "2026-04-10T01:19:39.994Z",
          workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/24221542982",
          workflowRunStatus: "completed",
          workflowRunConclusion: "success",
          workflowRunUpdatedAt: "2026-04-10T01:34:21.000Z",
          version: "0.1.3",
          platform: "windows",
          bundleMode: "e4b",
          releaseNotes: "Smart AI Hub - Alpha Version 0.1.3",
          requestedByUserId: 1,
          uploadedPlatforms: ["windows"],
          portalSyncStatus: "completed",
          portalSyncUpdatedAt: "2026-04-10T01:41:25.260Z",
          portalSyncError: null,
          portalSyncAttempts: 72,
        },
        isSensitive: false,
        updatedAt: new Date("2026-04-10T01:41:25.268Z"),
      },
      {
        id: 9,
        category: "desktop_release",
        key: "build_job:24221542982",
        valueJson: {
          workflowRunId: "24221542982",
          repository: "naibarn/SmartSpecPro",
          workflow: "desktop-release.yml",
          ref: "main",
          queuedAt: "2026-04-10T01:19:39.994Z",
          workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/24221542982",
          workflowRunStatus: "in_progress",
          workflowRunConclusion: null,
          workflowRunUpdatedAt: "2026-04-10T01:19:47.000Z",
          version: "0.1.3",
          platform: "windows",
          bundleMode: "e4b",
          releaseNotes: "Smart AI Hub - Alpha Version 0.1.3",
          requestedByUserId: 1,
          uploadedPlatforms: [],
          portalSyncStatus: "syncing",
          portalSyncUpdatedAt: "2026-04-10T01:30:46.493Z",
          portalSyncError: "{\"message\":\"Not Found\",\"status\":\"404\"}",
          portalSyncAttempts: 44,
        },
        isSensitive: false,
        updatedAt: new Date("2026-04-10T01:30:46.496Z"),
      },
    );

    await expect(listDesktopReleaseBuildHistory({ limit: 8 })).resolves.toEqual([
      expect.objectContaining({
        workflowRunId: "24221542982",
        workflowRunStatus: "completed",
        portalSyncStatus: "completed",
      }),
    ]);
  });

  it("clears stale portal sync errors after the workflow has completed successfully", async () => {
    systemSettingsRows.push({
      id: 11,
      category: "desktop_release",
      key: "build_job:24221542982",
      valueJson: {
        workflowRunId: "24221542982",
        repository: "naibarn/SmartSpecPro",
        workflow: "desktop-release.yml",
        ref: "main",
        queuedAt: "2026-04-10T01:19:39.994Z",
        workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/24221542982",
        workflowRunStatus: "completed",
        workflowRunConclusion: "success",
        workflowRunUpdatedAt: "2026-04-10T01:34:21.000Z",
        version: "0.1.3",
        platform: "windows",
        bundleMode: "e4b",
        releaseNotes: "Smart AI Hub - Alpha Version 0.1.3",
        requestedByUserId: 1,
        uploadedPlatforms: ["windows"],
        portalSyncStatus: "completed",
        portalSyncUpdatedAt: "2026-04-10T01:41:25.260Z",
        portalSyncError: "{\"message\":\"Not Found\",\"status\":\"404\"}",
        portalSyncAttempts: 72,
      },
      isSensitive: false,
      updatedAt: new Date("2026-04-10T01:41:25.268Z"),
    });

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);

      if (href.includes("/actions/runs/24221542982")) {
        return new Response(
          JSON.stringify({
            id: 24221542982,
            html_url: "https://github.com/naibarn/SmartSpecPro/actions/runs/24221542982",
            status: "completed",
            conclusion: "success",
            updated_at: "2026-04-10T01:34:21.000Z",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    });

    await expect(getDesktopReleaseBuildRunStatus("24221542982")).resolves.toMatchObject({
      workflowRunStatus: "completed",
      workflowRunConclusion: "success",
      portalSyncStatus: "completed",
      portalSyncError: null,
      portalSyncAttempts: 72,
    });
  });
});
