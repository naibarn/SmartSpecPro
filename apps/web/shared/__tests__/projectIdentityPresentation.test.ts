import { describe, expect, it } from "vitest";
import {
  projectRunnerDisplayName,
  projectRunnerWorkspacePresentation,
  presentCustomerDiagnostic,
  presentCustomerError,
  sanitizePlatformDiagnostic,
} from "../projectIdentityPresentation";

const ownedWorkspace = {
  actorId: 7,
  ownerUserId: 7,
  runnerProfile: "local_device",
  nodeKind: "local_device",
  workspaceId: "ws-1",
  displayName: "SmartSpecPro",
  projectId: "project-1",
  repositoryId: "repo-1",
  gitHead: "a".repeat(40),
  gitBranch: "main",
  dirty: false,
};

describe("project identity presentation", () => {
  it("preserves a coincidentally named user-owned workspace and hides technical identity in Simple Mode", () => {
    expect(projectRunnerWorkspacePresentation({ ...ownedWorkspace, mode: "simple" })).toEqual({
      provenance: "user_owned",
      displayName: "SmartSpecPro",
    });
  });

  it("preserves user-owned Runner labels but replaces platform Runner labels", () => {
    expect(projectRunnerDisplayName({
      actorId: 7,
      ownerUserId: 7,
      runnerProfile: "local_device",
      nodeKind: "local_device",
      displayName: "SmartSpecPro",
    })).toBe("SmartSpecPro");
    expect(projectRunnerDisplayName({
      actorId: 7,
      ownerUserId: null,
      runnerProfile: "shared_container",
      nodeKind: "managed_container",
      displayName: "SmartSpecPro internal runner",
    })).toBe("SmartAIHub Runner");
  });

  it("shows authorized user-owned identity in Developer Mode", () => {
    expect(projectRunnerWorkspacePresentation({ ...ownedWorkspace, mode: "developer" })).toMatchObject({
      provenance: "user_owned",
      displayName: "SmartSpecPro",
      workspaceId: "ws-1",
      projectId: "project-1",
      repositoryId: "repo-1",
      gitHead: "a".repeat(40),
      gitBranch: "main",
      dirty: false,
    });
  });

  it("withholds platform identities in both modes", () => {
    for (const mode of ["simple", "developer"] as const) {
      expect(projectRunnerWorkspacePresentation({
        ...ownedWorkspace,
        ownerUserId: null,
        runnerProfile: "shared_container",
        nodeKind: "managed_container",
        mode,
      })).toEqual({ provenance: "platform_internal", displayName: "Runner workspace" });
    }
  });

  it("scrubs system diagnostic paths and legacy brands without touching user project labels", () => {
    expect(sanitizePlatformDiagnostic("SmartSpecPro failed at /home/dev/projects/SmartSpecPro/run.js"))
      .toBe("SmartAIHub failed at [filesystem path]");
    expect(sanitizePlatformDiagnostic("SMART-SPEC_PRO returned an error"))
      .toBe("SmartAIHub returned an error");
    expect(projectRunnerWorkspacePresentation({ ...ownedWorkspace, mode: "simple" }).displayName)
      .toBe("SmartSpecPro");
    expect(presentCustomerError(new Error("SmartSpecPro could not read /mnt/SmartSpecDev/projects/SmartSpecPro/file.ts"), "Failed"))
      .toBe("SmartAIHub could not read [filesystem path]");
  });

  it("redacts credential-like values from customer diagnostics", () => {
    expect(sanitizePlatformDiagnostic("Smart Spec API key=sk-live_1234567890 Bearer abc.def.ghi"))
      .toBe("SmartAIHub API key=[redacted] Bearer [redacted]");
    expect(presentCustomerDiagnostic(
      "SmartSpecPro failed at /srv/smartspec/private.ts with api_key=abc123",
      "Failed",
    )).toBe("SmartAIHub failed at [filesystem path] with api_key=[redacted]");
  });
});
