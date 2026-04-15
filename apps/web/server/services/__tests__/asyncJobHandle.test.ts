import { describe, it, expect } from "vitest";
import {
  buildBrowserTaskHandle,
  buildMediaJobHandle,
  buildSkillTaskHandle,
  buildWorkerJobHandle,
  shouldPollAsyncJobHandle,
} from "../asyncJobHandle";

describe("asyncJobHandle", () => {
  it("builds a terminal worker handle from a completed worker job", () => {
    const handle = buildWorkerJobHandle({
      id: "job-1",
      runtimeType: "openclaw_gateway",
      status: "completed",
      workflowRunId: "run-1",
      teamId: "team-1",
      roomId: "room-1",
      finishedAt: "2026-04-15T00:00:00.000Z",
    });

    expect(handle).toEqual(expect.objectContaining({
      kind: "worker",
      provider: "openclaw_gateway",
      status: "completed",
      terminal: true,
      workflowRunId: "run-1",
    }));
    expect(shouldPollAsyncJobHandle(handle)).toBe(false);
  });

  it("builds pollable media and skill handles with evidence refs", () => {
    const mediaHandle = buildMediaJobHandle({
      jobId: "media-1",
      status: "running",
      submittedAt: 123,
      nextPollAt: 456,
    });
    const skillHandle = buildSkillTaskHandle({
      taskId: "skill-1",
      status: "running",
      skillId: "general-article-writer",
      evidenceRefs: ["summary:artifact-1"],
    });
    const browserHandle = buildBrowserTaskHandle({
      taskId: "browser-1",
      status: "queued",
      claimId: "claim-1",
      executionId: "exec-1",
    });

    expect(mediaHandle.evidenceRefs).toEqual(["media-job:media-1"]);
    expect(skillHandle.evidenceRefs).toEqual(["summary:artifact-1"]);
    expect(browserHandle.evidenceRefs).toContain("browser-task:browser-1");
    expect(shouldPollAsyncJobHandle(mediaHandle)).toBe(true);
    expect(shouldPollAsyncJobHandle(skillHandle)).toBe(true);
    expect(shouldPollAsyncJobHandle(browserHandle)).toBe(true);
  });
});
