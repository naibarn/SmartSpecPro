/**
 * @vitest-environment jsdom
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type {
  DesktopReleaseBuildHistoryResponse,
  DesktopReleaseBuildResponse,
  DesktopReleaseBuildRunStatus,
} from "@shared/desktopReleaseBuilds";

const fetchMock = vi.hoisted(() => vi.fn());
const catalogState = vi.hoisted(() => ({
  catalog: {
    generatedAt: "2026-04-10T10:00:00.000Z",
    releases: [],
    latestByPlatform: {
      windows: null,
      macos: null,
      linux: null,
    },
  },
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) {
        return key;
      }
      return Object.entries(values).reduce(
        (message, [name, value]) => message.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
    locale: "en",
  }),
}));

vi.mock("../useDesktopReleaseCatalog", () => ({
  useDesktopReleaseCatalog: () => catalogState,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/confirm/ConfirmProvider", () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
}));

vi.stubGlobal("fetch", fetchMock);

import { DesktopReleasePanel } from "../DesktopReleasePanel";

const BUILD_SESSION_KEY = "smartaihub.desktop-release.build-session.v1";

function maybeHandleDashboardReleaseRequest(href: string): Response | null {
  if (href.includes("/companion-extension/latest")) {
    return new Response(JSON.stringify({ generatedAt: "2026-04-10T10:00:00.000Z", release: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  if (href.includes("/worker-app/latest")) {
    return new Response(JSON.stringify({ generatedAt: "2026-04-10T10:00:00.000Z", release: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  return null;
}

describe("DesktopReleasePanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    catalogState.refresh.mockReset();
  });

  it("rehydrates a persisted build and keeps polling until it completes", async () => {
    const storedBuildResult: DesktopReleaseBuildResponse = {
      repository: "naibarn/SmartSpecPro",
      workflow: "desktop-release.yml",
      ref: "main",
      version: "0.1.1",
      platform: "windows",
      bundleMode: "on-demand",
      releaseNotes: "Ship fixes",
      queuedAt: "2026-04-10T10:00:00.000Z",
      workflowRunId: "123",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
      workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
    };
    const storedBuildStatus: DesktopReleaseBuildRunStatus = {
      workflowRunId: "123",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
      workflowRunStatus: "in_progress",
      workflowRunConclusion: null,
      workflowRunUpdatedAt: "2026-04-10T10:01:00.000Z",
      portalSyncStatus: "idle",
      portalSyncUpdatedAt: null,
    };

    sessionStorage.setItem(
      BUILD_SESSION_KEY,
      JSON.stringify({
        buildResult: storedBuildResult,
        buildRunStatus: storedBuildStatus,
      }),
    );

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      const releaseResponse = maybeHandleDashboardReleaseRequest(href);
      if (releaseResponse) {
        return releaseResponse;
      }

      if (href.includes("/builds/123/status")) {
        return new Response(
          JSON.stringify({
            buildRun: {
              workflowRunId: "123",
              workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/123",
              workflowRunStatus: "completed",
              workflowRunConclusion: "success",
              workflowRunUpdatedAt: "2026-04-10T10:05:00.000Z",
              portalSyncStatus: "completed",
              portalSyncUpdatedAt: "2026-04-10T10:06:00.000Z",
            },
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

    render(<DesktopReleasePanel variant="dashboard" enabled />);

    expect(
      screen.getByText("dashboard:desktopReleases.admin.build.progress.running"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/desktop-releases/builds/123/status",
        expect.objectContaining({
          credentials: "include",
        }),
      );
    });

    expect(
      await screen.findByText("dashboard:desktopReleases.admin.build.progress.completed"),
    ).toBeInTheDocument();

    expect(JSON.parse(sessionStorage.getItem(BUILD_SESSION_KEY) ?? "{}")).toMatchObject({
      buildResult: {
        workflowRunId: "123",
      },
      buildRunStatus: {
        workflowRunStatus: "completed",
        portalSyncStatus: "completed",
      },
    });
  });

  it("shows background portal sync guidance and retries when publishing stalls", async () => {
    const queuedAt = new Date(Date.now() - 4 * 60_000).toISOString();
    const workflowRunUpdatedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const portalSyncUpdatedAt = new Date(Date.now() - 60_000).toISOString();
    const storedBuildResult: DesktopReleaseBuildResponse = {
      repository: "naibarn/SmartSpecPro",
      workflow: "desktop-release.yml",
      ref: "main",
      version: "0.1.2",
      platform: "windows",
      bundleMode: "on-demand",
      releaseNotes: "Ship portal sync fixes",
      queuedAt,
      workflowRunId: "456",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/456",
      workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
    };
    const storedBuildStatus: DesktopReleaseBuildRunStatus = {
      workflowRunId: "456",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/456",
      workflowRunStatus: "completed",
      workflowRunConclusion: "success",
      workflowRunUpdatedAt,
      portalSyncStatus: "syncing",
      portalSyncUpdatedAt,
      portalSyncError: "desktop_release_github_asset_not_found_windows",
      portalSyncAttempts: 2,
    };

    sessionStorage.setItem(
      BUILD_SESSION_KEY,
      JSON.stringify({
        buildResult: storedBuildResult,
        buildRunStatus: storedBuildStatus,
      }),
    );

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      const releaseResponse = maybeHandleDashboardReleaseRequest(href);
      if (releaseResponse) {
        return releaseResponse;
      }

      if (href.includes("/builds/456/status")) {
        return new Response(
          JSON.stringify({
            buildRun: storedBuildStatus,
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

    render(<DesktopReleasePanel variant="dashboard" enabled />);

    expect(
      await screen.findByText("dashboard:desktopReleases.admin.build.progress.publishing"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("dashboard:desktopReleases.admin.build.progress.backgroundNote"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("dashboard:desktopReleases.admin.build.progress.portalSyncRetrying"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("dashboard:desktopReleases.admin.build.progress.syncAttempt"),
    ).toBeInTheDocument();
  });

  it("hides portal sync retry alerts while the workflow is still running", async () => {
    const storedBuildResult: DesktopReleaseBuildResponse = {
      repository: "naibarn/SmartSpecPro",
      workflow: "desktop-release.yml",
      ref: "main",
      version: "0.1.3",
      platform: "windows",
      bundleMode: "e4b",
      releaseNotes: "Smart AI Hub - Alpha Version 0.1.3",
      queuedAt: "2026-04-10T01:00:00.000Z",
      workflowRunId: "777",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/777",
      workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
    };
    const storedBuildStatus: DesktopReleaseBuildRunStatus = {
      workflowRunId: "777",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/777",
      workflowRunStatus: "in_progress",
      workflowRunConclusion: null,
      workflowRunUpdatedAt: "2026-04-10T01:10:00.000Z",
      portalSyncStatus: "syncing",
      portalSyncUpdatedAt: "2026-04-10T01:11:00.000Z",
      portalSyncError: "desktop_release_github_release_not_ready",
      portalSyncAttempts: 4,
    };

    sessionStorage.setItem(
      BUILD_SESSION_KEY,
      JSON.stringify({
        buildResult: storedBuildResult,
        buildRunStatus: storedBuildStatus,
      }),
    );

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      const releaseResponse = maybeHandleDashboardReleaseRequest(href);
      if (releaseResponse) {
        return releaseResponse;
      }

      if (href.includes("/builds/777/status")) {
        return new Response(
          JSON.stringify({
            buildRun: storedBuildStatus,
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

    render(<DesktopReleasePanel variant="dashboard" enabled />);

    expect(
      await screen.findByText("dashboard:desktopReleases.admin.build.progress.running"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("dashboard:desktopReleases.admin.build.progress.portalSyncRetrying"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("dashboard:desktopReleases.admin.build.progress.error.releaseNotReady"),
    ).not.toBeInTheDocument();
  });

  it("marks an old portal sync as stalled instead of leaving it on publishing forever", async () => {
    const storedBuildResult: DesktopReleaseBuildResponse = {
      repository: "naibarn/SmartSpecPro",
      workflow: "desktop-release.yml",
      ref: "main",
      version: "0.1.0",
      platform: "windows",
      bundleMode: "on-demand",
      releaseNotes: "Old build still syncing",
      queuedAt: "2026-04-09T00:00:00.000Z",
      workflowRunId: "999",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/999",
      workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
    };
    const storedBuildStatus: DesktopReleaseBuildRunStatus = {
      workflowRunId: "999",
      workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/999",
      workflowRunStatus: "completed",
      workflowRunConclusion: "success",
      workflowRunUpdatedAt: "2026-04-09T00:10:00.000Z",
      portalSyncStatus: "idle",
      portalSyncUpdatedAt: "2026-04-09T00:10:00.000Z",
    };

    sessionStorage.setItem(
      BUILD_SESSION_KEY,
      JSON.stringify({
        buildResult: storedBuildResult,
        buildRunStatus: storedBuildStatus,
      }),
    );

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      const releaseResponse = maybeHandleDashboardReleaseRequest(href);
      if (releaseResponse) {
        return releaseResponse;
      }

      if (href.includes("/builds/999/status")) {
        return new Response(
          JSON.stringify({
            buildRun: storedBuildStatus,
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

    render(<DesktopReleasePanel variant="dashboard" enabled />);

    expect(
      await screen.findByText("dashboard:desktopReleases.admin.build.progress.stalled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("dashboard:desktopReleases.admin.build.progress.stalledNote"),
    ).toBeInTheDocument();
  });

  it("shows the Smart AI Hub Worker App dashboard download when a Windows installer is available", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/companion-extension/latest")) {
        return new Response(JSON.stringify({ generatedAt: "2026-04-10T10:00:00.000Z", release: null }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
      if (href.includes("/worker-app/latest")) {
        return new Response(
          JSON.stringify({
            generatedAt: "2026-04-10T10:00:00.000Z",
            release: {
              version: "0.1.0",
              fileName: "smart-ai-hub-worker-app-0.1.0-x64-setup.exe",
              fileSizeBytes: 2_100_000,
              updatedAt: "2026-04-10T10:00:00.000Z",
              downloadUrl: "/api/desktop-releases/worker-app/download",
              installerFormat: "exe",
            },
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

    render(<DesktopReleasePanel variant="dashboard" enabled />);

    expect(await screen.findByText("dashboard:desktopReleases.workerApp.title")).toBeInTheDocument();
    expect(screen.getByText(/smart-ai-hub-worker-app-0\.1\.0-x64-setup\.exe/)).toBeInTheDocument();
    const downloadLink = screen.getByRole("link", {
      name: /dashboard:desktopReleases\.workerApp\.download/,
    });
    expect(downloadLink).toHaveAttribute("href", "/api/desktop-releases/worker-app/download");
    expect(
      screen.queryByRole("link", { name: /dashboard:desktopReleases\.workerApp\.openJobs/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a collapsible build history with persisted run details", async () => {
    const buildHistory: DesktopReleaseBuildHistoryResponse = {
      generatedAt: "2026-04-10T10:10:00.000Z",
      builds: [
        {
          workflowRunId: "789",
          repository: "naibarn/SmartSpecPro",
          workflow: "desktop-release.yml",
          workflowUrl: "https://github.com/naibarn/SmartSpecPro/actions/workflows/desktop-release.yml",
          ref: "main",
          version: "0.1.3",
          platform: "windows",
          bundleMode: "on-demand",
          releaseNotes: "Ship build history entry",
          queuedAt: "2026-04-10T10:00:00.000Z",
          workflowRunUrl: "https://github.com/naibarn/SmartSpecPro/actions/runs/789",
          workflowRunStatus: "completed",
          workflowRunConclusion: "success",
          workflowRunUpdatedAt: "2026-04-10T10:05:00.000Z",
          portalSyncStatus: "completed",
          portalSyncUpdatedAt: "2026-04-10T10:06:00.000Z",
          portalSyncError: null,
          portalSyncAttempts: 1,
          uploadedPlatforms: ["windows"],
          recordUpdatedAt: "2026-04-10T10:07:00.000Z",
        },
      ],
    };

    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/builds/history")) {
        return new Response(JSON.stringify(buildHistory), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${href}`);
    });

    render(<DesktopReleasePanel variant="admin" enabled canTriggerBuild />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/desktop-releases/builds/history?limit=8",
        expect.objectContaining({
          credentials: "include",
        }),
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /dashboard:desktopReleases\.admin\.build\.history\.title/,
      }),
    );

    expect(await screen.findByText("Run #789")).toBeInTheDocument();
    expect(screen.getByText("dashboard:desktopReleases.admin.build.history.portalSync.completed")).toBeInTheDocument();
    expect(screen.getByText("dashboard:desktopReleases.admin.build.progress.completedBadge")).toBeInTheDocument();
  });
});
