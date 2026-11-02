import { describe, expect, it } from "vitest";

import { findGoalWorkerJob, projectBinding } from "../ProjectExecutionWorkspace";

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

describe("ProjectExecutionWorkspace goal job binding", () => {
  it("finds the linked job even when it belongs to a different project group", () => {
    const goal = { workerJobId: "job-312" };
    const jobs = [
      { id: "job-other", projectId: "project-a" },
      { id: "job-312", projectId: "project-b" },
    ];

    expect(findGoalWorkerJob(goal, jobs)).toBe(jobs[1]);
  });

  it("returns no job only when the Goal has no linked job or it is absent", () => {
    expect(findGoalWorkerJob({ workerJobId: "job-missing" }, [])).toBeNull();
    expect(findGoalWorkerJob({ workerJobId: null }, [{ id: "job-1" }])).toBeNull();
  });
});
