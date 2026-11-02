import { describe, expect, it } from "vitest";

import { projectBinding } from "../ProjectExecutionWorkspace";

describe("ProjectExecutionWorkspace project binding", () => {
  it("reads the safe project binding returned by the DevelopmentRun list DTO", () => {
    expect(projectBinding({ projectId: "modular-core-project" })).toBe("modular-core-project");
  });

  it("reads the canonical project id persisted on the Goal metadata", () => {
    expect(projectBinding({
      metadata: {
        projectId: "modular-core-project",
        spec224Workspace: { workspace: "workspace-1" },
      },
    })).toBe("modular-core-project");
  });

  it("supports an explicit project binding on the workspace projection", () => {
    expect(projectBinding({
      metadata: { spec224Workspace: { projectId: "workspace-project" } },
    })).toBe("workspace-project");
  });
});
