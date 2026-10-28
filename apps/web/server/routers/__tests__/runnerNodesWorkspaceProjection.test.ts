import { describe, expect, it } from "vitest";
import { safeRunWorkspaceFacts, safeWorkspaceFacts, safeWorkspaceIds } from "../runnerNodes";

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

describe("safeWorkspaceFacts", () => {
  it("projects bounded Git status facts only for registered workspace IDs", () => {
    expect(safeWorkspaceFacts([
      {
        workspaceId: "ws-project-a1b2c3",
        projectId: "project-a",
        repositoryId: "owner/repository",
        rootId: "root-projects-abcdef123456",
        kind: "project",
        displayName: "SmartSpecPro",
        gitHead: "a".repeat(40),
        gitBranch: "feature/workspace-status",
        dirty: true,
        dirtyPaths: ["apps/web/src/app.ts"],
        taskId: "task-42",
        convergenceState: "USER_WORKSPACE_CONVERGED",
        convergenceCanonicalSha: "c".repeat(40),
        localPath: "/home/private/project",
      },
      {
        workspaceId: "ws-unregistered",
        displayName: "Ignored",
        gitHead: "b".repeat(40),
        gitBranch: "main",
        dirty: false,
      },
      {
        workspaceId: "workspace-legacy",
        displayName: "Malformed Git facts",
        projectId: "org/project",
        repositoryId: "https://token@github.com/org/repository",
        gitHead: "remote:https://private.example/repo",
        gitBranch: "origin/https://private.example/repo",
        dirty: "unknown",
      },
    ], ["ws-project-a1b2c3", "workspace-legacy"])).toEqual([
      {
        workspaceId: "ws-project-a1b2c3",
        projectId: "project-a",
        repositoryId: "owner/repository",
        rootId: "root-projects-abcdef123456",
        kind: "project",
        displayName: "SmartSpecPro",
        gitHead: "a".repeat(40),
        gitBranch: "feature/workspace-status",
        dirty: true,
        dirtyPaths: ["apps/web/src/app.ts"],
        taskId: "task-42",
        convergenceState: "USER_WORKSPACE_CONVERGED",
        convergenceCanonicalSha: "c".repeat(40),
      },
      {
        workspaceId: "workspace-legacy",
        projectId: "org/project",
        repositoryId: null,
        rootId: null,
        kind: null,
        displayName: "Malformed Git facts",
        gitHead: null,
        gitBranch: null,
        dirty: null,
        dirtyPaths: null,
        taskId: null,
        convergenceState: "NOT_REPORTED",
        convergenceCanonicalSha: null,
      },
    ]);
  });
});

describe("safeRunWorkspaceFacts", () => {
  it("keeps bounded run identity and lifecycle while dropping paths and malformed rows", () => {
    expect(safeRunWorkspaceFacts([
      { workspaceId: "run-1", runId: "job-1", attemptId: 2, sourceWorkspaceId: "ws-1", projectId: "project-1", lifecycle: "ACTIVE", localPath: "C:\\private" },
      { workspaceId: "run-2", runId: "../escape", attemptId: 1, sourceWorkspaceId: "ws-1", lifecycle: "ACTIVE" },
      { workspaceId: "run-3", runId: "job-3", attemptId: 0, sourceWorkspaceId: "ws-1", lifecycle: "ACTIVE" },
      { workspaceId: "run-4", runId: "job-4", attemptId: 1, sourceWorkspaceId: "ws-1", lifecycle: "UNKNOWN" },
    ])).toEqual([{
      workspaceId: "run-1",
      runId: "job-1",
      attemptId: 2,
      sourceWorkspaceId: "ws-1",
      projectId: "project-1",
      lifecycle: "ACTIVE",
    }]);
    expect(safeRunWorkspaceFacts([
      { workspaceId: "run-1", runId: "job-1", attemptId: 2, sourceWorkspaceId: "ws-1", projectId: "project-other", lifecycle: "ACTIVE" },
    ], [{
      workspaceId: "ws-1", projectId: "project-1", repositoryId: null, rootId: null, kind: "project",
      displayName: "Project", gitHead: null, gitBranch: null, dirty: null, taskId: null,
      dirtyPaths: null,
      convergenceState: "NOT_REPORTED", convergenceCanonicalSha: null,
    }])).toEqual([]);
  });
});
