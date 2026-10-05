import { afterEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb }));

import {
  adoptExecutionSessionProjection,
  createExecutionSessionProjection,
  getSafeTaskControlSessionProjection,
  projectRunnerReceiptToExecutionSession,
  transitionExecutionSessionProjection,
} from "../runnerExecutionSessionService";

afterEach(() => {
  vi.unstubAllEnvs();
  getDb.mockClear();
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
});
