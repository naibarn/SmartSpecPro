import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listDesktopReleaseCatalogMock = vi.hoisted(() => vi.fn());
const getCachedPublicAppUrlMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const originalEnv = {
  SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN: process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN,
  SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY: process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY,
  SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW: process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW,
  SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF: process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF,
  SMARTAIHUB_DESKTOP_PUBLIC_URL: process.env.SMARTAIHUB_DESKTOP_PUBLIC_URL,
};

vi.mock("../desktopReleaseService", () => ({
  listDesktopReleaseCatalog: listDesktopReleaseCatalogMock,
}));

vi.mock("../appRuntimeConfig", () => ({
  getCachedPublicAppUrl: getCachedPublicAppUrlMock,
}));

import {
  buildDesktopReleaseFromGithubAction,
  suggestDesktopReleaseBuildVersion,
} from "../desktopReleaseBuildService";

describe("desktopReleaseBuildService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    listDesktopReleaseCatalogMock.mockReset();
    getCachedPublicAppUrlMock.mockReset();

    getCachedPublicAppUrlMock.mockReturnValue("");
    listDesktopReleaseCatalogMock.mockResolvedValue({
      generatedAt: "2026-04-09T10:00:00.000Z",
      releases: [
        {
          version: "0.1.0",
        },
      ],
    });

    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN = "ghp_test_token";
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY = "naibarn/SmartSpecPro";
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW = "desktop-release.yml";
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF = "main";
    process.env.SMARTAIHUB_DESKTOP_PUBLIC_URL = "https://portal.smartaihub.app";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN = originalEnv.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN;
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY = originalEnv.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY;
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW = originalEnv.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW;
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF = originalEnv.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF;
    process.env.SMARTAIHUB_DESKTOP_PUBLIC_URL = originalEnv.SMARTAIHUB_DESKTOP_PUBLIC_URL;
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
        version: "0.1.1",
        tag: "v0.1.1",
        platform: "windows",
        bundle_mode: "e2b",
        web_url: "https://portal.smartaihub.app",
        release_notes: "Ship the build with fixes.",
      }),
    );
  });
});
