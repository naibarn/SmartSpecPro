import { describe, expect, it, vi } from "vitest";

import { registerRunnerReleaseRoutes } from "../runnerReleases";

describe("Runner release route boundaries", () => {
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
});
