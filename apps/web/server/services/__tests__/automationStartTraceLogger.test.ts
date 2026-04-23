import { beforeEach, describe, expect, it, vi } from "vitest";

const { appendFileSync } = vi.hoisted(() => ({
  appendFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    appendFileSync,
  },
  appendFileSync,
}));

import {
  logAutomationStartError,
  logAutomationStartTrace,
} from "../automationStartTraceLogger";

describe("automationStartTraceLogger", () => {
  beforeEach(() => {
    appendFileSync.mockClear();
  });

  it("writes trace records as JSON lines", () => {
    logAutomationStartTrace("kickoff.begin", {
      tenantId: "tenant-1",
      runId: "run-1",
    });

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const [, data, encoding] = appendFileSync.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(encoding).toBe("utf8");
    const parsed = JSON.parse(String(data).trim());
    expect(parsed).toMatchObject({
      category: "automation_start",
      step: "kickoff.begin",
      tenantId: "tenant-1",
      runId: "run-1",
    });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("writes structured errors", () => {
    logAutomationStartError("kickoff.room_create_failed", new Error("boom"), {
      tenantId: "tenant-1",
      runId: "run-1",
    });

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const [, data] = appendFileSync.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(String(data).trim());
    expect(parsed).toMatchObject({
      category: "automation_start",
      step: "kickoff.room_create_failed",
      tenantId: "tenant-1",
      runId: "run-1",
      error: {
        name: "Error",
        message: "boom",
      },
    });
  });
});
