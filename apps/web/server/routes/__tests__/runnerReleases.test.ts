import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
const getDesktopRunnerArtifactDownloadMock = vi.hoisted(() => vi.fn());

vi.mock("../../_core/sdk", () => ({
  sdk: { authenticateRequest: authenticateRequestMock },
}));

vi.mock("../../services/runnerReleaseBuildService", () => ({
  getRunnerReleaseBuildStatus: vi.fn(),
  getDesktopRunnerArtifactDownload: getDesktopRunnerArtifactDownloadMock,
  listRunnerReleaseBuilds: vi.fn(),
  startRunnerReleaseBuild: vi.fn(),
  syncRunnerReleaseBuild: vi.fn(),
  RunnerReleaseBuildError: class RunnerReleaseBuildError extends Error {
    constructor(public readonly code: string, public readonly statusCode = 400) { super(code); }
  },
}));

import { registerRunnerReleaseRoutes } from "../runnerReleases";

describe("Runner release route boundaries", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    getDesktopRunnerArtifactDownloadMock.mockReset();
  });

  it("registers public catalog/download and admin-only build seams", () => {
    const routes: string[] = [];
    const app = {
      get: vi.fn((path: string) => routes.push(`GET ${path}`)),
      post: vi.fn((path: string) => routes.push(`POST ${path}`)),
    };
    registerRunnerReleaseRoutes(app as any);
    expect(routes).toContain("GET /api/runner-releases");
    expect(routes).toContain("GET /api/runner-releases/latest");
    expect(routes).toContain("GET /api/runner-releases/:id/download");
    expect(routes).toContain("POST /api/runner-releases/admin/builds");
    expect(routes).toContain("POST /api/runner-releases/admin/:id/withdraw");
    expect(routes.some(route => route.includes("github.com"))).toBe(false);
  });

  it.each([
    [null, 401, "runner_release_admin_auth_required"],
    [{ id: 42, role: "user" }, 403, "runner_release_admin_forbidden"],
  ])("rejects artifact downloads for non-admin users", async (user, status, error) => {
    authenticateRequestMock.mockResolvedValue(user);
    const routes = new Map<string, (...args: any[]) => Promise<void>>();
    const app = {
      get: vi.fn((path: string, ...handlers: Array<(...args: any[]) => unknown>) => routes.set(`GET ${path}`, handlers.at(-1) as (...args: any[]) => Promise<void>)),
      post: vi.fn(),
    };
    registerRunnerReleaseRoutes(app as any);
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await routes.get("GET /api/runner-releases/admin/builds/:buildId/artifacts/:artifactId")?.({
      params: { buildId: "build-1", artifactId: "123" },
    }, response as any);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({ error });
    expect(getDesktopRunnerArtifactDownloadMock).not.toHaveBeenCalled();
  });
});
