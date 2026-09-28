import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: getDbMock,
}));

vi.mock("../crypto", () => ({
  decrypt: (value: string) => value,
  encrypt: (value: string) => value,
}));

import {
  normalizeGithubToken,
  validateDesktopReleaseGithubAccess,
} from "../desktopReleaseSettings";

describe("desktopReleaseSettings GitHub access", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    });
  });

  it("normalizes pasted Bearer tokens and surrounding quotes", () => {
    expect(normalizeGithubToken('  Bearer "github_pat_test"  ')).toBe("github_pat_test");
  });

  it("checks repository, workflow, and release access without returning the token", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(validateDesktopReleaseGithubAccess({
      githubRepository: "naibarn/SmartSpecPro",
      githubWorkflow: "desktop-release.yml",
      githubToken: "github_pat_test",
    })).resolves.toEqual({
      repository: "naibarn/SmartSpecPro",
      workflow: "desktop-release.yml",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer github_pat_test",
      }),
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain("/releases?per_page=1");
  });

  it("returns a safe token error for GitHub 401 responses", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }));

    await expect(validateDesktopReleaseGithubAccess({
      githubRepository: "naibarn/SmartSpecPro",
      githubWorkflow: "desktop-release.yml",
      githubToken: "github_pat_invalid",
    })).rejects.toThrow("desktop_release_github_token_invalid");
  });
});
