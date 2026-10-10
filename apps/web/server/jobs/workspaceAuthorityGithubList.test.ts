import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileAsync } = vi.hoisted(() => ({ execFileAsync: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:util", () => ({ promisify: () => execFileAsync }));

import { listOpenPullRequests } from "./workspaceAuthorityGithub";

describe("workspace authority owned PR discovery", () => {
  beforeEach(() => execFileAsync.mockReset());

  it("enriches a same-repository list result that omits mergeability", async () => {
    execFileAsync
      .mockResolvedValueOnce({ stdout: JSON.stringify([{
        number: 8, state: "open", draft: false,
        base: { ref: "main" },
        head: { ref: "task/example", sha: "a".repeat(40), repo: { full_name: "naibarn/SmartSpecPro" } },
      }]), stderr: "" })
      .mockResolvedValueOnce({ stdout: JSON.stringify({
        number: 8, state: "open", draft: false, mergeable: true, mergeable_state: "clean",
        base: { ref: "main" },
        head: { sha: "a".repeat(40), repo: { full_name: "naibarn/SmartSpecPro" } },
      }), stderr: "" });

    await expect(listOpenPullRequests("/repo", "naibarn/SmartSpecPro", "main")).resolves.toEqual([{
      number: 8, state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "task/example",
      headRefOid: "a".repeat(40), headRepository: "naibarn/SmartSpecPro", mergeable: true, mergeStateStatus: "CLEAN",
    }]);
    expect(execFileAsync).toHaveBeenCalledTimes(2);
    expect(execFileAsync.mock.calls[1]?.[1]).toEqual(["api", "repos/naibarn/SmartSpecPro/pulls/8"]);
  });

  it("does not promote stale-head or unavailable detail data to merge-ready", async () => {
    execFileAsync
      .mockResolvedValueOnce({ stdout: JSON.stringify([{
        number: 9, state: "open", draft: false,
        base: { ref: "main" },
        head: { ref: "task/stale", sha: "b".repeat(40), repo: { full_name: "naibarn/SmartSpecPro" } },
      }]), stderr: "" })
      .mockResolvedValueOnce({ stdout: JSON.stringify({
        number: 9, state: "open", draft: false, mergeable: true, mergeable_state: "clean",
        base: { ref: "main" },
        head: { sha: "c".repeat(40), repo: { full_name: "naibarn/SmartSpecPro" } },
      }), stderr: "" });

    await expect(listOpenPullRequests("/repo", "naibarn/SmartSpecPro", "main")).resolves.toEqual([]);
  });
});
