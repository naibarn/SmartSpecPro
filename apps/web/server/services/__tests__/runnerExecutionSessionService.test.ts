import { afterEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../db", () => ({ getDb }));

import {
  adoptExecutionSessionProjection,
  createExecutionSessionProjection,
  getSafeTaskControlSessionProjection,
  matchingTerminalExecutionSessionState,
  projectRunnerReceiptToExecutionSession,
  transitionExecutionSessionProjection,
} from "../runnerExecutionSessionService";

afterEach(() => {
  vi.unstubAllEnvs();
  getDb.mockClear();
});

describe("Spec 278 terminal status projection", () => {
  it.each([
    ["completed", "completed"],
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["expired", "failed"],
    ["canceled", "cancelled"],
    ["cancelled", "cancelled"],
  ])("maps canonical %s to %s", (jobStatus, sessionState) => {
    expect(matchingTerminalExecutionSessionState(jobStatus)).toBe(sessionState);
  });

  it("does not map active or unknown jobs to a terminal session state", () => {
    expect(matchingTerminalExecutionSessionState("running")).toBeNull();
    expect(matchingTerminalExecutionSessionState("future-status")).toBeNull();
  });
});

describe("Spec 278 projection feature gate", () => {
  it("keeps create, transition, adoption, receipt projection, and Task Control reads inert by default", async () => {
    vi.stubEnv("SMARTAIHUB_SPEC278_SESSION_PROJECTION", "false");

    await expect(createExecutionSessionProjection({} as never, {} as never)).resolves.toBeNull();
    await expect(transitionExecutionSessionProjection({} as never)).resolves.toBeNull();
    await expect(adoptExecutionSessionProjection({} as never)).resolves.toBeNull();
    await expect(projectRunnerReceiptToExecutionSession({
      tenantId: "tenant-1",
      runnerId: "runner-1",
      receipt: {
        jobId: "job-1",
        commandId: "command-1",
        eventId: "event-1",
        eventType: "EXECUTION_STARTED",
        sequence: 1,
        payload: { executionSession: { sessionId: "session-1" } },
      },
    })).resolves.toBeNull();
    await expect(getSafeTaskControlSessionProjection({
      tenantId: "tenant-1",
      userId: 7,
      workerJobId: "job-1",
    })).resolves.toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns a versioned Task Control DTO that never asserts live process state", async () => {
    vi.stubEnv("SMARTAIHUB_SPEC278_SESSION_PROJECTION", "true");
    const row = {
      sessionId: "session-1",
      generation: 2,
      continuityClass: "ephemeral",
      enforcementLevel: "COMMAND_ONLY",
      driverId: "codex.v1",
      observedAt: new Date("2026-10-05T00:00:00.000Z"),
    };
    const query = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([row]),
    };
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(query) });

    const projection = await getSafeTaskControlSessionProjection({
      tenantId: "tenant-1",
      userId: 7,
      workerJobId: "job-1",
    });

    expect(projection).toMatchObject({
      contractVersion: "spec278-session-v1",
      sessionId: "session-1",
      state: "unknown",
      observedAt: "2026-10-05T00:00:00.000Z",
    });
    expect(projection).not.toHaveProperty("pid");
  });
});
