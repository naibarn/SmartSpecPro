import { describe, expect, it } from "vitest";
import { safeWorkspaceIds } from "../runnerNodes";

describe("safeWorkspaceIds", () => {
  it("keeps bounded opaque workspace IDs and removes paths and duplicates", () => {
    expect(
      safeWorkspaceIds([
        "ws-project-a1b2c3",
        "ws-project-a1b2c3",
        "/home/user/project",
        "../outside",
        "C:\\private\\project",
        null,
        "workspace-legacy",
      ])
    ).toEqual(["ws-project-a1b2c3", "workspace-legacy"]);
  });

  it("caps the list at 64 and returns empty for malformed input", () => {
    expect(safeWorkspaceIds({ workspace: "ws-one" })).toEqual([]);
    expect(safeWorkspaceIds(Array.from({ length: 80 }, (_, index) => `ws-${index}`)))
      .toHaveLength(64);
  });
});
